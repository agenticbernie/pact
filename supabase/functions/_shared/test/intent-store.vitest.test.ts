import { describe, expect, it } from "vitest";
import { createPostgrestIntentStore, INTENTS_PATH } from "../intent-store.ts";
import type { PostgrestRequest } from "../persistence-ports.ts";
import type { AgentIntent } from "../../../../packages/domain/src/types.ts";

const AGENT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const CARD = "7";
const NOW_MS = Date.parse("2026-09-12T00:00:00.000Z");

function intent(overrides: Partial<AgentIntent> = {}): AgentIntent {
  return {
    intentId: "intent-req-1",
    agentId: AGENT,
    cardId: CARD,
    merchantId: "coffee-demo",
    amountBaseUnits: "1000",
    asset: "native-testnet-ctc",
    purpose: "coffee",
    confidence: 0.9,
    provider: "openai",
    model: "gpt-5.6-luna",
    createdAt: "2026-09-12T00:00:00.000Z",
    expiresAt: "2026-09-12T00:15:00.000Z",
    policyVersion: 1,
    intentHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ...overrides,
  };
}

function dbRow(from: AgentIntent, overrides: Record<string, unknown> = {}) {
  return {
    intent_id: from.intentId,
    card_id: from.cardId,
    agent_id: from.agentId.toLowerCase(),
    merchant_id: from.merchantId,
    amount_base_units: from.amountBaseUnits,
    asset: from.asset,
    purpose: from.purpose,
    confidence: from.confidence,
    provider: from.provider,
    model: from.model,
    policy_version: from.policyVersion,
    intent_hash: from.intentHash,
    status: "ready",
    request_id: "req-1",
    idempotency_key: "idem-1",
    created_at: from.createdAt,
    expires_at: from.expiresAt,
    ...overrides,
  };
}

const CONFIG = {
  supabaseUrl: "https://ref.supabase.co",
  serviceRoleKey: "test-only-service-role",
};

describe("G21 IntentStore (Option A PostgREST)", () => {
  it("inserts with server-bound card/agent ownership and idempotency key", async () => {
    const recorded: PostgrestRequest[] = [];
    const cardRow = {
      card_id: CARD,
      agent_id: AGENT.toLowerCase(),
      owner_address: OWNER.toLowerCase(),
      status: "ACTIVE",
    };
    const store = createPostgrestIntentStore(CONFIG, async (req) => {
      recorded.push(req);
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [cardRow] };
      }
      if (req.method === "POST" && req.path === INTENTS_PATH) {
        return { status: 201, body: [dbRow(intent())] };
      }
      return { status: 200, body: [] };
    });
    const saved = await store.insertIntent({
      intent: intent(),
      idempotencyKey: "idem-1",
      ownerAddress: OWNER,
      requestId: "req-1",
    });
    expect(saved.intentId).toBe("intent-req-1");
    const post = recorded.find((r) => r.method === "POST" && r.path === INTENTS_PATH);
    expect(post).toBeDefined();
    const body = post!.body as Record<string, unknown>;
    expect(body.agent_id).toBe(AGENT.toLowerCase());
    expect(body.card_id).toBe(CARD);
    expect(body.idempotency_key).toBe("idem-1");
    expect(body.request_id).toBe("req-1");
  });

  it("rejects agent mismatch against the authoritative card row", async () => {
    const store = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return {
          status: 200,
          body: [{ card_id: CARD, agent_id: OWNER.toLowerCase(), owner_address: OWNER.toLowerCase(), status: "ACTIVE" }],
        };
      }
      return { status: 200, body: [] };
    });
    await expect(
      store.insertIntent({ intent: intent(), idempotencyKey: "idem-1", ownerAddress: OWNER, requestId: "req-1" }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_DENIED" });
  });

  it("replays equal idempotency safely and rejects conflicting idempotency", async () => {
    const existing = intent();
    const equalStore = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [{ card_id: CARD, agent_id: AGENT.toLowerCase(), owner_address: OWNER.toLowerCase(), status: "ACTIVE" }] };
      }
      if (req.method === "POST") return { status: 409, body: { message: "duplicate" } };
      if (req.method === "GET" && req.path.startsWith(INTENTS_PATH)) {
        return { status: 200, body: [dbRow(existing)] };
      }
      return { status: 200, body: [] };
    });
    const replayed = await equalStore.insertIntent({
      intent: existing,
      idempotencyKey: "idem-1",
      ownerAddress: OWNER,
      requestId: "req-1",
    });
    expect(replayed.intentId).toBe(existing.intentId);

    const conflictStore = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [{ card_id: CARD, agent_id: AGENT.toLowerCase(), owner_address: OWNER.toLowerCase(), status: "ACTIVE" }] };
      }
      if (req.method === "POST") return { status: 409, body: { message: "duplicate" } };
      if (req.method === "GET" && req.path.startsWith(INTENTS_PATH)) {
        return { status: 200, body: [dbRow(existing, { amount_base_units: "9999" })] };
      }
      return { status: 200, body: [] };
    });
    await expect(
      conflictStore.insertIntent({
        intent: intent({ amountBaseUnits: "1" }),
        idempotencyKey: "idem-1",
        ownerAddress: OWNER,
        requestId: "req-1",
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("scopes reads by owner/agent and fails closed on >1 rows", async () => {
    const scoped = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.path.startsWith(INTENTS_PATH) && req.method === "GET") {
        expect(req.path).toContain("intent_id=eq.intent-req-1");
        return { status: 200, body: [dbRow(intent())] };
      }
      if (req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [{ card_id: CARD, agent_id: AGENT.toLowerCase(), owner_address: OWNER.toLowerCase(), status: "ACTIVE" }] };
      }
      return { status: 200, body: [] };
    });
    const found = await scoped.getById({ intentId: "intent-req-1", ownerAddress: OWNER, agentId: AGENT });
    expect(found?.intentId).toBe("intent-req-1");

    const dup = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.path.startsWith(INTENTS_PATH)) return { status: 200, body: [dbRow(intent()), dbRow(intent())] };
      return { status: 200, body: [] };
    });
    await expect(dup.getById({ intentId: "intent-req-1", ownerAddress: OWNER })).rejects.toMatchObject({
      code: "INVALID_ROW",
    });
  });

  it("marks only legal ready->terminal transitions with ownership scope", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestIntentStore(CONFIG, async (req) => {
      recorded.push(req);
      if (req.method === "PATCH") return { status: 200, body: [dbRow(intent(), { status: "consumed" })] };
      return { status: 200, body: [] };
    });
    await store.markStatus({ intentId: "intent-req-1", ownerAddress: OWNER, status: "consumed", now: new Date(NOW_MS).toISOString() });
    const patch = recorded.find((r) => r.method === "PATCH");
    expect(patch).toBeDefined();
    expect(patch!.path).toContain("intent_id=eq.intent-req-1");
    expect(patch!.path).toContain("status=eq.ready");
    await expect(
      store.markStatus({ intentId: "intent-req-1", ownerAddress: OWNER, status: "ready" as never, now: new Date(NOW_MS).toISOString() }),
    ).rejects.toMatchObject({ code: "INVALID_ROW" });
  });

  it("persists zero rows on provider/schema failure paths (no POST issued)", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestIntentStore(CONFIG, async (req) => {
      recorded.push(req);
      return { status: 200, body: [] };
    });
    // Invalid intent must be rejected before any POST.
    await expect(
      store.insertIntent({
        intent: intent({ asset: "wrong-asset" as never }),
        idempotencyKey: "idem-1",
        ownerAddress: OWNER,
        requestId: "req-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ROW" });
    expect(recorded.filter((r) => r.method === "POST" && r.path === INTENTS_PATH)).toHaveLength(0);
  });
});
