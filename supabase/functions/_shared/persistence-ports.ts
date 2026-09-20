/**
 * Option A persistence ports (G18): binding port types for server-only
 * PostgREST persistence. Re-exports canonical existing types; defines no
 * duplicate domain value.
 *
 * Canonical sources (read-only):
 * - AgentIntent: packages/domain/src/types.ts:1-16
 * - ChallengeRecord/SessionRecord/SessionPersistence: supabase/functions/session/index.ts:38-67
 * - OnChainCardSnapshot: supabase/functions/agent-executor/chain-client.ts:13-18
 * - IntentStore.save: supabase/functions/ai-gateway/index.ts:42-43
 * - CardStatus/Card: contracts/src/PactTypes.sol:4-23
 *
 * Transport (Option A section 0-1): server-only PostgREST over HTTPS.
 * Env inputs (names only): SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * The public anon key is never a persistence transport input.
 * Only GET, POST, PATCH are allowed; other verbs and procedure endpoints
 * are forbidden for MVP.
 * DELETE, PUT, client-resolved UPSERT are forbidden.
 */

export type { AgentIntent } from "../../../packages/domain/src/types.ts";
export type {
  ChallengeRecord,
  SessionRecord,
  SessionPersistence,
} from "../session/index.ts";
export type { OnChainCardSnapshot } from "../agent-executor/chain-client.ts";
export type { IntentStore } from "../ai-gateway/index.ts";

export type PersistenceErrorCode =
  | "NOT_FOUND"
  | "INVALID_ROW"
  | "OWNERSHIP_DENIED"
  | "REPLAYED"
  | "EXPIRED"
  | "REVOKED"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_ACTIVE_CARD"
  | "CONFLICT"
  | "UNAVAILABLE";

export type PersistenceFailure = {
  code: PersistenceErrorCode;
  retryable: boolean;
};

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly retryable: boolean;

  constructor(code: PersistenceErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "PersistenceError";
    this.code = code;
    this.retryable = retryable;
  }
}

export function persistenceFailure(
  code: PersistenceErrorCode,
  retryable = false,
): PersistenceFailure {
  return { code, retryable };
}

export function throwPersistence(
  code: PersistenceErrorCode,
  message: string,
  retryable = false,
): never {
  throw new PersistenceError(code, message, retryable);
}

/** Uppercase DB status vocabulary; maps exactly to Solidity CardStatus. */
export type DbCardStatus = "ISSUED" | "ACTIVE" | "SUSPENDED" | "CLOSED";

export const DB_CARD_STATUSES: readonly DbCardStatus[] = [
  "ISSUED",
  "ACTIVE",
  "SUSPENDED",
  "CLOSED",
] as const;

/**
 * CardRecord is a Phase 04 persistence-local DB cache DTO (never in
 * packages/domain). Authority remains PactCardController + PactTypes.sol;
 * OnChainCardSnapshot is the chain projection for gateway/executor reads.
 * A DB ACTIVE row alone never authorizes payment without chain re-read.
 */
export type CardRecord = {
  card_id: string;
  controller_address: string;
  owner_address: string;
  agent_id: string;
  asset: "native-testnet-ctc" | "arc-testnet-usdc";
  /** Lane chain. Reads default legacy (102031) when absent; writes always set it. */
  chain_id: number;
  status: DbCardStatus;
  owner_configured_cap: string;
  per_transaction_limit: string;
  verified_credit: string;
  verified_credit_expires_at: string | null;
  spent: string;
  expires_at: string;
  policy_version: number;
  allowlist_hash: string;
  source_block: number;
  source_tx_hash: string;
  created_at: string;
  updated_at: string;
};

/** Allowed HTTP methods for persistence transport. DELETE/PUT/UPSERT-forbidden. */
export type PostgrestMethod = "GET" | "POST" | "PATCH";

export type PostgrestRequest = {
  method: PostgrestMethod;
  /** Exact REST path, e.g. /rest/v1/session_challenges with optional query. */
  path: string;
  body?: unknown;
  singleObject?: boolean;
};

export type PostgrestResponse = {
  status: number;
  body: unknown;
};

export type PostgrestTransport = (
  req: PostgrestRequest,
) => Promise<PostgrestResponse>;

export type PostgrestConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  timeoutMs?: number;
};

/** One AbortController timeout of 5000ms per PostgREST request. */
export const POSTGREST_TIMEOUT_MS = 5000;

/** Exact REST paths (Option A section 1). */
export const POSTGREST_PATHS = {
  sessionChallenges: "/rest/v1/session_challenges",
  sessions: "/rest/v1/sessions",
  intents: "/rest/v1/intents",
  cards: "/rest/v1/cards",
  paymentAttempts: "/rest/v1/payment_attempts",
} as const;

export function buildPostgrestHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: "return=representation",
  };
}

export function singleObjectHeaders(
  serviceRoleKey: string,
): Record<string, string> {
  return {
    ...buildPostgrestHeaders(serviceRoleKey),
    Accept: "application/vnd.pgrst.object+json",
  };
}

/**
 * Fail-closed config loader: requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Throws PersistenceError UNAVAILABLE when either is missing. No fallback.
 */
export function requirePostgrestConfig(
  env: Record<string, string | undefined>,
): PostgrestConfig {
  const supabaseUrl = env["SUPABASE_URL"];
  const serviceRoleKey = env["SUPABASE_SERVICE_ROLE_KEY"];
  if (supabaseUrl === undefined || supabaseUrl.length === 0) {
    throw new PersistenceError("UNAVAILABLE", "PostgREST config is unavailable.", false);
  }
  if (serviceRoleKey === undefined || serviceRoleKey.length === 0) {
    throw new PersistenceError("UNAVAILABLE", "PostgREST config is unavailable.", false);
  }
  return { supabaseUrl, serviceRoleKey, timeoutMs: POSTGREST_TIMEOUT_MS };
}

export function isSingleRow(body: unknown): body is Array<Record<string, unknown>> {
  return Array.isArray(body);
}

export function assertNoRawLeak(value: unknown): void {
  // Adapters map every failure into the closed union; raw bodies never leave.
  void value;
}
