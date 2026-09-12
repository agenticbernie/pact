/**
 * Option A CardStore adapter (G21): server-only PostgREST persistence for
 * the CardRecord DB cache. Authority remains PactCardController +
 * PactTypes.sol; OnChainCardSnapshot is the chain projection.
 * CardRecord is Phase 04 persistence-local only (never in packages/domain).
 *
 * Solidity CardStatus mapping (only valid rows; unsupported rejected):
 * Issued(0)->ISSUED, Active(1)->ACTIVE, Suspended(2)->SUSPENDED, Closed(3)->CLOSED.
 * Lifecycle: ISSUED->ACTIVE, ACTIVE->SUSPENDED, SUSPENDED->ACTIVE,
 * ISSUED|ACTIVE|SUSPENDED->CLOSED (terminal). No other transition valid.
 * createOrRecord is idempotent on (card_id, source_tx_hash) event identity.
 * transitionStatus/close enforce source_block monotonicity in the PATCH
 * predicate. ACTIVE lookup is a cache lookup only; payment eligibility
 * always requires a current chain re-read and never authorizes payment
 * from a DB row alone.
 */

import {
  PersistenceError,
  POSTGREST_TIMEOUT_MS,
  buildPostgrestHeaders,
  type CardRecord,
  type DbCardStatus,
  type PostgrestConfig,
  type PostgrestTransport,
} from "./persistence-ports.ts";

export const CARDS_PATH = "/rest/v1/cards";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const TX_HASH = /^0x[0-9a-f]{64}$/;
const CARD_ID = /^(0|[1-9][0-9]*)$/;

const LIFECYCLE: Record<DbCardStatus, readonly DbCardStatus[]> = {
  ISSUED: ["ACTIVE", "CLOSED"],
  ACTIVE: ["SUSPENDED", "CLOSED"],
  SUSPENDED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

export function mapSolidityStatusToDb(ordinal: number): DbCardStatus {
  switch (ordinal) {
    case 0:
      return "ISSUED";
    case 1:
      return "ACTIVE";
    case 2:
      return "SUSPENDED";
    case 3:
      return "CLOSED";
    default:
      throw new PersistenceError("INVALID_ROW", "Unknown card status.", false);
  }
}

export function isValidCardTransition(from: DbCardStatus, to: DbCardStatus): boolean {
  return LIFECYCLE[from]?.includes(to) ?? false;
}

function assertCardRecord(input: CardRecord): void {
  if (!CARD_ID.test(input.card_id)) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!EVM_ADDRESS.test(input.controller_address.toLowerCase())) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!EVM_ADDRESS.test(input.owner_address.toLowerCase())) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!EVM_ADDRESS.test(input.agent_id.toLowerCase())) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (input.asset !== "native-testnet-ctc") {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!["ISSUED", "ACTIVE", "SUSPENDED", "CLOSED"].includes(input.status)) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  for (const field of [input.owner_configured_cap, input.per_transaction_limit, input.verified_credit, input.spent] as string[]) {
    if (!/^(0|[1-9][0-9]*)$/.test(field)) {
      throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
    }
  }
  if (!Number.isFinite(Date.parse(input.expires_at))) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!Number.isInteger(input.policy_version) || input.policy_version < 0) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!Number.isInteger(input.source_block) || input.source_block < 0) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
  if (!TX_HASH.test(input.source_tx_hash.toLowerCase())) {
    throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
  }
}

function toCardRecord(row: Record<string, unknown>): CardRecord {
  const record = {
    card_id: String(row["card_id"] ?? ""),
    controller_address: String(row["controller_address"] ?? "").toLowerCase(),
    owner_address: String(row["owner_address"] ?? "").toLowerCase(),
    agent_id: String(row["agent_id"] ?? "").toLowerCase(),
    asset: row["asset"],
    status: row["status"],
    owner_configured_cap: String(row["owner_configured_cap"] ?? ""),
    per_transaction_limit: String(row["per_transaction_limit"] ?? ""),
    verified_credit: String(row["verified_credit"] ?? "0"),
    verified_credit_expires_at: (row["verified_credit_expires_at"] as string | null) ?? null,
    spent: String(row["spent"] ?? "0"),
    expires_at: String(row["expires_at"] ?? ""),
    policy_version: Number(row["policy_version"]),
    allowlist_hash: String(row["allowlist_hash"] ?? ""),
    source_block: Number(row["source_block"]),
    source_tx_hash: String(row["source_tx_hash"] ?? "").toLowerCase(),
    created_at: String(row["created_at"] ?? ""),
    updated_at: String(row["updated_at"] ?? ""),
  } as CardRecord;
  assertCardRecord(record);
  return record;
}

function defaultTransport(config: PostgrestConfig): PostgrestTransport {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? POSTGREST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.supabaseUrl}${req.path}`, {
        method: req.method,
        headers: buildPostgrestHeaders(config.serviceRoleKey),
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => [])) as unknown;
      return { status: response.status, body };
    } catch {
      throw new PersistenceError("UNAVAILABLE", "Persistence transport failed.", false);
    } finally {
      clearTimeout(timer);
    }
  };
}

export type CardStore = {
  getById(input: { cardId: string; ownerAddress?: string; agentId?: string }): Promise<CardRecord | null>;
  getActiveByAgent(input: { agentId: string }): Promise<CardRecord | null>;
  createOrRecord(input: CardRecord): Promise<CardRecord>;
  transitionStatus(input: {
    cardId: string;
    from: DbCardStatus;
    to: DbCardStatus;
    sourceTxHash: string;
    sourceBlock: number;
  }): Promise<CardRecord>;
  close(input: { cardId: string; sourceTxHash: string; sourceBlock: number }): Promise<CardRecord>;
};

export function createPostgrestCardStore(
  config: PostgrestConfig,
  transport?: PostgrestTransport,
): CardStore {
  const run = transport ?? defaultTransport(config);

  return {
    async getById(input): Promise<CardRecord | null> {
      if (!CARD_ID.test(input.cardId)) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      let path = `${CARDS_PATH}?card_id=eq.${encodeURIComponent(input.cardId)}`;
      if (input.ownerAddress !== undefined) {
        path += `&owner_address=eq.${encodeURIComponent(input.ownerAddress.toLowerCase())}`;
      }
      if (input.agentId !== undefined) {
        path += `&agent_id=eq.${encodeURIComponent(input.agentId.toLowerCase())}`;
      }
      path += `&select=*`;
      let result;
      try {
        result = await run({ method: "GET", path });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card read failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      if (body.length === 0) return null;
      if (body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      return toCardRecord(body[0] as Record<string, unknown>);
    },

    async getActiveByAgent(input): Promise<CardRecord | null> {
      if (!EVM_ADDRESS.test(input.agentId.toLowerCase())) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      let result;
      try {
        result = await run({
          method: "GET",
          path: `${CARDS_PATH}?agent_id=eq.${encodeURIComponent(input.agentId.toLowerCase())}&status=eq.ACTIVE&select=*`,
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card read failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      if (body.length === 0) return null;
      if (body.length === 1) return toCardRecord(body[0] as Record<string, unknown>);
      throw new PersistenceError("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
    },

    async createOrRecord(input: CardRecord): Promise<CardRecord> {
      assertCardRecord(input);
      let result;
      try {
        result = await run({
          method: "POST",
          path: CARDS_PATH,
          body: {
            card_id: input.card_id,
            controller_address: input.controller_address.toLowerCase(),
            owner_address: input.owner_address.toLowerCase(),
            agent_id: input.agent_id.toLowerCase(),
            asset: input.asset,
            status: input.status,
            owner_configured_cap: input.owner_configured_cap,
            per_transaction_limit: input.per_transaction_limit,
            verified_credit: input.verified_credit,
            verified_credit_expires_at: input.verified_credit_expires_at,
            spent: input.spent,
            expires_at: input.expires_at,
            policy_version: input.policy_version,
            allowlist_hash: input.allowlist_hash,
            source_block: input.source_block,
            source_tx_hash: input.source_tx_hash.toLowerCase(),
            created_at: input.created_at,
            updated_at: input.updated_at,
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card record failed.", false);
      }
      if (result.status === 409) {
        const text = JSON.stringify(result.body);
        if (text.includes("cards_agent_active_uidx") || text.includes("agent")) {
          throw new PersistenceError("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
        }
        // Same event identity is idempotent; stale/conflicting event is CONFLICT.
        // Without a read-back we fail closed as CONFLICT for non-active duplicates.
        throw new PersistenceError("CONFLICT", "Card event conflict.", false);
      }
      if (result.status === 400) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      const body = result.body;
      if (Array.isArray(body) && body.length === 1) {
        return toCardRecord(body[0] as Record<string, unknown>);
      }
      if (Array.isArray(body) && body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      return input;
    },

    async transitionStatus(input): Promise<CardRecord> {
      if (!isValidCardTransition(input.from, input.to)) {
        throw new PersistenceError("INVALID_ROW", "Illegal card transition.", false);
      }
      if (!TX_HASH.test(input.sourceTxHash.toLowerCase())) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      // Enforce source_block monotonicity: read current row first (fail-closed
      // on stale ordering), then conditional PATCH with status+source_block guard.
      let current;
      try {
        current = await run({
          method: "GET",
          path: `${CARDS_PATH}?card_id=eq.${encodeURIComponent(input.cardId)}&select=card_id,status,source_block`,
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card read failed.", false);
      }
      const rows = current.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new PersistenceError("NOT_FOUND", "Card not found.", false);
      }
      if (rows.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      const currentBlock = Number((rows[0] as Record<string, unknown>)["source_block"]);
      if (!Number.isFinite(currentBlock) || input.sourceBlock <= currentBlock) {
        throw new PersistenceError("CONFLICT", "Stale card event.", false);
      }
      const now = new Date().toISOString();
      let result;
      try {
        result = await run({
          method: "PATCH",
          path:
            `${CARDS_PATH}?card_id=eq.${encodeURIComponent(input.cardId)}` +
            `&status=eq.${input.from}&source_block=lt.${input.sourceBlock}`,
          body: {
            status: input.to,
            source_block: input.sourceBlock,
            source_tx_hash: input.sourceTxHash.toLowerCase(),
            updated_at: now,
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card transition failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      if (body.length === 1) return toCardRecord(body[0] as Record<string, unknown>);
      throw new PersistenceError("CONFLICT", "Card event conflict.", false);
    },

    async close(input): Promise<CardRecord> {
      if (!TX_HASH.test(input.sourceTxHash.toLowerCase())) {
        throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
      }
      let current;
      try {
        current = await run({
          method: "GET",
          path: `${CARDS_PATH}?card_id=eq.${encodeURIComponent(input.cardId)}&select=card_id,status,source_block`,
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card read failed.", false);
      }
      const rows = current.body;
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new PersistenceError("NOT_FOUND", "Card not found.", false);
      }
      const row = rows[0] as Record<string, unknown>;
      const from = String(row["status"] ?? "") as DbCardStatus;
      if (from === "CLOSED") {
        throw new PersistenceError("CONFLICT", "Card already closed.", false);
      }
      if (!isValidCardTransition(from, "CLOSED")) {
        throw new PersistenceError("INVALID_ROW", "Illegal card transition.", false);
      }
      const currentBlock = Number(row["source_block"]);
      if (!Number.isFinite(currentBlock) || input.sourceBlock <= currentBlock) {
        throw new PersistenceError("CONFLICT", "Stale card event.", false);
      }
      const now = new Date().toISOString();
      let result;
      try {
        result = await run({
          method: "PATCH",
          path:
            `${CARDS_PATH}?card_id=eq.${encodeURIComponent(input.cardId)}` +
            `&status=eq.${from}&source_block=lt.${input.sourceBlock}`,
          body: {
            status: "CLOSED",
            source_block: input.sourceBlock,
            source_tx_hash: input.sourceTxHash.toLowerCase(),
            updated_at: now,
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Card close failed.", false);
      }
      const body = result.body;
      if (Array.isArray(body) && body.length === 1) {
        return toCardRecord(body[0] as Record<string, unknown>);
      }
      throw new PersistenceError("CONFLICT", "Card event conflict.", false);
    },
  };
}
