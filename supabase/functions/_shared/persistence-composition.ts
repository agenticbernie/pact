/**
 * Option A persistence composition (G21): explicit fake vs PostgREST
 * selection with no environment-based silent fallback.
 *
 * Fake stores are in-memory, deterministic, local-only. They must be
 * selected only by Vitest/local test factories and can never be injected
 * into a deployed composition root. PostgREST stores are selected only by
 * the regional/server function via requirePostgrestConfig (SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY server-only). Missing config fails closed;
 * production never falls back to a fake.
 */

import type { SessionPersistence } from "../session/index.ts";
import { createPostgrestSessionPersistence } from "./session-challenge-store.ts";
import {
  createPostgrestIntentStore,
  type IntentStoreAdapter,
} from "./intent-store.ts";
import {
  createPostgrestCardStore,
  type CardStore,
} from "./card-store.ts";
import {
  requirePostgrestConfig as requireConfig,
  type PostgrestConfig,
  type PostgrestTransport,
} from "./persistence-ports.ts";
import type { LaneConfig, LaneSelection } from "./lane-config.ts";

export { requirePostgrestConfig } from "./persistence-ports.ts";

export type FakePersistence = {
  session: SessionPersistence;
  intent: IntentStoreAdapter;
  card: CardStore;
};

export type PostgrestPersistence = {
  session: SessionPersistence;
  intent: IntentStoreAdapter;
  card: CardStore;
};

export function createFakeSessionPersistence(): SessionPersistence {
  const challenges = new Map<
    string,
    { nonceHash: string; wallet: string; message: string; expiresAtMs: number; consumedAtMs: number | null }
  >();
  const sessions = new Map<
    string,
    { id: string; tokenHash: string; wallet: string; role: "user"; issuedAtMs: number; expiresAtMs: number; revokedAtMs: number | null }
  >();
  return {
    async insertChallenge(row) {
      if (challenges.has(row.nonceHash)) {
        const { PersistenceError } = await import("./persistence-ports.ts");
        throw new PersistenceError("CONFLICT", "Duplicate challenge hash.", false);
      }
      challenges.set(row.nonceHash, { ...row });
    },
    async consumeChallenge(nonceHash: string) {
      const row = challenges.get(nonceHash) ?? null;
      if (row === null || row.consumedAtMs !== null) return null;
      row.consumedAtMs = Date.now();
      return { ...row };
    },
    async insertSession(row) {
      sessions.set(row.id, { ...row });
    },
    async findSession(tokenHash: string, wallet: string) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash && session.wallet === wallet) {
          if (session.revokedAtMs !== null || session.expiresAtMs <= Date.now()) return null;
          return { ...session };
        }
      }
      return null;
    },
    async revokeSession(tokenHash: string, wallet: string, nowMs: number) {
      for (const session of sessions.values()) {
        if (session.tokenHash === tokenHash && session.wallet === wallet) {
          if (session.revokedAtMs !== null) return false;
          session.revokedAtMs = nowMs;
          return true;
        }
      }
      return false;
    },
  };
}

export function createFakePersistence(): FakePersistence {
  const session = createFakeSessionPersistence();
  const intents = new Map<string, Parameters<IntentStoreAdapter["insertIntent"]>[0]["intent"]>();
  const byIdempotency = new Map<string, string>();
  const statuses = new Map<string, string>();
  const cards = new Map<string, Parameters<CardStore["createOrRecord"]>[0]>();

  const intent: IntentStoreAdapter = {
    async insertIntent(input) {
      const existingId = byIdempotency.get(input.idempotencyKey);
      if (existingId !== undefined) {
        const prior = intents.get(existingId);
        if (prior !== undefined) {
          const same =
            prior.intentHash.toLowerCase() === input.intent.intentHash.toLowerCase() &&
            prior.cardId === input.intent.cardId &&
            prior.agentId.toLowerCase() === input.intent.agentId.toLowerCase();
          if (same) return { ...prior };
          const { PersistenceError } = await import("./persistence-ports.ts");
          throw new PersistenceError("IDEMPOTENCY_CONFLICT", "Idempotency conflict.", false);
        }
      }
      intents.set(input.intent.intentId, { ...input.intent });
      byIdempotency.set(input.idempotencyKey, input.intent.intentId);
      statuses.set(input.intent.intentId, "ready");
      return { ...input.intent };
    },
    async getById(input) {
      const found = intents.get(input.intentId) ?? null;
      return found === null ? null : { ...found };
    },
    async getByIdempotencyKey(input) {
      const id = byIdempotency.get(input.idempotencyKey) ?? null;
      if (id === null) return null;
      const found = intents.get(id) ?? null;
      return found === null ? null : { ...found };
    },
    async markStatus(input) {
      const { PersistenceError } = await import("./persistence-ports.ts");
      if (input.status === "ready") {
        throw new PersistenceError("INVALID_ROW", "Invalid intent status.", false);
      }
      const current = statuses.get(input.intentId);
      if (current === undefined) {
        throw new PersistenceError("NOT_FOUND", "Intent not found.", false);
      }
      if (current !== "ready") {
        throw new PersistenceError("CONFLICT", "Intent conflict.", false);
      }
      statuses.set(input.intentId, input.status);
    },
    async save(intent) {
      await this.insertIntent({
        intent,
        idempotencyKey: intent.intentId,
        ownerAddress: intent.agentId,
        requestId: intent.intentId,
      });
    },
  };

  const card: CardStore = {
    async getById(input) {
      const found = cards.get(input.cardId) ?? null;
      return found === null ? null : { ...found };
    },
    async getActiveByAgent(input) {
      const actives = [...cards.values()].filter(
        (c) => c.agent_id.toLowerCase() === input.agentId.toLowerCase() && c.status === "ACTIVE",
      );
      if (actives.length === 0) return null;
      if (actives.length > 1) {
        const { PersistenceError } = await import("./persistence-ports.ts");
        throw new PersistenceError("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
      }
      return { ...actives[0]! };
    },
    async createOrRecord(input) {
      const { PersistenceError } = await import("./persistence-ports.ts");
      const existing = cards.get(input.card_id);
      if (existing !== undefined) {
        if (existing.source_tx_hash.toLowerCase() === input.source_tx_hash.toLowerCase()) {
          return { ...existing };
        }
        throw new PersistenceError("CONFLICT", "Card event conflict.", false);
      }
      if (input.status === "ACTIVE") {
        const collision = [...cards.values()].some(
          (c) => c.agent_id.toLowerCase() === input.agent_id.toLowerCase() && c.status === "ACTIVE",
        );
        if (collision) {
          throw new PersistenceError("DUPLICATE_ACTIVE_CARD", "Duplicate active card.", false);
        }
      }
      cards.set(input.card_id, { ...input });
      return { ...input };
    },
    async transitionStatus(input) {
      const { PersistenceError } = await import("./persistence-ports.ts");
      const current = cards.get(input.cardId);
      if (current === undefined) {
        throw new PersistenceError("NOT_FOUND", "Card not found.", false);
      }
      const allowed: Record<string, string[]> = {
        ISSUED: ["ACTIVE", "CLOSED"],
        ACTIVE: ["SUSPENDED", "CLOSED"],
        SUSPENDED: ["ACTIVE", "CLOSED"],
        CLOSED: [],
      };
      if (!(allowed[current.status]?.includes(input.to) ?? false) || current.status !== input.from) {
        throw new PersistenceError("INVALID_ROW", "Illegal card transition.", false);
      }
      const updated = { ...current, status: input.to, source_block: input.sourceBlock, source_tx_hash: input.sourceTxHash.toLowerCase() };
      cards.set(input.cardId, updated);
      return { ...updated };
    },
    async close(input) {
      const { PersistenceError } = await import("./persistence-ports.ts");
      const current = cards.get(input.cardId);
      if (current === undefined) {
        throw new PersistenceError("NOT_FOUND", "Card not found.", false);
      }
      if (current.status === "CLOSED") {
        throw new PersistenceError("CONFLICT", "Card already closed.", false);
      }
      const updated = { ...current, status: "CLOSED" as const, source_block: input.sourceBlock, source_tx_hash: input.sourceTxHash.toLowerCase() };
      cards.set(input.cardId, updated);
      return { ...updated };
    },
  };

  return { session, intent, card };
}

export function createPostgrestPersistence(
  config: PostgrestConfig,
  transport?: PostgrestTransport,
  lane?: LaneSelection | LaneConfig,
): PostgrestPersistence {
  return {
    session: createPostgrestSessionPersistence(config, transport),
    intent: createPostgrestIntentStore(config, transport, lane),
    card: createPostgrestCardStore(config, transport, lane),
  };
}

export function createPostgrestPersistenceFromEnv(
  env: Record<string, string | undefined>,
  transport?: PostgrestTransport,
  lane?: LaneSelection | LaneConfig,
): PostgrestPersistence {
  const config = requireConfig(env);
  return createPostgrestPersistence(config, transport, lane);
}
