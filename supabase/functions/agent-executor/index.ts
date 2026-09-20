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
import { normalizeFunctionPath } from "../_shared/path-prefix.ts";
import { classifyReceipt } from "../../../packages/domain/src/payment.ts";
import { assertSignerChainId, createFetchRpcTransport, createReadOnlyRpcPaymentClient } from "./chain-client.ts";
import type { PaymentClient, ReadOnlyRpcPaymentClient, ReadOnlyRpcTransport } from "./chain-client.ts";
import { reconcileAfterTimeout } from "./payment-reconciler.ts";
import { requireSession } from "../_shared/auth.ts";
import { hashToken } from "../_shared/session-token.ts";
import { toApiError } from "../_shared/errors.ts";
import {
  createPostgrestPersistenceFromEnv,
  type PostgrestPersistence,
} from "../_shared/persistence-composition.ts";
import type { SessionPersistence } from "../session/index.ts";
import type { IntentStoreAdapter } from "../_shared/intent-store.ts";
import type { CardStore } from "../_shared/card-store.ts";
import { regionsMatch, resolveRegionConfig } from "../_shared/region-config.ts";
import {
  resolveLane,
  type LaneConfig,
  type LaneSelection,
} from "../_shared/lane-config.ts";
import {
  buildH2ValidationRecord,
  createArcCard1OwnerRegistry,
  validateOwnerAuthorization,
  type H2ValidationRecord,
  type OwnerAuthorization,
  type OwnerAuthorizationRegistry,
} from "../_shared/owner-authorization.ts";

export type StoredIntent = {
  intentId: string;
  agent: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset?: "native-testnet-ctc" | "arc-testnet-usdc";
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
  actualRegion?: string;
  sessionSecret?: string;
  sessionPersistence?: SessionPersistence;
  readOnlyComposition?: ReadOnlyComposition;
  /** Execution lane. Injectable seam defaults legacy; production passes Arc. */
  lane?: LaneSelection | LaneConfig;
} = {}): (request: Request) => Promise<Response> {
  const lane = resolveLane(input.lane);
  return async (request) => {
    const url = new URL(request.url);
    const receivedPathname = url.pathname;
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const normalized = normalizeFunctionPath(receivedPathname, "agent-executor");
    if (!normalized.ok) {
      return executorResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported payment route." }, 404);
    }
    const path = normalized.path;
    if (request.method !== "POST" || (path !== "/v1/payments/preflight" && path !== "/v1/payments/execute")) {
      return executorResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported payment route." }, 404);
    }
    // Validity-only region gate (no equality): the authoritative project
    // region and the observed runtime region are separate facts. The old
    // `configuredRegion !== actualRegion` comparison is removed — it was
    // vacuous (observed-vs-observed) and would false-mismatch now that the
    // configured value is authoritative.
    if (!regionsMatch(input.expectedRegion, input.actualRegion)) {
      return executorResponse({ requestId, code: "NETWORK_CONFIG_INVALID", message: "Function region mismatch." }, 503);
    }
    if (input.deps === undefined && input.readOnlyClient === undefined && input.readOnlyComposition === undefined) {
      return executorResponse({ requestId, code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }, 503);
    }
    let sessionWallet: string | undefined;
    if (input.sessionSecret !== undefined) {
      try {
        const session = requireSession({
          authorization: request.headers.get("authorization") ?? undefined,
          secret: input.sessionSecret,
        });
        sessionWallet = session.wallet;
      } catch (error) {
        return executorResponse(toApiError(error, requestId), 401);
      }
      if (input.sessionPersistence !== undefined) {
        const token = request.headers.get("authorization")?.slice("Bearer ".length) ?? "";
        try {
          const stored = await input.sessionPersistence.findSession(hashToken(token), sessionWallet);
          if (stored === null) throw new Error("Authentication is invalid.");
        } catch (error) {
          if (error instanceof Error && error.message === "Authentication is invalid.") {
            return executorResponse({ requestId, code: "AUTH_INVALID", message: "Authentication is invalid." }, 401);
          }
          return executorResponse({ requestId, code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }, 503);
        }
      }
    }
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return executorResponse({ requestId, code: "INPUT_INVALID", message: "Invalid request." }, 400);
    }
    if (path === "/v1/payments/preflight" && input.readOnlyComposition !== undefined) {
      if (sessionWallet === undefined) {
        return executorResponse({ requestId, code: "AUTH_REQUIRED", message: "Authentication is required." }, 401);
      }
      try {
        const result = await handleReadOnlyPreflight(
          { intentId: String(body.intentId ?? ""), requestId, sessionWallet },
          { ...input.readOnlyComposition, lane },
        );
        // PVL evidence stays server-side: the HTTP envelope keeps exactly
        // requestId/intentId/decision/reasonCode?/chainId/checkedAt.
        const { requestId: rid, intentId: iid, decision, reasonCode, chainId, checkedAt: at } = result;
        return executorResponse({
          requestId: rid,
          intentId: iid,
          decision,
          ...(reasonCode === undefined ? {} : { reasonCode }),
          chainId,
          checkedAt: at,
        });
      } catch (error) {
        const mapped = toApiError(error, requestId);
        return executorResponse({
          requestId,
          code: mapped.code === "NETWORK_CONFIG_INVALID" ? mapped.code : "PREFLIGHT_DECLINED",
          message: mapped.message,
        }, 503);
      }
    }
    if (path === "/v1/payments/preflight" && input.readOnlyClient !== undefined) {
      const intentId = String(body.intentId ?? "");
      const cardId = String(body.cardId ?? "");
      const nonce = String(body.nonce ?? "");
      await input.readOnlyClient.readCard(cardId);
      const result = await input.readOnlyClient.preflight({ intentId, idempotencyKey: "preflight", cardId, nonce });
      return executorResponse({ requestId, ...result, decision: result.ok ? "would_settle" : "declined", chainId: lane.chainId, checkedAt: new Date().toISOString() });
    }
    if (input.deps === undefined) return executorResponse({ requestId, code: "PREFLIGHT_DECLINED", message: "Payment boundary is unavailable." }, 503);
    const result = path === "/v1/payments/preflight"
      ? await handlePreflight({ intentId: String(body.intentId ?? ""), requestId }, input.deps)
      : await handleExecute({ intentId: String(body.intentId ?? ""), idempotencyKey: String(body.idempotencyKey ?? ""), sessionWallet: sessionWallet ?? String(body.sessionWallet ?? ""), requestId }, input.deps);
    return executorResponse({ requestId, ...result });
  };
}

type RuntimeEnv = Record<string, string | undefined>;
type Server = (handler: (request: Request) => Response | Promise<Response>) => void;

type ReadOnlyComposition = {
  client: ReadOnlyRpcPaymentClient;
  intents: Pick<IntentStoreAdapter, "getById">;
  cards: Pick<CardStore, "getById">;
  lane: LaneConfig;
  /**
   * Split-role owner-authorization seam (supplement §4/§9). Absent means
   * single-wallet only — the legacy behavior. Consulted only when the lane
   * carries a controller (Arc) and the single-wallet lookup misses.
   */
  ownerAuthorizations?: OwnerAuthorizationRegistry;
};

async function handleReadOnlyPreflight(
  input: { intentId: string; requestId: string; sessionWallet: string },
  deps: ReadOnlyComposition,
): Promise<{
  requestId: string;
  intentId: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  chainId: number;
  checkedAt: string;
  /** PVL evidence record. Built whenever intent+card facts exist; the
   * entrypoint strips it so the HTTP envelope never changes. */
  validation?: H2ValidationRecord;
}> {
  const checkedAt = new Date().toISOString();
  const lane = deps.lane;
  // 1. Single-wallet attempt (legacy-compatible): owner == agent == session.
  let intent = await deps.intents.getById({
    intentId: input.intentId,
    ownerAddress: input.sessionWallet,
    agentId: input.sessionWallet,
  });
  // 2. Split-role attempt (supplement §9): only when the lane carries a
  // controller (Arc) and a registry is injected. The re-read stays a
  // G32-shaped owner+agent scoped read, predicated on the AUTHORIZED owner.
  let authorization: OwnerAuthorization | null = null;
  if (intent === null && lane.controller !== undefined && deps.ownerAuthorizations !== undefined) {
    const candidate = await deps.ownerAuthorizations.findAuthorization({
      intentId: input.intentId,
      agentId: input.sessionWallet,
      chainId: lane.chainId,
    });
    if (candidate !== null) {
      const reread = await deps.intents.getById({
        intentId: input.intentId,
        ownerAddress: candidate.ownerAddress,
        agentId: input.sessionWallet,
      });
      if (reread !== null) {
        intent = reread;
        authorization = candidate;
      }
    }
  }
  if (intent === null) {
    return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: "PREFLIGHT_DECLINED", chainId: lane.chainId, checkedAt };
  }
  const expiresAtMs = Date.parse(intent.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: "PREFLIGHT_DECLINED", chainId: lane.chainId, checkedAt };
  }
  const card = await deps.cards.getById({
    cardId: intent.cardId,
    ownerAddress: authorization?.ownerAddress ?? input.sessionWallet,
    agentId: intent.agentId,
  });
  if (card === null) {
    return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: "PREFLIGHT_DECLINED", chainId: lane.chainId, checkedAt };
  }
  const pvl = (
    decision: "would_settle" | "declined",
    reasonCode?: string,
  ): H2ValidationRecord =>
    buildH2ValidationRecord({
      sessionWallet: input.sessionWallet,
      intent: {
        intentId: intent.intentId,
        agentId: intent.agentId,
        cardId: intent.cardId,
        merchantId: intent.merchantId,
        amountBaseUnits: intent.amountBaseUnits,
        asset: intent.asset,
        policyVersion: intent.policyVersion,
        intentHash: intent.intentHash,
        expiresAt: intent.expiresAt,
      },
      card: {
        card_id: card.card_id,
        controller_address: card.controller_address,
        owner_address: card.owner_address,
        agent_id: card.agent_id,
        asset: card.asset,
        chain_id: card.chain_id,
        policy_version: card.policy_version,
        allowlist_hash: card.allowlist_hash,
        source_block: card.source_block,
        source_tx_hash: card.source_tx_hash,
      },
      lane,
      authorization,
      decision,
      ...(reasonCode === undefined ? {} : { reasonCode }),
      evaluatedAt: checkedAt,
    });
  // Lane binding: exact (chain, asset) pair plus the lane controller when
  // the lane defines one. A CTC row in the Arc lane (or vice versa) and an
  // Arc card under the wrong controller decline here, fail-closed.
  if (
    card.asset !== lane.asset ||
    card.chain_id !== lane.chainId ||
    (lane.controller !== undefined &&
      card.controller_address.toLowerCase() !== lane.controller.toLowerCase()) ||
    card.agent_id.toLowerCase() !== intent.agentId.toLowerCase() ||
    card.policy_version !== intent.policyVersion
  ) {
    return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: "CARD_NOT_ELIGIBLE", chainId: lane.chainId, checkedAt, validation: pvl("declined", "CARD_NOT_ELIGIBLE") };
  }
  // Split-role authorization (authorized mode only): the registry entry must
  // agree with the session, the intent, the seeded row, the lane, the
  // creation provenance, the policy, and the owner-issued rule.
  if (authorization !== null) {
    const check = validateOwnerAuthorization(
      authorization,
      {
        sessionWallet: input.sessionWallet,
        intent: {
          intentId: intent.intentId,
          agentId: intent.agentId,
          cardId: intent.cardId,
          policyVersion: intent.policyVersion,
        },
        card: {
          card_id: card.card_id,
          controller_address: card.controller_address,
          owner_address: card.owner_address,
          agent_id: card.agent_id,
          asset: card.asset,
          chain_id: card.chain_id,
          policy_version: card.policy_version,
          allowlist_hash: card.allowlist_hash,
          source_block: card.source_block,
          source_tx_hash: card.source_tx_hash,
        },
        lane,
      },
    );
    if (!check.ok) {
      return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: check.code, chainId: lane.chainId, checkedAt, validation: pvl("declined", check.code) };
    }
  }
  const chainCard = await deps.client.readCard(intent.cardId, intent.agentId);
  if (
    chainCard.chainId !== lane.chainId ||
    chainCard.agent.toLowerCase() !== intent.agentId.toLowerCase() ||
    chainCard.policyVersion !== intent.policyVersion
  ) {
    return { requestId: input.requestId, intentId: input.intentId, decision: "declined", reasonCode: "CARD_NOT_ELIGIBLE", chainId: lane.chainId, checkedAt, validation: pvl("declined", "CARD_NOT_ELIGIBLE") };
  }
  const result = await deps.client.preflight({
    intentId: intent.intentId,
    idempotencyKey: "preflight",
    cardId: intent.cardId,
    nonce: `${intent.cardId}:${intent.policyVersion}`,
    amountBaseUnits: intent.amountBaseUnits,
    deadline: Math.floor(expiresAtMs / 1000),
    merchantId: intent.merchantId,
    asset: intent.asset,
    policyVersion: intent.policyVersion,
    agent: intent.agentId,
  });
  return {
    requestId: input.requestId,
    intentId: input.intentId,
    decision: result.ok ? "would_settle" : "declined",
    ...(result.ok ? {} : { reasonCode: "PREFLIGHT_DECLINED" }),
    chainId: lane.chainId,
    checkedAt,
    validation: pvl(result.ok ? "would_settle" : "declined", result.ok ? undefined : "PREFLIGHT_DECLINED"),
  };
}

type ExecutorCompositionInput = {
  env?: RuntimeEnv;
  readOnlyClient?: PaymentClient | { readCard: PaymentClient["readCard"]; preflight: PaymentClient["preflight"] };
  transport?: ReadOnlyRpcTransport;
  persistence?: PostgrestPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
  /** Execution lane. Injectable seam defaults legacy; production passes Arc. */
  lane?: LaneSelection | LaneConfig;
  /**
   * Split-role registry seam. Absent means single-wallet only, even on Arc
   * (fail closed when the dependency is missing). Production passes the Arc
   * card-1 registry explicitly in its Deno block; tests inject variants.
   */
  ownerAuthorizations?: OwnerAuthorizationRegistry;
};

export function createExecutorCompositionRoot(input: ExecutorCompositionInput = {}): (request: Request) => Promise<Response> {
  const env = input.env ?? {};
  const lane = resolveLane(input.lane);
  const region = resolveRegionConfig(env);
  const configuredRegion = region.configuredRegion;
  const expectedRegion = region.expectedRegion ?? "unknown";
  const localReadOnlyInjection = input.readOnlyClient !== undefined ||
    (input.transport !== undefined && env.SESSION_HMAC_SECRET === undefined);
  const actualRegion = region.observedRuntimeRegion;
  if (!regionsMatch(region.expectedRegion, region.observedRuntimeRegion)) {
    return createExecutorEntrypointHandler({ configuredRegion, expectedRegion, actualRegion });
  }
  const rpcUrl = env[lane.rpcEnvName];
  const readOnlyClient = input.readOnlyClient ?? (
    rpcUrl === undefined || input.transport === undefined
      ? undefined
      : createReadOnlyRpcPaymentClient({ rpcUrl, expectedChainId: lane.chainId, transport: input.transport })
  );
  let persistence = input.persistence;
  if (persistence === undefined && !localReadOnlyInjection) {
    try {
      persistence = createPostgrestPersistenceFromEnv(env, input.postgrestTransport, lane);
    } catch {
      return createExecutorEntrypointHandler({ configuredRegion: actualRegion, expectedRegion, actualRegion });
    }
  }
  if (readOnlyClient === undefined) {
    return createExecutorEntrypointHandler({ configuredRegion: actualRegion, expectedRegion, actualRegion });
  }
  if (!localReadOnlyInjection && (persistence === undefined || env.SESSION_HMAC_SECRET === undefined)) {
    return createExecutorEntrypointHandler({ configuredRegion: actualRegion, expectedRegion, actualRegion });
  }
  return createExecutorEntrypointHandler({
    readOnlyClient: localReadOnlyInjection ? readOnlyClient : undefined,
    configuredRegion,
    expectedRegion,
    actualRegion,
    sessionSecret: env.SESSION_HMAC_SECRET,
    sessionPersistence: persistence?.session,
    readOnlyComposition: !localReadOnlyInjection && persistence !== undefined
      ? {
        client: readOnlyClient,
        intents: persistence.intent,
        cards: persistence.card,
        lane,
        ownerAuthorizations: input.ownerAuthorizations,
      }
      : undefined,
    lane,
  });
}

export function startExecutorServer(input: {
  serve: Server;
  env?: RuntimeEnv;
  readOnlyClient?: PaymentClient | { readCard: PaymentClient["readCard"]; preflight: PaymentClient["preflight"] };
  transport?: ReadOnlyRpcTransport;
  persistence?: PostgrestPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
  lane?: LaneSelection | LaneConfig;
  ownerAuthorizations?: OwnerAuthorizationRegistry;
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

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  startExecutorServer({
    serve: Deno.serve,
    // H1/H2 production lane: Arc. Legacy lane remains available to the
    // injectable seam (tests, history) but is not served here.
    lane: "arc",
    // Explicit split-role registry for Arc card 1 (supplement §6 facts).
    ownerAuthorizations: createArcCard1OwnerRegistry(),
    env: {
      PACT_EXPECTED_REGION: Deno.env.get("PACT_EXPECTED_REGION"),
      SB_REGION: Deno.env.get("SB_REGION"),
      ARC_RPC_URL: Deno.env.get("ARC_RPC_URL"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SESSION_HMAC_SECRET: Deno.env.get("SESSION_HMAC_SECRET"),
    },
    transport: createFetchRpcTransport(Deno.env.get("ARC_RPC_URL") ?? "", fetch),
  });
}
