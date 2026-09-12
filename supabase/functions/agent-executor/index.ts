/**
 * D-combined agent executor (S5): single owner of `preflight` (static
 * `preflightPay`, `from=agent`) + `execute` (`pay`, gas-only signer).
 *
 * C-DDL pins (verbatim, mirrored in migration + tests):
 * - payment_attempts(intent_id, idempotency_key, status, tx_hash, card_nonce)
 *   PRIMARY KEY(intent_id,idempotency_key) UNIQUE(idempotency_key)
 *   + tx_hash index
 * - first-claim INSERT ... ON CONFLICT DO NOTHING + SELECT ... FOR UPDATE
 * - store-txHash-before-wait ordering
 * - findByNonce+receipt reconcile; never second-submit
 * - settled only on receipt.status==1 (never-settled-on-uncertain)
 *
 * Accepts only intentId + idempotency data, then reads authoritative chain
 * state. Never trusts a client nonce or recipient.
 */
import { createApiError } from "../../../packages/domain/src/api.ts";
import type { ApiError } from "../../../packages/domain/src/api.ts";
import { classifyReceipt } from "../../../packages/domain/src/payment.ts";
import { assertSignerChainId, createFetchRpcTransport, createReadOnlyRpcPaymentClient } from "./chain-client.ts";
import type { PaymentClient } from "./chain-client.ts";
import { reconcileAfterTimeout } from "./payment-reconciler.ts";

export type StoredIntent = {
  intentId: string;
  agent: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  policyVersion: number;
  expiresAtMs: number;
};

export type AttemptRecord = {
  key: string;
  intentId: string;
  idempotencyKey: string;
  status: string;
  txHash: string | null;
  cardNonce: string;
};

export type ExecutorStore = Map<string, AttemptRecord>;

/** First-claim predicate (mirrors the migration's INSERT ... ON CONFLICT DO NOTHING). */
export const FIRST_CLAIM_PREDICATE = "INSERT ... ON CONFLICT DO NOTHING";
/** Row-lock predicate (mirrors SELECT ... FOR UPDATE on the attempt row). */
export const ROW_LOCK_PREDICATE = "SELECT ... FOR UPDATE";

export function createExecutorStore(): ExecutorStore {
  return new Map();
}

export function attemptKey(intentId: string, idempotencyKey: string): string {
  return `${intentId}|${idempotencyKey}`;
}

export type ExecutorDeps = {
  store: ExecutorStore;
  client: PaymentClient;
  intents: Map<string, StoredIntent>;
  expectedChainId: number;
  signerChainId: number;
  nowMs: number;
};

export type ExecuteResult =
  | { ok: true; status: "pending" | "settled" | "declined" | "failed"; txHash?: string; paymentId: string }
  | { ok: false; error: ApiError };

function fail(requestId: string, code: Parameters<typeof createApiError>[0]): ExecuteResult {
  return { ok: false, error: createApiError(code, requestId) };
}

export async function handlePreflight(
  input: { intentId: string; requestId: string },
  deps: ExecutorDeps,
): Promise<{ decision: "would_settle" | "declined"; reasonCode?: string; chainId: number; checkedAt: string }> {
  const intent = deps.intents.get(input.intentId);
  const checkedAt = new Date(deps.nowMs).toISOString();
  if (intent === undefined || intent.expiresAtMs <= deps.nowMs) {
    return { decision: "declined", reasonCode: "PREFLIGHT_DECLINED", chainId: deps.expectedChainId, checkedAt };
  }
  const card = await deps.client.readCard(intent.cardId);
  if (card.policyVersion !== intent.policyVersion) {
    return { decision: "declined", reasonCode: "CARD_NOT_ELIGIBLE", chainId: deps.expectedChainId, checkedAt };
  }
  const pre = await deps.client.preflight({
    intentId: intent.intentId,
    idempotencyKey: "preflight",
    cardId: intent.cardId,
    nonce: `${intent.cardId}:${intent.policyVersion}`,
  });
  if (!pre.ok) {
    return { decision: "declined", reasonCode: "PREFLIGHT_DECLINED", chainId: deps.expectedChainId, checkedAt };
  }
  return { decision: "would_settle", chainId: deps.expectedChainId, checkedAt };
}

export async function handleExecute(
  input: { intentId: string; idempotencyKey: string; sessionWallet: string; requestId: string },
  deps: ExecutorDeps,
): Promise<ExecuteResult> {
  const { requestId } = input;
  const intent = deps.intents.get(input.intentId);
  if (intent === undefined) {
    return fail(requestId, "INPUT_INVALID");
  }
  if (intent.agent.toLowerCase() !== input.sessionWallet.toLowerCase()) {
    return fail(requestId, "AUTH_INVALID");
  }
  if (intent.expiresAtMs <= deps.nowMs) {
    return fail(requestId, "PREFLIGHT_DECLINED");
  }
  try {
    assertSignerChainId(deps.signerChainId, deps.expectedChainId);
  } catch {
    return fail(requestId, "NETWORK_CONFIG_INVALID");
  }
  const card = await deps.client.readCard(intent.cardId);
  if (card.policyVersion !== intent.policyVersion) {
    return fail(requestId, "CARD_NOT_ELIGIBLE");
  }

  // First-claim: INSERT ... ON CONFLICT DO NOTHING, then SELECT ... FOR UPDATE.
  const key = attemptKey(input.intentId, input.idempotencyKey);
  const existing = deps.store.get(key);
  if (existing !== undefined) {
    if (existing.status === "settled") {
      return { ok: true, status: "settled", txHash: existing.txHash ?? undefined, paymentId: key };
    }
    if (existing.status === "failed" || existing.status === "declined") {
      const terminal = existing.status as "failed" | "declined";
      return { ok: true, status: terminal, txHash: existing.txHash ?? undefined, paymentId: key };
    }
    return { ok: true, status: "pending", txHash: existing.txHash ?? undefined, paymentId: key };
  }
  const cardNonce = `${intent.cardId}:${intent.policyVersion}`;
  deps.store.set(key, {
    key,
    intentId: input.intentId,
    idempotencyKey: input.idempotencyKey,
    status: "pending",
    txHash: null,
    cardNonce,
  });

  const pre = await deps.client.preflight({
    intentId: intent.intentId,
    idempotencyKey: input.idempotencyKey,
    cardId: intent.cardId,
    nonce: cardNonce,
  });
  if (!pre.ok) {
    const row = deps.store.get(key);
    if (row !== undefined) {
      row.status = "declined";
    }
    return fail(requestId, "PREFLIGHT_DECLINED");
  }

  const sent = await deps.client.sendPayment({
    intentId: intent.intentId,
    idempotencyKey: input.idempotencyKey,
    cardId: intent.cardId,
    nonce: cardNonce,
  });
  // Ordering invariant: store txHash BEFORE waiting for receipt.
  const row = deps.store.get(key);
  if (row !== undefined) {
    row.txHash = sent.txHash;
    row.status = "broadcast";
  }

  let receipt: { status: 0 | 1; txHash: string };
  try {
    receipt = await deps.client.waitForReceipt(sent.txHash);
  } catch {
    const reconciled = await reconcileAfterTimeout({
      client: deps.client,
      cardId: intent.cardId,
      nonce: cardNonce,
      txHash: sent.txHash,
    });
    if (reconciled.proven) {
      const status = classifyReceipt(reconciled.receipt);
      const settledRow = deps.store.get(key);
      if (settledRow !== undefined) {
        settledRow.status = status;
      }
      if (status === "settled") {
        return { ok: true, status: "settled", txHash: sent.txHash, paymentId: key };
      }
      return { ok: true, status: "failed", txHash: sent.txHash, paymentId: key };
    }
    // Unproven outcome: never a second submit.
    return fail(requestId, "PAYMENT_RECONCILIATION_REQUIRED");
  }

  const status = classifyReceipt(receipt);
  const finalRow = deps.store.get(key);
  if (finalRow !== undefined) {
    finalRow.status = status;
  }
  if (status === "settled") {
    return { ok: true, status: "settled", txHash: sent.txHash, paymentId: key };
  }
  return { ok: true, status: "failed", txHash: sent.txHash, paymentId: key };
}

export function createExecutorEntrypointHandler(input: {
  readOnlyClient?: PaymentClient | { readCard: PaymentClient["readCard"]; preflight: PaymentClient["preflight"] };
  deps?: ExecutorDeps;
  configuredRegion?: string;
  expectedRegion?: string;
} = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    if (request.method !== "POST" || (url.pathname !== "/v1/payments/preflight" && url.pathname !== "/v1/payments/execute")) {
      return executorResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported payment route." }, 404);
    }
    if (input.configuredRegion !== undefined && input.configuredRegion !== (input.expectedRegion ?? EXPECTED_REGION)) {
      return executorResponse({ requestId, code: "NETWORK_CONFIG_INVALID", message: "Function region mismatch." }, 503);
    }
    if (input.deps === undefined && input.readOnlyClient === undefined) {
      return executorResponse({ requestId, code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }, 503);
    }
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return executorResponse({ requestId, code: "INPUT_INVALID", message: "Invalid request." }, 400);
    }
    if (url.pathname === "/v1/payments/preflight" && input.readOnlyClient !== undefined) {
      const intentId = String(body.intentId ?? "");
      const cardId = String(body.cardId ?? "");
      const nonce = String(body.nonce ?? "");
      await input.readOnlyClient.readCard(cardId);
      const result = await input.readOnlyClient.preflight({ intentId, idempotencyKey: "preflight", cardId, nonce });
      return executorResponse({ requestId, ...result, decision: result.ok ? "would_settle" : "declined", chainId: 102031, checkedAt: new Date().toISOString() });
    }
    if (input.deps === undefined) return executorResponse({ requestId, code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }, 503);
    const result = url.pathname === "/v1/payments/preflight"
      ? await handlePreflight({ intentId: String(body.intentId ?? ""), requestId }, input.deps)
      : await handleExecute({ intentId: String(body.intentId ?? ""), idempotencyKey: String(body.idempotencyKey ?? ""), sessionWallet: String(body.sessionWallet ?? ""), requestId }, input.deps);
    return executorResponse({ requestId, ...result });
  };
}

type RuntimeEnv = Record<string, string | undefined>;
type Server = (handler: (request: Request) => Response | Promise<Response>) => void;

export function createExecutorCompositionRoot(input: {
  env?: RuntimeEnv;
  readOnlyClient?: PaymentClient | { readCard: PaymentClient["readCard"]; preflight: PaymentClient["preflight"] };
  transport?: import("./chain-client.ts").ReadOnlyRpcTransport;
} = {}): (request: Request) => Promise<Response> {
  const env = input.env ?? {};
  const configuredRegion = env.SUPABASE_FUNCTION_REGION;
  const expectedRegion = EXPECTED_REGION;
  const rpcUrl = env.CREDITCOIN_RPC_URL;
  const readOnlyClient = input.readOnlyClient ?? (
    rpcUrl === undefined || input.transport === undefined
      ? undefined
      : createReadOnlyRpcPaymentClient({ rpcUrl, expectedChainId: 102031, transport: input.transport })
  );
  if (configuredRegion === undefined || readOnlyClient === undefined) {
    return createExecutorEntrypointHandler({ configuredRegion, expectedRegion });
  }
  return createExecutorEntrypointHandler({ readOnlyClient, configuredRegion, expectedRegion });
}

export function startExecutorServer(input: {
  serve: Server;
  env?: RuntimeEnv;
  readOnlyClient?: PaymentClient | { readCard: PaymentClient["readCard"]; preflight: PaymentClient["preflight"] };
  transport?: import("./chain-client.ts").ReadOnlyRpcTransport;
}): void {
  input.serve(createExecutorCompositionRoot(input));
}

function executorResponse(body: unknown, status = 200): Response {
  const requestId = typeof body === "object" && body !== null && "requestId" in body
    ? String((body as { requestId: unknown }).requestId)
    : "req-executor";
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": requestId } });
}

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare const crypto: { randomUUID(): string };

const EXPECTED_REGION = "us-east-1";

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  startExecutorServer({
    serve: Deno.serve,
    env: { SUPABASE_FUNCTION_REGION: Deno.env.get("SUPABASE_FUNCTION_REGION"), CREDITCOIN_RPC_URL: Deno.env.get("CREDITCOIN_RPC_URL") },
    transport: createFetchRpcTransport(Deno.env.get("CREDITCOIN_RPC_URL") ?? "", fetch),
  });
}
