import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createNeonPersistence } from "../adapter/neon-persistence.ts";

const CONTAINER = "pact-neon-adapter-test";
const PORT = "55433";
const SUPER_URL = `postgres://postgres:test-only@${"127.0.0.1"}:${PORT}/postgres`;

function dockerReady(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

const HAS_DOCKER = dockerReady();

const WALLET = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const NONCE = "a".repeat(64);
const TOKEN = "b".repeat(64);
const FUTURE_ISO = "2027-09-19T00:00:00.000Z";

describe.skipIf(!HAS_DOCKER)("Neon adapter on real PostgreSQL 17 (docker)", () => {
  let pool: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>; end?: () => Promise<void> };

  beforeAll(async () => {
    execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" });
    execSync(
      `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=test-only -p ${PORT}:5432 public.ecr.aws/supabase/postgres:17.6.1.166`,
      { stdio: "ignore", timeout: 120000 },
    );
    const { Pool } = await import("pg");
    const admin = new Pool({ connectionString: SUPER_URL, connectionTimeoutMillis: 5000 });
    const deadline = Date.now() + 90000;
    for (;;) {
      try {
        await admin.query("select 1");
        break;
      } catch {
        if (Date.now() > deadline) throw new Error("postgres did not start");
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const baseline = readFileSync(
      new URL("../../supabase/migrations/../../neon/migrations/0001_neon_baseline.sql", import.meta.url),
      "utf8",
    );
    await admin.query(baseline);
    await admin.end();
    const { createNeonPool } = await import("../adapter/neon-persistence.ts");
    pool = createNeonPool(SUPER_URL);
  }, 180000);

  afterAll(async () => {
    try {
      await pool?.end?.();
    } catch { /* ignore */ }
    try {
      execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore", timeout: 60000 });
    } catch { /* ignore */ }
  });

  it("round-trips challenges with atomic single-winner consume", async () => {
    const persistence = createNeonPersistence(pool);
    const now = Date.now();
    await persistence.session.insertChallenge({
      nonceHash: NONCE,
      wallet: WALLET,
      message: "test-message",
      expiresAtMs: now + 300000,
      consumedAtMs: null,
    });
    const [first, second] = await Promise.all([
      persistence.session.consumeChallenge(NONCE),
      persistence.session.consumeChallenge(NONCE),
    ]);
    const winners = [first, second].filter((r) => r !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.wallet).toBe(WALLET.toLowerCase());
    expect(await persistence.session.consumeChallenge(NONCE)).toBeNull();
  });

  it("enforces session expiry and monotonic revoke", async () => {
    const persistence = createNeonPersistence(pool);
    const now = Date.now();
    await persistence.session.insertSession({
      id: "sess-live",
      tokenHash: TOKEN,
      wallet: WALLET,
      role: "user",
      issuedAtMs: now - 1000,
      expiresAtMs: now + 600000,
      revokedAtMs: null,
    });
    expect(await persistence.session.findSession(TOKEN, WALLET)).not.toBeNull();
    expect(await persistence.session.revokeSession(TOKEN, WALLET, now)).toBe(true);
    expect(await persistence.session.revokeSession(TOKEN, WALLET, now + 1)).toBe(false);
    expect(await persistence.session.findSession(TOKEN, WALLET)).toBeNull();
  });

  it("persists Arc cards with lane checks and lifecycle transitions", async () => {
    const persistence = createNeonPersistence(pool, "arc");
    const row = {
      card_id: "1",
      controller_address: "0x7a474c005433def5fc496d2016f6ae794edfc423",
      owner_address: OWNER.toLowerCase(),
      agent_id: WALLET.toLowerCase(),
      asset: "arc-testnet-usdc",
      chain_id: 5042002,
      status: "ISSUED",
      owner_configured_cap: "100000000000000000",
      per_transaction_limit: "10000000000000000",
      verified_credit: "0",
      verified_credit_expires_at: null,
      spent: "0",
      expires_at: FUTURE_ISO,
      policy_version: 1,
      allowlist_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source_block: 62948913,
      source_tx_hash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
      created_at: "2026-09-19T00:00:00.000Z",
      updated_at: "2026-09-19T00:00:00.000Z",
    };
    const created = await persistence.card.createOrRecord(row as never);
    expect(created.card_id).toBe("1");
    await expect(persistence.card.createOrRecord(row as never)).rejects.toThrow();
    const active = await persistence.card.transitionStatus({
      cardId: "1", from: "ISSUED", to: "ACTIVE", sourceTxHash: row.source_tx_hash, sourceBlock: 62948914,
    });
    expect(active.status).toBe("ACTIVE");
    await expect(persistence.card.transitionStatus({
      cardId: "1", from: "ACTIVE", to: "ISSUED", sourceTxHash: row.source_tx_hash, sourceBlock: 62948915,
    })).rejects.toThrow();
    await expect(persistence.card.transitionStatus({
      cardId: "1", from: "ACTIVE", to: "SUSPENDED", sourceTxHash: row.source_tx_hash, sourceBlock: 62948913,
    })).rejects.toThrow();
  });

  it("rejects CTC rows in the Arc lane and orphan intents", async () => {
    const persistence = createNeonPersistence(pool, "arc");
    await expect(persistence.card.createOrRecord({
      card_id: "9", controller_address: "0x3333333333333333333333333333333333333333",
      owner_address: OWNER.toLowerCase(), agent_id: WALLET.toLowerCase(),
      asset: "native-testnet-ctc", chain_id: 102031, status: "ISSUED",
      owner_configured_cap: "1", per_transaction_limit: "1", verified_credit: "0",
      verified_credit_expires_at: null, spent: "0", expires_at: FUTURE_ISO,
      policy_version: 1, allowlist_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source_block: 1, source_tx_hash: `0x${"c".repeat(64)}`,
      created_at: "2026-09-19T00:00:00.000Z", updated_at: "2026-09-19T00:00:00.000Z",
    } as never)).rejects.toThrow();
    await expect(persistence.intent.insertIntent({
      intent: {
        intentId: "orphan-1", agentId: WALLET, cardId: "404",
        merchantId: "arc-demo-merchant", amountBaseUnits: "1000", asset: "arc-testnet-usdc",
        purpose: "probe", confidence: 0.9, provider: "openai", model: "gpt-5.6-luna",
        createdAt: "2026-09-19T00:00:00.000Z", expiresAt: FUTURE_ISO,
        policyVersion: 1, intentHash: `0x${"d".repeat(64)}`,
      },
      idempotencyKey: "idem-orphan", ownerAddress: OWNER, requestId: "req-orphan",
    })).rejects.toThrow(/ownership/i);
  });

  it("keeps intent idempotency across duplicate inserts", async () => {
    const persistence = createNeonPersistence(pool, "arc");
    // Fresh agent: the partial unique index allows exactly one ACTIVE card
    // per agent, so a second ACTIVE card must use a different agent.
    const agent2 = "0x3333333333333333333333333333333333333333";
    await persistence.card.createOrRecord({
      card_id: "2",
      controller_address: "0x7a474c005433def5fc496d2016f6ae794edfc423",
      owner_address: OWNER.toLowerCase(),
      agent_id: agent2,
      asset: "arc-testnet-usdc",
      chain_id: 5042002,
      status: "ACTIVE",
      owner_configured_cap: "100000000000000000",
      per_transaction_limit: "10000000000000000",
      verified_credit: "0",
      verified_credit_expires_at: null,
      spent: "0",
      expires_at: FUTURE_ISO,
      policy_version: 1,
      allowlist_hash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      source_block: 62948913,
      source_tx_hash: "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
      created_at: "2026-09-19T00:00:00.000Z",
      updated_at: "2026-09-19T00:00:00.000Z",
    } as never);
    const intent = {
      intentId: "intent-arc-2",
      agentId: agent2,
      cardId: "2",
      merchantId: "arc-demo-merchant",
      amountBaseUnits: "10000000000000000",
      asset: "arc-testnet-usdc",
      purpose: "arc lane readiness probe",
      confidence: 0.9,
      provider: "openai",
      model: "gpt-5.6-luna",
      createdAt: "2026-09-19T00:00:00.000Z",
      expiresAt: FUTURE_ISO,
      policyVersion: 1,
      intentHash: `0x${"e".repeat(64)}`,
    };
    const first = await persistence.intent.insertIntent({
      intent, idempotencyKey: "idem-arc-2", ownerAddress: OWNER, requestId: "req-arc-2",
    });
    expect(first.intentId).toBe("intent-arc-2");
    const replay = await persistence.intent.insertIntent({
      intent, idempotencyKey: "idem-arc-2", ownerAddress: OWNER, requestId: "req-arc-2",
    });
    expect(replay.intentId).toBe("intent-arc-2");
    const found = await persistence.intent.getById({ intentId: "intent-arc-2", ownerAddress: OWNER, agentId: agent2 });
    expect(found?.intentHash).toBe(`0x${"e".repeat(64)}`);
    await persistence.intent.markStatus({ intentId: "intent-arc-2", ownerAddress: OWNER, status: "consumed", now: new Date().toISOString() });
    const after = await persistence.intent.getById({ intentId: "intent-arc-2", ownerAddress: OWNER, agentId: agent2 });
    expect(after?.intentId).toBe("intent-arc-2");
  });
});
