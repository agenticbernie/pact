/**
 * Neon direct-Postgres persistence (Arc lane foundation).
 *
 * Same domain ports as the HTTP adapters promises SessionPersistence,
 * IntentStoreAdapter, CardStore but over parameterized SQL via a `pg`
 * Pool. No HTTP transport, no second URL/secret surface: the ONLY inputs
 * are DATABASE_URL (Neon-managed binding) plus an explicit
 * PERSISTENCE_BACKEND=neon selection. Anything else fails closed.
 *
 * SQL rules (enforced by tests, not just comments):
 * - every user value travels in `params` ($1 placeholders); query text is
 *   static. Concatenating user input into query text is forbidden.
 * - atomic consume / revoke / transitions are single conditional
 *   UPDATE ... WHERE ... RETURNING statements (affected-row-count signal:
 *   1 applied, 0 not applied, >1 fail-closed).
 * - unique violations (pg code 23505) map by constraint name:
 *   cards_agent_active_uidx -> DUPLICATE_ACTIVE_CARD, else CONFLICT.
 * - connection/query failures map to UNAVAILABLE (never raw passthrough).
 * - row mapping and lane validation reuse the shared PostgREST-side
 *   validators/mappers (single source, zero drift).
 * - errors and logs never carry parameters, token hashes, tokens,
 *   signatures, URLs, or keys.
 *
 * Node-only module (Neon functions + vitest). Never imported by Deno
 * entrypoints. Deno-safe only in the sense that it has no Deno imports;
 * it requires the `pg` package at bundle/test time.
 */
import { Pool } from "pg";
import type {
  ChallengeRecord,
  SessionPersistence,
  SessionRecord,
} from "../../supabase/functions/session/index.ts";
import {
  PersistenceError,
  type PostgrestPersistence,
} from "../../supabase/functions/_shared/persistence-ports.ts";
import {
  assertCardRecord,
  isValidCardTransition,
  toCardRecord,
  type CardStore,
} from "../../supabase/functions/_shared/card-store.ts";
import {
  canonicalEqual,
  scopedIntentRow,
  toAgentIntent,
  type IntentStoreAdapter,
} from "../../supabase/functions/_shared/intent-store.ts";
import {
  assertChallengeInput,
  assertSessionInput,
  toChallengeRecord,
  toSessionRecord,
} from "../../supabase/functions/_shared/session-challenge-store.ts";
import {
  defaultChainForAsset,
  isLaneAssetPair,
  resolveLane,
  type LaneConfig,
  type LaneSelection,
} from "../../supabase/functions/_shared/lane-config.ts";

export type NeonPersistence = PostgrestPersistence;

export type NeonRow = Record<string, unknown>;

export type NeonQueryResult = {
  rows: NeonRow[];
  rowCount: number;
};

export type NeonQueryFn = (text: string, params: unknown[]) => Promise<NeonQueryResult>;

/** Minimal Pool surface (real `pg` Pool satisfies this structurally). */
export type NeonPoolLike = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: NeonRow[]; rowCount: number | null }>;
  end?: () => Promise<void>;
};

const HEX64 = /^[0-9a-f]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const CARD_ID = /^(0|[1-9][0-9]*)$/;

function fail(code: "NOT_FOUND" | "INVALID_ROW" | "OWNERSHIP_DENIED" | "REPLAYED" | "EXPIRED" | "REVOKED" | "IDEMPOTENCY_CONFLICT" | "DUPLICATE_ACTIVE_CARD" | "CONFLICT" | "UNAVAILABLE", message: string, retryable = false): never {
  throw new PersistenceError(code, message, retryable);
}

function toPgError(error: unknown, op: string): never {
  if (error instanceof PersistenceError) throw error;
  const record = error as { code?: unknown; constraint?: unknown } | null;
  if (record !== null && typeof record === "object" && record.code === "23505") {
    if (record.constraint === "cards_agent_active_uidx") {
      fail("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
    }
    fail("CONFLICT", `${op} conflict.`, false);
  }
  fail("UNAVAILABLE", `${op} failed.`, false);
}

/** Normalize driver row shapes (timestamptz Date, int8 strings) for mappers. */
function normRow(row: NeonRow): NeonRow {
  const out: NeonRow = { ...row };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (value instanceof Date) out[key] = value.toISOString();
  }
  return out;
}

export function createNeonPool(databaseUrl: string): NeonPoolLike {
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    fail("UNAVAILABLE", "Neon database URL is unavailable.", false);
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  return {
    query: (text: string, params: unknown[] = []) => pool.query(text, params) as Promise<{ rows: NeonRow[]; rowCount: number | null }>,
    end: () => pool.end(),
  };
}

/**
 * Explicit backend selection. Anything other than exactly `neon` throws —
 * there is deliberately no silent fallback to another backend. Missing
 * DATABASE_URL throws before any pool is constructed.
 */
export function requireNeonEnv(env: Record<string, string | undefined>): { databaseUrl: string } {
  if (env["PERSISTENCE_BACKEND"] !== "neon") {
    fail("UNAVAILABLE", "Neon backend not selected.", false);
  }
  const databaseUrl = env["DATABASE_URL"];
  if (typeof databaseUrl !== "string" || databaseUrl.trim().length === 0) {
    fail("UNAVAILABLE", "Neon database URL is unavailable.", false);
  }
  return { databaseUrl };
}

function intentChainId(chainId: number | undefined, asset: string, lane?: LaneConfig): number {
  if (chainId !== undefined) return chainId;
  if (lane !== undefined) return lane.chainId;
  return defaultChainForAsset(asset);
}

function assertIntentShapeNeon(
  intent: { agentId: string; cardId: string; asset: string; intentHash: string; createdAt: string; expiresAt: string; chainId?: number },
  lane?: LaneConfig,
): number {
  const chainId = intentChainId(intent.chainId, intent.asset, lane);
  if (!isLaneAssetPair(chainId, intent.asset)) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  if (lane !== undefined && (chainId !== lane.chainId || intent.asset !== lane.asset)) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!EVM_ADDRESS.test(intent.agentId.toLowerCase())) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!CARD_ID.test(intent.cardId)) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(intent.intentHash)) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!Number.isFinite(Date.parse(intent.createdAt)) || !Number.isFinite(Date.parse(intent.expiresAt))) {
    fail("INVALID_ROW", "Invalid intent row.", false);
  }
  return chainId;
}

const INTENT_COLUMNS =
  "intents.intent_id,intents.card_id,intents.agent_id,intents.merchant_id,intents.amount_base_units,intents.asset,intents.chain_id,intents.purpose,intents.confidence,intents.provider,intents.model,intents.created_at,intents.expires_at,intents.policy_version,intents.intent_hash";

/** Unqualified twin for single-table INSERT ... RETURNING (no JOIN, no ambiguity). */
const INTENT_INSERT_RETURNING =
  "intent_id,card_id,agent_id,merchant_id,amount_base_units,asset,chain_id,purpose,confidence,provider,model,created_at,expires_at,policy_version,intent_hash";

export function createNeonPersistence(
  pool: NeonPoolLike,
  lane?: LaneSelection | LaneConfig,
): NeonPersistence {
  const strictLane = lane === undefined ? undefined : resolveLane(lane);

  async function run(text: string, params: unknown[], op: string): Promise<NeonQueryResult> {
    try {
      const result = await pool.query(text, params);
      return { rows: result.rows.map(normRow), rowCount: result.rowCount ?? result.rows.length };
    } catch (error) {
      toPgError(error, op);
    }
  }

  async function resolveCardAgent(cardId: string): Promise<NeonRow | null> {
    const result = await run(
      "SELECT card_id,agent_id,owner_address,status FROM cards WHERE card_id = $1",
      [cardId],
      "Card lookup",
    );
    if (result.rows.length === 0) return null;
    if (result.rows.length > 1) {
      fail("INVALID_ROW", "Invalid card row.", false);
    }
    return result.rows[0];
  }

  const session: SessionPersistence = {
    async insertChallenge(row: ChallengeRecord): Promise<void> {
      assertChallengeInput(row);
      const issuedAt = new Date(row.expiresAtMs - 5 * 60 * 1000).toISOString();
      try {
        await run(
          "INSERT INTO session_challenges (nonce_hash,wallet_address,message,issued_at,expires_at) VALUES ($1,$2,$3,$4,$5)",
          [row.nonceHash, row.wallet.toLowerCase(), row.message, issuedAt, new Date(row.expiresAtMs).toISOString()],
          "Challenge insert",
        );
      } catch (error) {
        toPgError(error, "Challenge insert");
      }
    },

    async consumeChallenge(nonceHash: string): Promise<ChallengeRecord | null> {
      if (!HEX64.test(nonceHash)) {
        fail("INVALID_ROW", "Invalid challenge row.", false);
      }
      const result = await run(
        "UPDATE session_challenges SET consumed_at = now() WHERE nonce_hash = $1 AND consumed_at IS NULL RETURNING nonce_hash,wallet_address,message,expires_at,consumed_at",
        [nonceHash],
        "Challenge consume",
      );
      if (result.rowCount === 1) return toChallengeRecord(result.rows[0]);
      return null;
    },

    async insertSession(row: SessionRecord): Promise<void> {
      assertSessionInput(row);
      try {
        await run(
          "INSERT INTO sessions (id,token_hash,wallet_address,role,issued_at,expires_at) VALUES ($1,$2,$3,'user',$4,$5)",
          [row.id, row.tokenHash, row.wallet.toLowerCase(), new Date(row.issuedAtMs).toISOString(), new Date(row.expiresAtMs).toISOString()],
          "Session insert",
        );
      } catch (error) {
        toPgError(error, "Session insert");
      }
    },

    async findSession(tokenHash: string, wallet: string): Promise<SessionRecord | null> {
      if (!HEX64.test(tokenHash)) {
        fail("INVALID_ROW", "Invalid session row.", false);
      }
      const result = await run(
        "SELECT id,token_hash,wallet_address,role,issued_at,expires_at,revoked_at FROM sessions WHERE token_hash = $1 AND wallet_address = $2 AND revoked_at IS NULL AND expires_at > now()",
        [tokenHash, wallet.toLowerCase()],
        "Session read",
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length > 1) {
        fail("INVALID_ROW", "Invalid session row.", false);
      }
      return toSessionRecord(result.rows[0]);
    },

    async revokeSession(tokenHash: string, wallet: string, nowMs: number): Promise<boolean> {
      if (!HEX64.test(tokenHash)) {
        fail("INVALID_ROW", "Invalid session row.", false);
      }
      const result = await run(
        "UPDATE sessions SET revoked_at = $3 WHERE token_hash = $1 AND wallet_address = $2 AND revoked_at IS NULL RETURNING id",
        [tokenHash, wallet.toLowerCase(), new Date(nowMs).toISOString()],
        "Session revoke",
      );
      if (result.rowCount === 1) return true;
      if (result.rowCount === 0) return false;
      fail("INVALID_ROW", "Invalid session row.", false);
    },
  };

  const intent: IntentStoreAdapter = {
    async insertIntent(input) {
      const chainId = assertIntentShapeNeon(
        {
          agentId: input.intent.agentId,
          cardId: input.intent.cardId,
          asset: input.intent.asset,
          intentHash: input.intent.intentHash,
          createdAt: input.intent.createdAt,
          expiresAt: input.intent.expiresAt,
          chainId: input.intent.chainId,
        },
        strictLane,
      );
      if (input.idempotencyKey.length === 0 || input.requestId.length === 0) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      if (!EVM_ADDRESS.test(input.ownerAddress.toLowerCase())) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      const card = await resolveCardAgent(input.intent.cardId);
      if (card === null) {
        fail("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }
      const cardAgent = String(card.agent_id ?? "").toLowerCase();
      const cardStatus = String(card.status ?? "");
      if (cardAgent !== input.intent.agentId.toLowerCase()) {
        fail("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }
      if (cardStatus !== "ACTIVE" && cardStatus !== "ISSUED") {
        fail("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }
      try {
        const inserted = await run(
          "INSERT INTO intents (intent_id,card_id,agent_id,merchant_id,amount_base_units,asset,chain_id,purpose,confidence,provider,model,policy_version,intent_hash,status,request_id,idempotency_key,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ready',$14,$15,$16) RETURNING " + INTENT_INSERT_RETURNING,
          [
            input.intent.intentId,
            input.intent.cardId,
            input.intent.agentId.toLowerCase(),
            input.intent.merchantId,
            input.intent.amountBaseUnits,
            input.intent.asset,
            chainId,
            input.intent.purpose,
            input.intent.confidence,
            input.intent.provider,
            input.intent.model,
            input.intent.policyVersion,
            input.intent.intentHash,
            input.requestId,
            input.idempotencyKey,
            input.intent.expiresAt,
          ],
          "Intent insert",
        );
        if (inserted.rows.length === 1) return toAgentIntent(inserted.rows[0], strictLane);
        fail("INVALID_ROW", "Invalid intent row.", false);
      } catch (error) {
        if (error instanceof PersistenceError && error.code !== "CONFLICT") throw error;
        if (!(error instanceof PersistenceError)) {
          const record = error as { code?: unknown };
          if (record === null || typeof record !== "object" || record.code !== "23505") {
            toPgError(error, "Intent insert");
          }
        }
        const existing = await run(
          "SELECT " + INTENT_COLUMNS + ",cards.owner_address AS cards_owner_address FROM intents JOIN cards ON cards.card_id = intents.card_id WHERE intents.idempotency_key = $1 AND intents.agent_id = $2 AND cards.owner_address = $3",
          [input.idempotencyKey, input.intent.agentId.toLowerCase(), input.ownerAddress.toLowerCase()],
          "Intent replay read",
        );
        if (existing.rows.length === 0) {
          fail("CONFLICT", "Intent conflict.", false);
        }
        if (existing.rows.length > 1) {
          fail("INVALID_ROW", "Invalid intent row.", false);
        }
        const scoped = scopedIntentRow(
          { ...existing.rows[0], cards: { owner_address: existing.rows[0]["cards_owner_address"] } },
          input.ownerAddress,
          input.intent.agentId,
        );
        if (scoped === null) {
          fail("OWNERSHIP_DENIED", "Intent ownership denied.", false);
        }
        const prior = toAgentIntent(scoped as Record<string, unknown>, strictLane);
        if (canonicalEqual(prior, input.intent)) return prior;
        fail("IDEMPOTENCY_CONFLICT", "Idempotency conflict.", false);
      }
    },

    async getById(input) {
      if (input.intentId.length === 0) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      const result = await run(
        "SELECT " + INTENT_COLUMNS + ",cards.owner_address AS cards_owner_address FROM intents JOIN cards ON cards.card_id = intents.card_id WHERE intents.intent_id = $1 AND intents.agent_id = $2 AND cards.owner_address = $3",
        [input.intentId, (input.agentId ?? "").toLowerCase(), input.ownerAddress.toLowerCase()],
        "Intent read",
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length > 1) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      const row = scopedIntentRow(
        { ...result.rows[0], cards: { owner_address: result.rows[0]["cards_owner_address"] } },
        input.ownerAddress,
        input.agentId,
      );
      return row === null ? null : toAgentIntent(row, strictLane);
    },

    async getByIdempotencyKey(input) {
      if (input.idempotencyKey.length === 0) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      const result = await run(
        "SELECT " + INTENT_COLUMNS + ",cards.owner_address AS cards_owner_address FROM intents JOIN cards ON cards.card_id = intents.card_id WHERE intents.idempotency_key = $1 AND intents.agent_id = $2 AND cards.owner_address = $3",
        [input.idempotencyKey, input.agentId.toLowerCase(), input.ownerAddress.toLowerCase()],
        "Intent read",
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length > 1) {
        fail("INVALID_ROW", "Invalid intent row.", false);
      }
      const row = scopedIntentRow(
        { ...result.rows[0], cards: { owner_address: result.rows[0]["cards_owner_address"] } },
        input.ownerAddress,
        input.agentId,
      );
      return row === null ? null : toAgentIntent(row, strictLane);
    },

    async markStatus(input) {
      const allowed = new Set(["ready", "expired", "consumed", "failed"]);
      if (!allowed.has(input.status)) {
        fail("INVALID_ROW", "Invalid intent status.", false);
      }
      if (input.status === "ready") {
        fail("INVALID_ROW", "Invalid intent status.", false);
      }
      const result = await run(
        "UPDATE intents SET status = $2 WHERE intent_id = $1 AND status = 'ready'",
        [input.intentId, input.status],
        "Intent status update",
      );
      if (result.rowCount === 1) return;
      if (result.rowCount === 0) {
        fail("NOT_FOUND", "Intent not found.", false);
      }
      fail("INVALID_ROW", "Invalid intent row.", false);
    },

    async save(returnedIntent) {
      await this.insertIntent({
        intent: returnedIntent,
        idempotencyKey: returnedIntent.intentId,
        ownerAddress: returnedIntent.agentId,
        requestId: returnedIntent.intentId,
      });
    },
  };

  const card: CardStore = {
    async getById(input) {
      if (!CARD_ID.test(input.cardId)) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      const predicates: string[] = ["card_id = $1"];
      const params: unknown[] = [input.cardId];
      if (input.ownerAddress !== undefined) {
        params.push(input.ownerAddress.toLowerCase());
        predicates.push(`owner_address = $${params.length}`);
      }
      if (input.agentId !== undefined) {
        params.push(input.agentId.toLowerCase());
        predicates.push(`agent_id = $${params.length}`);
      }
      const result = await run(
        `SELECT * FROM cards WHERE ${predicates.join(" AND ")}`,
        params,
        "Card read",
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length > 1) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      return toCardRecord(result.rows[0], strictLane);
    },

    async getActiveByAgent(input) {
      if (!EVM_ADDRESS.test(input.agentId.toLowerCase())) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      const result = await run(
        "SELECT * FROM cards WHERE agent_id = $1 AND status = 'ACTIVE'",
        [input.agentId.toLowerCase()],
        "Card read",
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length === 1) return toCardRecord(result.rows[0], strictLane);
      fail("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
    },

    async createOrRecord(recordInput) {
      assertCardRecord(recordInput, strictLane);
      try {
        const result = await run(
          "INSERT INTO cards (card_id,controller_address,owner_address,agent_id,asset,chain_id,status,owner_configured_cap,per_transaction_limit,verified_credit,verified_credit_expires_at,spent,expires_at,policy_version,allowlist_hash,source_block,source_tx_hash,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *",
          [
            recordInput.card_id,
            recordInput.controller_address.toLowerCase(),
            recordInput.owner_address.toLowerCase(),
            recordInput.agent_id.toLowerCase(),
            recordInput.asset,
            recordInput.chain_id,
            recordInput.status,
            recordInput.owner_configured_cap,
            recordInput.per_transaction_limit,
            recordInput.verified_credit,
            recordInput.verified_credit_expires_at,
            recordInput.spent,
            recordInput.expires_at,
            recordInput.policy_version,
            recordInput.allowlist_hash,
            recordInput.source_block,
            recordInput.source_tx_hash.toLowerCase(),
            recordInput.created_at,
            recordInput.updated_at,
          ],
          "Card record",
        );
        if (result.rows.length === 1) return toCardRecord(result.rows[0], strictLane);
        if (result.rows.length > 1) {
          fail("INVALID_ROW", "Invalid card row.", false);
        }
        return recordInput;
      } catch (error) {
        toPgError(error, "Card record");
      }
    },

    async transitionStatus(input) {
      if (!isValidCardTransition(input.from, input.to)) {
        fail("INVALID_ROW", "Illegal card transition.", false);
      }
      if (!/^0x[0-9a-f]{64}$/.test(input.sourceTxHash.toLowerCase())) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      const current = await run(
        "SELECT card_id,status,source_block FROM cards WHERE card_id = $1",
        [input.cardId],
        "Card read",
      );
      if (current.rows.length === 0) {
        fail("NOT_FOUND", "Card not found.", false);
      }
      if (current.rows.length > 1) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      const currentBlock = Number((current.rows[0] as Record<string, unknown>)["source_block"]);
      if (!Number.isFinite(currentBlock) || input.sourceBlock <= currentBlock) {
        fail("CONFLICT", "Stale card event.", false);
      }
      const now = new Date().toISOString();
      const result = await run(
        "UPDATE cards SET status = $2, source_block = $3, source_tx_hash = $4, updated_at = $5 WHERE card_id = $1 AND status = $6 AND source_block < $3 RETURNING *",
        [input.cardId, input.to, input.sourceBlock, input.sourceTxHash.toLowerCase(), now, input.from],
        "Card transition",
      );
      if (result.rows.length === 1) return toCardRecord(result.rows[0], strictLane);
      fail("CONFLICT", "Card event conflict.", false);
    },

    async close(input) {
      if (!/^0x[0-9a-f]{64}$/.test(input.sourceTxHash.toLowerCase())) {
        fail("INVALID_ROW", "Invalid card row.", false);
      }
      const current = await run(
        "SELECT card_id,status,source_block FROM cards WHERE card_id = $1",
        [input.cardId],
        "Card read",
      );
      if (current.rows.length === 0) {
        fail("NOT_FOUND", "Card not found.", false);
      }
      const row = current.rows[0] as Record<string, unknown>;
      const from = String(row["status"] ?? "");
      if (from === "CLOSED") {
        fail("CONFLICT", "Card already closed.", false);
      }
      if (!isValidCardTransition(from as "ISSUED" | "ACTIVE" | "SUSPENDED" | "CLOSED", "CLOSED")) {
        fail("INVALID_ROW", "Illegal card transition.", false);
      }
      const currentBlock = Number(row["source_block"]);
      if (!Number.isFinite(currentBlock) || input.sourceBlock <= currentBlock) {
        fail("CONFLICT", "Stale card event.", false);
      }
      const now = new Date().toISOString();
      const result = await run(
        "UPDATE cards SET status = 'CLOSED', source_block = $2, source_tx_hash = $3, updated_at = $4 WHERE card_id = $1 AND status = $5 AND source_block < $2 RETURNING *",
        [input.cardId, input.sourceBlock, input.sourceTxHash.toLowerCase(), now, from],
        "Card close",
      );
      if (result.rows.length === 1) {
        return toCardRecord(result.rows[0], strictLane);
      }
      fail("CONFLICT", "Card event conflict.", false);
    },
  };

  return { session, intent, card };
}
