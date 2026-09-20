/**
 * Option A IntentStore adapter (G21): server-only PostgREST persistence for
 * AgentIntent records. Uses the canonical AgentIntent type only; never
 * recomputes the canonical hash. agent_id is server-bound to the
 * authoritative card agent; client-provided agent IDs are never authority.
 *
 * Exact REST path: /rest/v1/intents (+ /rest/v1/cards for ownership).
 * Allowed methods: GET (scoped read), POST (single-row insert),
 * PATCH (single conditional update). DELETE/PUT/UPSERT/RPC forbidden.
 * Length 1 applied, 0 not applied, >1 on unique read is INVALID_ROW,
 * except active-card paths where >1 is DUPLICATE_ACTIVE_CARD (card store).
 * Equal idempotency replay is a safe read; differing fields are
 * IDEMPOTENCY_CONFLICT, never overwrite.
 */

import type { AgentIntent } from "../../../packages/domain/src/types.ts";
import {
  PersistenceError,
  POSTGREST_TIMEOUT_MS,
  buildPostgrestHeaders,
  type PostgrestConfig,
  type PostgrestTransport,
} from "./persistence-ports.ts";
import {
  defaultChainForAsset,
  isLaneAssetPair,
  resolveLane,
  type LaneConfig,
  type LaneSelection,
} from "./lane-config.ts";

export const INTENTS_PATH = "/rest/v1/intents";
export const INTENT_CARDS_PATH = "/rest/v1/cards";

const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX64_TX = /^0x[0-9a-f]{64}$/;

export type IntentInsertInput = {
  intent: AgentIntent;
  idempotencyKey: string;
  ownerAddress: string;
  requestId: string;
  /** Lane chain override. Defaults to the factory lane, else legacy (102031). */
  chainId?: number;
};

export type IntentGetInput = {
  intentId: string;
  ownerAddress: string;
  agentId?: string;
};

export type IntentIdempotencyGetInput = {
  idempotencyKey: string;
  ownerAddress: string;
  agentId: string;
};

export type IntentMarkStatusInput = {
  intentId: string;
  ownerAddress: string;
  status: "ready" | "expired" | "consumed" | "failed";
  now: string;
};

export type IntentStoreAdapter = {
  insertIntent(input: IntentInsertInput): Promise<AgentIntent>;
  getById(input: IntentGetInput): Promise<AgentIntent | null>;
  getByIdempotencyKey(input: IntentIdempotencyGetInput): Promise<AgentIntent | null>;
  markStatus(input: IntentMarkStatusInput): Promise<void>;
  save(intent: AgentIntent): Promise<void>;
};

function intentChainId(intent: AgentIntent, lane?: LaneConfig): number {
  if (intent.chainId !== undefined) return intent.chainId;
  if (lane !== undefined) return lane.chainId;
  // Chain-less rows (legacy fakes/fixtures): infer from the asset so Arc
  // rows stay readable without a lane; explicit chain_id always wins and
  // mismatched explicit pairs still fail the check below.
  return defaultChainForAsset(intent.asset);
}

function assertIntentShape(intent: AgentIntent, lane?: LaneConfig): void {
  // Lane-pair binding mirrors the card store: only known (chain, asset)
  // pairs persist, so an Arc row can never disguise as CTC and vice versa.
  if (!isLaneAssetPair(intentChainId(intent, lane), intent.asset)) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
  if (lane !== undefined && (intentChainId(intent, lane) !== lane.chainId || intent.asset !== lane.asset)) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!EVM_ADDRESS.test(intent.agentId.toLowerCase())) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!/^(0|[1-9][0-9]*)$/.test(intent.cardId)) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!HEX64_TX.test(intent.intentHash)) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
  if (!Number.isFinite(Date.parse(intent.createdAt)) || !Number.isFinite(Date.parse(intent.expiresAt))) {
    throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
  }
}

export function toAgentIntent(row: Record<string, unknown>, lane?: LaneConfig): AgentIntent {
  const intent = {
    intentId: row["intent_id"],
    agentId: row["agent_id"],
    cardId: row["card_id"],
    merchantId: row["merchant_id"],
    amountBaseUnits: row["amount_base_units"],
    asset: row["asset"],
    purpose: row["purpose"],
    confidence: row["confidence"],
    provider: row["provider"],
    model: row["model"],
    createdAt: row["created_at"],
    expiresAt: row["expires_at"],
    policyVersion: row["policy_version"],
    intentHash: row["intent_hash"],
  } as unknown as AgentIntent;
  if (row["chain_id"] !== undefined && row["chain_id"] !== null) {
    intent.chainId = Number(row["chain_id"]);
  }
  assertIntentShape(intent, lane);
  return intent;
}

export function canonicalEqual(a: AgentIntent, b: AgentIntent): boolean {
  return (
    a.intentHash.toLowerCase() === b.intentHash.toLowerCase() &&
    a.cardId === b.cardId &&
    a.agentId.toLowerCase() === b.agentId.toLowerCase() &&
    a.merchantId === b.merchantId &&
    a.amountBaseUnits === b.amountBaseUnits &&
    a.asset === b.asset &&
    a.purpose === b.purpose &&
    a.policyVersion === b.policyVersion
  );
}

const INTENT_SELECT = "intent_id,card_id,agent_id,merchant_id,amount_base_units,asset,purpose,confidence,provider,model,created_at,expires_at,policy_version,intent_hash";

function scopedIntentPath(predicate: string, ownerAddress: string, agentId?: string): string {
  return `${INTENTS_PATH}?${predicate}` +
    (agentId === undefined ? "" : `&agent_id=eq.${encodeURIComponent(agentId.toLowerCase())}`) +
    `&cards.owner_address=eq.${encodeURIComponent(ownerAddress.toLowerCase())}` +
    `&select=${INTENT_SELECT},cards!inner(owner_address)`;
}

export function scopedIntentRow(
  row: Record<string, unknown>,
  ownerAddress: string,
  agentId?: string,
): Record<string, unknown> | null {
  if (agentId !== undefined && String(row["agent_id"] ?? "").toLowerCase() !== agentId.toLowerCase()) return null;
  const relation = row["cards"];
  const card = Array.isArray(relation) ? (relation.length === 1 ? relation[0] : undefined) : relation;
  if (typeof card !== "object" || card === null) return null;
  if (String((card as Record<string, unknown>)["owner_address"] ?? "").toLowerCase() !== ownerAddress.toLowerCase()) {
    return null;
  }
  return row;
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
      throw new PersistenceError("UNAVAILABLE", "Persistence transport failed.", true);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createPostgrestIntentStore(
  config: PostgrestConfig,
  transport?: PostgrestTransport,
  lane?: LaneSelection | LaneConfig,
): IntentStoreAdapter {
  const run = transport ?? defaultTransport(config);
  const strictLane = lane === undefined ? undefined : resolveLane(lane);

  async function resolveCardAgent(cardId: string): Promise<Record<string, unknown> | null> {
    let result;
    try {
      result = await run({
        method: "GET",
        path: `${INTENT_CARDS_PATH}?card_id=eq.${encodeURIComponent(cardId)}&select=card_id,agent_id,owner_address,status`,
      });
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError("UNAVAILABLE", "Card lookup failed.", false);
    }
    const body = result.body;
    if (!Array.isArray(body)) {
      throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
    }
    if (body.length === 0) return null;
    if (body.length > 1) {
      throw new PersistenceError("INVALID_ROW", "Invalid card row.", false);
    }
    return body[0] as Record<string, unknown>;
  }

  return {
    async insertIntent(input: IntentInsertInput): Promise<AgentIntent> {
      const effectiveChainId =
        input.chainId ?? strictLane?.chainId ?? defaultChainForAsset(input.intent.asset);
      assertIntentShape(
        input.chainId === undefined ? input.intent : { ...input.intent, chainId: input.chainId },
        strictLane,
      );
      if (input.idempotencyKey.length === 0 || input.requestId.length === 0) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      if (!EVM_ADDRESS.test(input.ownerAddress.toLowerCase())) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      // Server first resolves the authoritative card row, rejects on
      // missing/inactive/agent-mismatch. Cross-table enforcement is
      // fail-closed application ordering plus UNIQUE/FOREIGN KEY guards.
      const card = await resolveCardAgent(input.intent.cardId);
      if (card === null) {
        throw new PersistenceError("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }
      const cardAgent = String(card["agent_id"] ?? "").toLowerCase();
      const cardStatus = String(card["status"] ?? "");
      if (cardAgent !== input.intent.agentId.toLowerCase()) {
        throw new PersistenceError("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }
      if (cardStatus !== "ACTIVE" && cardStatus !== "ISSUED") {
        throw new PersistenceError("OWNERSHIP_DENIED", "Card ownership denied.", false);
      }

      let result;
      try {
        result = await run({
          method: "POST",
          path: INTENTS_PATH,
          body: {
            intent_id: input.intent.intentId,
            card_id: input.intent.cardId,
            agent_id: input.intent.agentId.toLowerCase(),
            merchant_id: input.intent.merchantId,
            amount_base_units: input.intent.amountBaseUnits,
            asset: input.intent.asset,
            chain_id: effectiveChainId,
            purpose: input.intent.purpose,
            confidence: input.intent.confidence,
            provider: input.intent.provider,
            model: input.intent.model,
            policy_version: input.intent.policyVersion,
            intent_hash: input.intent.intentHash,
            status: "ready",
            request_id: input.requestId,
            idempotency_key: input.idempotencyKey,
            expires_at: input.intent.expiresAt,
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Intent insert failed.", false);
      }
      if (result.status === 201 || result.status === 200) {
        const body = result.body;
        if (Array.isArray(body) && body.length === 1) {
          return toAgentIntent(body[0] as Record<string, unknown>, strictLane);
        }
        if (Array.isArray(body) && body.length > 1) {
          throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
        }
        return input.intent;
      }
      if (result.status === 409) {
        // Scoped GET by idempotency_key plus owner/card scope.
        let existing;
        try {
          existing = await run({
            method: "GET",
            path:
              scopedIntentPath(`idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}`, input.ownerAddress, input.intent.agentId),
          });
        } catch (error) {
          if (error instanceof PersistenceError) throw error;
          throw new PersistenceError("UNAVAILABLE", "Intent replay read failed.", false);
        }
        const rows = existing.body;
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new PersistenceError("CONFLICT", "Intent conflict.", false);
        }
        if (rows.length > 1) {
          throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
        }
        const scopedPrior = scopedIntentRow(rows[0] as Record<string, unknown>, input.ownerAddress, input.intent.agentId);
        if (scopedPrior === null) {
          throw new PersistenceError("OWNERSHIP_DENIED", "Intent ownership denied.", false);
        }
        const prior = toAgentIntent(scopedPrior, strictLane);
        if (canonicalEqual(prior, input.intent)) {
          return prior;
        }
        throw new PersistenceError("IDEMPOTENCY_CONFLICT", "Idempotency conflict.", false);
      }
      if (result.status === 400) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      if (result.status === 401 || result.status === 403) {
        throw new PersistenceError("UNAVAILABLE", "Persistence unavailable.", false);
      }
      throw new PersistenceError("UNAVAILABLE", "Intent insert failed.", false);
    },

    async getById(input: IntentGetInput): Promise<AgentIntent | null> {
      if (input.intentId.length === 0) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      let result;
      try {
        result = await run({
          method: "GET",
          path: scopedIntentPath(`intent_id=eq.${encodeURIComponent(input.intentId)}`, input.ownerAddress, input.agentId),
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Intent read failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      if (body.length === 0) return null;
      if (body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      const row = scopedIntentRow(body[0] as Record<string, unknown>, input.ownerAddress, input.agentId);
      return row === null ? null : toAgentIntent(row, strictLane);
    },

    async getByIdempotencyKey(input: IntentIdempotencyGetInput): Promise<AgentIntent | null> {
      if (input.idempotencyKey.length === 0) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      let result;
      try {
        result = await run({
          method: "GET",
          path: scopedIntentPath(`idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}`, input.ownerAddress, input.agentId),
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Intent read failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      if (body.length === 0) return null;
      if (body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      const row = scopedIntentRow(body[0] as Record<string, unknown>, input.ownerAddress, input.agentId);
      return row === null ? null : toAgentIntent(row, strictLane);
    },

    async markStatus(input: IntentMarkStatusInput): Promise<void> {
      const allowed = new Set(["ready", "expired", "consumed", "failed"]);
      if (!allowed.has(input.status)) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent status.", false);
      }
      // Only legal transitions are ready -> expired|consumed|failed (terminal).
      // The PATCH predicate includes status=eq.ready so terminal rows cannot exit.
      if (input.status === "ready") {
        throw new PersistenceError("INVALID_ROW", "Invalid intent status.", false);
      }
      let result;
      try {
        result = await run({
          method: "PATCH",
          path:
            `${INTENTS_PATH}?intent_id=eq.${encodeURIComponent(input.intentId)}` +
            `&status=eq.ready`,
          body: { status: input.status },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Intent status update failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
      }
      if (body.length === 1) return;
      if (body.length === 0) {
        throw new PersistenceError("NOT_FOUND", "Intent not found.", false);
      }
      throw new PersistenceError("INVALID_ROW", "Invalid intent row.", false);
    },

    async save(intent: AgentIntent): Promise<void> {
      // Backward-compatible IntentStore.save: uses intentId as idempotency
      // and the intent's own card/agent as server scope. Gateway still calls
      // save() after shared validation; PostgREST path preserves that.
      await this.insertIntent({
        intent,
        idempotencyKey: intent.intentId,
        ownerAddress: intent.agentId,
        requestId: intent.intentId,
      });
    },
  };
}
