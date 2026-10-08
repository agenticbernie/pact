/**
 * Phase 05 read API.
 *
 * Owner-scoped, read-only view over the Phase 05 read model:
 *   GET /v1/config                     (public: chain + contract + freshness)
 *   GET /v1/cards/:cardId              (wallet-bound session required)
 *   GET /v1/cards/:cardId/activity     (wallet-bound session required)
 *   GET /v1/payments/:paymentId        (wallet-bound session required)
 *
 * Truth rule (AC-14): a payment is reported `settled` ONLY when a successful
 * on-chain receipt AND a matching indexed PaymentSettled event are both
 * present; otherwise it is pending/failed/uncertain with a reason code. A
 * database row or an executor response can never produce `settled` on its own.
 *
 * The handler is pure over injected deps (`store`, `receiptLookup`) so tests
 * run without a database or RPC; the composition root (`startReadApiServer`)
 * wires the Neon store and the ethers receipt reader.
 */
import { createApiError, toApiError } from "../_shared/api.ts";
import { requireSession, type SessionContext } from "../_shared/auth.ts";
import {
  deriveReceiptTruth,
  type ReceiptTruth,
} from "../../../packages/domain/src/read-model.ts";
import type { ReadStore } from "./read-store.ts";

export type ReadApiDeps = {
  store: ReadStore;
  chainId: number;
  controller: string;
  pool: string;
  merchant: string;
  explorerUrl: string;
  sessionSecret: string;
  receiptLookup?: (txHash: string) => Promise<{ status: 0 | 1 } | null>;
  now?: () => number;
};

const CARD_ID = /^(0|[1-9][0-9]*)$/;
const ACTIVITY_LIMIT = 50;

export function createReadApiHandler(deps: ReadApiDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? (() => Date.now());
  const origin = deps.explorerUrl.replace(/\/+$/, "");

  function json(body: unknown, status: number, requestId: string): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", "x-request-id": requestId },
    });
  }

  function fail(error: unknown, requestId: string): Response {
    const apiError = toApiError(error, requestId);
    const authFailure =
      apiError.code === "AUTH_REQUIRED" ||
      apiError.code === "AUTH_INVALID" ||
      apiError.code === "AUTH_EXPIRED";
    return json(apiError, authFailure ? 401 : 400, requestId);
  }

  function session(request: Request, requestId: string): SessionContext | Response {
    try {
      return requireSession({
        authorization: request.headers.get("authorization") ?? undefined,
        secret: deps.sessionSecret,
        nowMs: now(),
      });
    } catch (error) {
      return fail(error, requestId);
    }
  }

  async function freshness(): Promise<number | null> {
    return deps.store.latestIndexedBlock(deps.chainId);
  }

  async function cardRoute(cardId: string, request: Request, requestId: string): Promise<Response> {
    if (!CARD_ID.test(cardId)) return json(createApiError("INPUT_INVALID", requestId), 400, requestId);
    const ctx = session(request, requestId);
    if (ctx instanceof Response) return ctx;
    const latest = await freshness();
    const card = await deps.store.getCard(cardId, ctx.wallet);
    if (card === null) return json(createApiError("INPUT_INVALID", requestId), 404, requestId);
    return json(
      {
        requestId,
        card,
        latestIndexedBlock: latest,
        stale: latest === null,
        chainReadAt: new Date(now()).toISOString(),
      },
      200,
      requestId,
    );
  }

  async function activityRoute(cardId: string, request: Request, requestId: string): Promise<Response> {
    if (!CARD_ID.test(cardId)) return json(createApiError("INPUT_INVALID", requestId), 400, requestId);
    const ctx = session(request, requestId);
    if (ctx instanceof Response) return ctx;
    const latest = await freshness();
    const items = await deps.store.listActivity(deps.chainId, cardId, ACTIVITY_LIMIT);
    return json(
      {
        requestId,
        cardId,
        latestIndexedBlock: latest,
        stale: latest === null,
        items,
      },
      200,
      requestId,
    );
  }

  async function paymentRoute(paymentId: string, request: Request, requestId: string): Promise<Response> {
    if (paymentId.length === 0 || paymentId.length > 128) {
      return json(createApiError("INPUT_INVALID", requestId), 400, requestId);
    }
    const ctx = session(request, requestId);
    if (ctx instanceof Response) return ctx;
    const attempt = await deps.store.getPayment(paymentId, ctx.wallet);
    if (attempt === null) return json(createApiError("INPUT_INVALID", requestId), 404, requestId);

    const latest = await freshness();
    const txHash = attempt.txHash;
    let receiptStatus: 0 | 1 | null = null;
    if (txHash !== undefined && deps.receiptLookup !== undefined) {
      const receipt = await deps.receiptLookup(txHash);
      if (receipt !== null) receiptStatus = receipt.status;
    }
    const indexedPaymentEvent =
      txHash === undefined ? false : await deps.store.hasIndexedPaymentEvent(deps.chainId, txHash);

    let truth: ReceiptTruth = deriveReceiptTruth({
      receiptStatus,
      indexedPaymentEvent,
      latestIndexedBlock: latest ?? 0,
      ...(txHash === undefined ? {} : { txHash }),
      ...(txHash === undefined ? {} : { explorerUrl: `${origin}/tx/${txHash}` }),
    });
    if (attempt.status === "declined") {
      truth = { ...truth, status: "declined", reasonCode: "PREFLIGHT_DECLINED" };
    }

    return json(
      {
        requestId,
        paymentId,
        intentId: attempt.intentId,
        cardId: attempt.cardId,
        merchantId: attempt.merchantId,
        amountBaseUnits: attempt.amountBaseUnits,
        asset: attempt.asset,
        chainId: attempt.chainId,
        ...truth,
      },
      200,
      requestId,
    );
  }

  return async function handler(request: Request): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    let path: string;
    try {
      path = new URL(request.url).pathname;
    } catch {
      return json(createApiError("INPUT_INVALID", requestId), 400, requestId);
    }
    if (request.method !== "GET") {
      return json(createApiError("INPUT_INVALID", requestId), 400, requestId);
    }

    if (path === "/v1/config") {
      return json(
        {
          requestId,
          chainId: deps.chainId,
          controller: deps.controller,
          pool: deps.pool,
          merchant: deps.merchant,
          explorerUrl: origin,
          latestIndexedBlock: await freshness(),
        },
        200,
        requestId,
      );
    }

    const activity = /^\/v1\/cards\/([^/]+)\/activity$/.exec(path);
    if (activity !== null) return activityRoute(activity[1], request, requestId);

    const card = /^\/v1\/cards\/([^/]+)$/.exec(path);
    if (card !== null) return cardRoute(card[1], request, requestId);

    const payment = /^\/v1\/payments\/([^/]+)$/.exec(path);
    if (payment !== null) return paymentRoute(payment[1], request, requestId);

    return json(createApiError("INPUT_INVALID", requestId), 404, requestId);
  };
}

export function startReadApiServer(
  input: ReadApiDeps & { serve: (handler: (request: Request) => Promise<Response>) => void },
): void {
  input.serve(createReadApiHandler(input));
}
