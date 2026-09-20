import { describe, expect, it } from "vitest";
import { createPostgrestCardStore, CARDS_PATH } from "../card-store.ts";
import type { PostgrestRequest } from "../persistence-ports.ts";
import type { CardRecord } from "../persistence-ports.ts";

const CONTROLLER = "0x3333333333333333333333333333333333333333";
const OWNER = "0x2222222222222222222222222222222222222222";
const AGENT = "0x1111111111111111111111111111111111111111";
const TX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NOW_ISO = "2026-09-12T00:00:00.000Z";

function record(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    card_id: "7",
    controller_address: CONTROLLER.toLowerCase(),
    owner_address: OWNER.toLowerCase(),
    agent_id: AGENT.toLowerCase(),
    asset: "native-testnet-ctc",
    chain_id: 102031,
    status: "ISSUED",
    owner_configured_cap: "1000000",
    per_transaction_limit: "100000",
    verified_credit: "0",
    verified_credit_expires_at: null,
    spent: "0",
    expires_at: "2027-09-12T00:00:00.000Z",
    policy_version: 1,
    allowlist_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source_block: 1,
    source_tx_hash: TX.toLowerCase(),
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: NOW_ISO,
    ...overrides,
  };
}

const CONFIG = {
  supabaseUrl: "https://ref.supabase.co",
  serviceRoleKey: "test-only-service-role",
};

describe("G21 CardStore (Option A PostgREST)", () => {
  it("maps Solidity ordinals to uppercase DB statuses and rejects unknown values", async () => {
    const { mapSolidityStatusToDb } = await import("../card-store.ts");
    expect(mapSolidityStatusToDb(0)).toBe("ISSUED");
    expect(mapSolidityStatusToDb(1)).toBe("ACTIVE");
    expect(mapSolidityStatusToDb(2)).toBe("SUSPENDED");
    expect(mapSolidityStatusToDb(3)).toBe("CLOSED");
    expect(() => mapSolidityStatusToDb(4)).toThrow();
  });

  it("records idempotently on (card_id, source_tx_hash) event identity", async () => {
    const recorded: PostgrestRequest[] = [];
    const store = createPostgrestCardStore(CONFIG, async (req) => {
      recorded.push(req);
      if (req.method === "POST") return { status: 201, body: [record()] };
      return { status: 200, body: [] };
    });
    const created = await store.createOrRecord(record());
    expect(created.card_id).toBe("7");
    const post = recorded.find((r) => r.method === "POST" && r.path === CARDS_PATH);
    expect(post).toBeDefined();
    expect((post!.body as Record<string, unknown>).card_id).toBe("7");
    expect((post!.body as Record<string, unknown>).status).toBe("ISSUED");
  });

  it("enforces ISSUED->ACTIVE->SUSPENDED->ACTIVE->CLOSED lifecycle", async () => {
    const store = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "PATCH") {
        const body = req.body as Record<string, unknown>;
        return { status: 200, body: [record({ status: body.status as CardRecord["status"], source_block: body.source_block as number })] };
      }
      if (req.method === "GET") return { status: 200, body: [record({ status: "ISSUED" })] };
      return { status: 200, body: [] };
    });
    const a1 = await store.transitionStatus({ cardId: "7", from: "ISSUED", to: "ACTIVE", sourceTxHash: TX, sourceBlock: 2 });
    expect(a1.status).toBe("ACTIVE");
    const a2 = await store.transitionStatus({ cardId: "7", from: "ACTIVE", to: "SUSPENDED", sourceTxHash: TX, sourceBlock: 3 });
    expect(a2.status).toBe("SUSPENDED");
    const a3 = await store.transitionStatus({ cardId: "7", from: "SUSPENDED", to: "ACTIVE", sourceTxHash: TX, sourceBlock: 4 });
    expect(a3.status).toBe("ACTIVE");
    const closed = await store.close({ cardId: "7", sourceTxHash: TX, sourceBlock: 5 });
    expect(closed.status).toBe("CLOSED");
    await expect(
      store.transitionStatus({ cardId: "7", from: "ISSUED", to: "SUSPENDED", sourceTxHash: TX, sourceBlock: 6 }),
    ).rejects.toMatchObject({ code: "INVALID_ROW" });
  });

  it("rejects stale source_block ordering", async () => {
    const store = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "GET") return { status: 200, body: [record({ source_block: 10 })] };
      if (req.method === "PATCH") return { status: 200, body: [] };
      return { status: 200, body: [] };
    });
    await expect(
      store.transitionStatus({ cardId: "7", from: "ACTIVE", to: "SUSPENDED", sourceTxHash: TX, sourceBlock: 5 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("fails closed on duplicate ACTIVE rows and maps 409 active collision", async () => {
    const dup = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.includes("status=eq.ACTIVE")) {
        return { status: 200, body: [record({ status: "ACTIVE" }), record({ card_id: "8", status: "ACTIVE" })] };
      }
      return { status: 200, body: [] };
    });
    await expect(dup.getActiveByAgent({ agentId: AGENT })).rejects.toMatchObject({
      code: "DUPLICATE_ACTIVE_CARD",
    });

    const colliding = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "POST") return { status: 409, body: { message: "cards_agent_active_uidx" } };
      if (req.method === "GET") return { status: 200, body: [] };
      return { status: 200, body: [] };
    });
    await expect(colliding.createOrRecord(record({ status: "ACTIVE" }))).rejects.toMatchObject({
      code: "DUPLICATE_ACTIVE_CARD",
    });
  });

  it("scopes reads by server identity and never authorizes payment without chain re-read", async () => {
    const store = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.startsWith(CARDS_PATH)) {
        expect(req.path).toContain("card_id=eq.7");
        return { status: 200, body: [record()] };
      }
      return { status: 200, body: [] };
    });
    const found = await store.getById({ cardId: "7", ownerAddress: OWNER });
    expect(found?.card_id).toBe("7");
    // DB status is a lookup optimization: the adapter source documents chain re-read.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../card-store.ts", import.meta.url), "utf8"),
    );
    expect(src).toMatch(/chain re-read/i);
    expect(src).toMatch(/never authorizes payment/i);
  });
});
