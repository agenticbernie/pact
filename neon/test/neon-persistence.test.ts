import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createNeonPersistence,
  createNeonPool,
  requireNeonEnv,
} from "../adapter/neon-persistence.ts";
import type { NeonQueryResult } from "../adapter/neon-persistence.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const HEX = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ARC_CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";

type RecordedQuery = { text: string; params: unknown[] };

function fakePool(
  handler: (query: RecordedQuery) => NeonQueryResult | { code: string; constraint?: string },
) {
  const recorded: RecordedQuery[] = [];
  return {
    recorded,
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        recorded.push({ text, params });
        const outcome = handler({ text, params });
        if (typeof (outcome as { code?: string }).code === "string") {
          throw outcome;
        }
        return outcome as NeonQueryResult;
      },
    },
  };
}

function arcCardRow() {
  return {
    card_id: "1",
    controller_address: ARC_CONTROLLER,
    owner_address: OWNER.toLowerCase(),
    agent_id: WALLET.toLowerCase(),
    asset: "arc-testnet-usdc",
    chain_id: 5042002,
    status: "ACTIVE",
    owner_configured_cap: "100000000000000000",
    per_transaction_limit: "10000000000000000",
    verified_credit: "0",
    verified_credit_expires_at: null,
    spent: "0",
    expires_at: "2027-09-19T00:00:00.000Z",
    policy_version: 1,
    allowlist_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source_block: 62948913,
    source_tx_hash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
  };
}

describe("Neon persistence adapter (RED-first, fake Pool)", () => {
  it("fails closed on backend selection and missing URL without touching pg", () => {
    expect(() => requireNeonEnv({})).toThrow();
    expect(() => requireNeonEnv({ PERSISTENCE_BACKEND: "supabase" })).toThrow();
    expect(() => requireNeonEnv({ PERSISTENCE_BACKEND: "neon" })).toThrow();
    expect(() => requireNeonEnv({ PERSISTENCE_BACKEND: "neon", DATABASE_URL: "postgres://u@localhost/db" })).not.toThrow();
    expect(() => createNeonPool("")).toThrow();
    expect(() => createNeonPool("   ")).toThrow();
  });

  it("parameterizes every user value (injection probe never reaches SQL text)", async () => {
    const evil = "' OR '1'='1";
    const { recorded, pool } = fakePool(() => ({ rows: [], rowCount: 0 }));
    const persistence = createNeonPersistence(pool);
    await expect(
      persistence.card.getById({ cardId: "7", ownerAddress: evil, agentId: evil }),
    ).resolves.toBeNull();
    const texts = recorded.map((q) => q.text).join("\n");
    expect(texts).not.toContain(evil);
    expect(texts.toLowerCase()).not.toContain(evil.toLowerCase());
    expect(recorded.some((q) => q.params.includes(evil.toLowerCase()))).toBe(true);
    expect(texts).toMatch(/\$\d+/);
  });

  it("consumes a challenge atomically in one conditional statement", async () => {
    const { recorded, pool } = fakePool(({ text }) => {
      if (text.startsWith("UPDATE session_challenges")) {
        return {
          rows: [{
            nonce_hash: HEX.slice(2),
            wallet_address: WALLET,
            message: "msg",
            expires_at: new Date(Date.now() + 60000).toISOString(),
            consumed_at: new Date().toISOString(),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const persistence = createNeonPersistence(pool);
    const consumed = await persistence.session.consumeChallenge(HEX.slice(2));
    expect(consumed?.nonceHash).toBe(HEX.slice(2));
    expect(recorded).toHaveLength(1);
    expect(recorded[0].text).toMatch(/UPDATE session_challenges SET consumed_at.*WHERE nonce_hash = \$1 AND consumed_at IS NULL RETURNING/i);
  });

  it("rejects second consume and honors expiry/revocation on reads", async () => {
    const { pool } = fakePool(() => ({ rows: [], rowCount: 0 }));
    const persistence = createNeonPersistence(pool);
    await expect(persistence.session.consumeChallenge(HEX.slice(2))).resolves.toBeNull();
    await expect(persistence.session.findSession(HEX.slice(2), WALLET)).resolves.toBeNull();
    expect(await persistence.session.revokeSession(HEX.slice(2), WALLET, Date.now())).toBe(false);
  });

  it("accepts Arc rows under the Arc lane and rejects CTC there", async () => {
    const { recorded, pool } = fakePool(() => ({ rows: [arcCardRow()], rowCount: 1 }));
    const persistence = createNeonPersistence(pool, "arc");
    const created = await persistence.card.createOrRecord(arcCardRow() as never);
    expect(created.card_id).toBe("1");
    const ctcRow = { ...arcCardRow(), asset: "native-testnet-ctc", chain_id: 102031 };
    await expect(persistence.card.createOrRecord(ctcRow as never)).rejects.toThrow();
    const ctcQueries = recorded.filter((q) => q.text.startsWith("INSERT INTO cards")).length;
    expect(ctcQueries).toBe(1);
  });

  it("keeps legacy CTC rows working without a lane", async () => {
    const { pool } = fakePool(() => ({
      rows: [{ ...arcCardRow(), asset: "native-testnet-ctc", chain_id: 102031 }],
      rowCount: 1,
    }));
    const persistence = createNeonPersistence(pool);
    const row = await persistence.card.getById({ cardId: "1" });
    expect(row?.asset).toBe("native-testnet-ctc");
  });

  it("scopes card reads by owner/agent and enforces lane on intents", async () => {
    const seen: RecordedQuery[] = [];
    const { pool } = fakePool((query) => {
      seen.push(query);
      return { rows: [], rowCount: 0 };
    });
    const persistence = createNeonPersistence(pool, "arc");
    await persistence.card.getById({ cardId: "1", ownerAddress: OWNER, agentId: WALLET });
    expect(seen[0].text).toMatch(/owner_address = \$\d/);
    expect(seen[0].text).toMatch(/agent_id = \$\d/);
    await persistence.intent.getById({ intentId: "x", ownerAddress: OWNER, agentId: WALLET });
    expect(seen[1].text).toMatch(/cards\.owner_address = \$\d/);
  });

  it("denies intent insert without a card and replays idempotency by content", async () => {
    const intent = {
      intentId: "intent-arc-1",
      agentId: WALLET,
      cardId: "1",
      merchantId: "arc-demo-merchant",
      amountBaseUnits: "1000",
      asset: "arc-testnet-usdc",
      purpose: "probe",
      confidence: 0.9,
      provider: "openai",
      model: "gpt-5.6-luna",
      createdAt: "2026-09-19T00:00:00.000Z",
      expiresAt: "2027-09-19T00:00:00.000Z",
      policyVersion: 1,
      intentHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    };
    const noCard = fakePool(() => ({ rows: [], rowCount: 0 }));
    const denied = createNeonPersistence(noCard.pool, "arc");
    await expect(denied.intent.insertIntent({
      intent, idempotencyKey: "idem-1", ownerAddress: OWNER, requestId: "req-1",
    })).rejects.toThrow();
    expect(noCard.recorded.some((q) => q.text.startsWith("INSERT INTO intents"))).toBe(false);

    const row = {
      intent_id: "intent-arc-1",
      card_id: "1",
      agent_id: WALLET.toLowerCase(),
      merchant_id: "arc-demo-merchant",
      amount_base_units: "1000",
      asset: "arc-testnet-usdc",
      chain_id: 5042002,
      purpose: "probe",
      confidence: 0.9,
      provider: "openai",
      model: "gpt-5.6-luna",
      policy_version: 1,
      intent_hash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      status: "ready",
      request_id: "req-1",
      idempotency_key: "idem-1",
      created_at: "2026-09-19T00:00:00.000Z",
      expires_at: "2027-09-19T00:00:00.000Z",
      cards_owner_address: OWNER.toLowerCase(),
    };
    const replay = fakePool(({ text }) => {
      if (text.startsWith("INSERT INTO intents")) throw { code: "23505", constraint: "intents_pkey" };
      if (text.includes("FROM cards WHERE card_id")) {
        return {
          rows: [{
            card_id: "1",
            agent_id: WALLET.toLowerCase(),
            owner_address: OWNER.toLowerCase(),
            status: "ACTIVE",
          }],
          rowCount: 1,
        };
      }
      return { rows: [row], rowCount: 1 };
    });
    const store = createNeonPersistence(replay.pool, "arc");
    const prior = await store.intent.insertIntent({
      intent, idempotencyKey: "idem-1", ownerAddress: OWNER, requestId: "req-1",
    });
    expect(prior.intentId).toBe("intent-arc-1");
    await expect(store.intent.insertIntent({
      intent: { ...intent, amountBaseUnits: "2000" },
      idempotencyKey: "idem-1",
      ownerAddress: OWNER,
      requestId: "req-1",
    })).rejects.toThrow();
  });

  it("maps duplicate-active vs generic conflicts by constraint name", async () => {
    const dup = fakePool(() => { throw { code: "23505", constraint: "cards_agent_active_uidx" }; });
    await expect(
      createNeonPersistence(dup.pool, "arc").card.createOrRecord(arcCardRow() as never),
    ).rejects.toThrow(/Duplicate active card/);
    const generic = fakePool(() => { throw { code: "23505", constraint: "cards_pkey" }; });
    await expect(
      createNeonPersistence(generic.pool, "arc").card.createOrRecord(arcCardRow() as never),
    ).rejects.toThrow(/conflict/i);
  });

  it("fails closed on connection loss with no raw leak", async () => {
    const { pool } = fakePool(() => { throw { code: "ECONNREFUSED", message: "connect ECONNREFUSED" }; });
    const persistence = createNeonPersistence(pool);
    await expect(persistence.card.getById({ cardId: "1" })).rejects.toThrow(/failed/);
  });

  it("keeps payment attempts out of the adapter surface", () => {
    const source = readFileSync(
      new URL("../adapter/neon-persistence.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/payment_attempts/);
    expect(source).not.toMatch(/supabaseUrl|SUPABASE_|serviceRole/);
    expect(source).toMatch(/new Pool\(/);
  });
});
