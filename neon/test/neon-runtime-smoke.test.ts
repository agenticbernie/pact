import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { issueSessionToken } from "../../packages/domain/src/session-token.ts";
import { hashToken } from "../../supabase/functions/_shared/session-token.ts";
import { createNeonPersistence } from "../adapter/neon-persistence.ts";

const CONTAINER = "pact-neon-smoke";
const PORT = "55434";
const DB_URL = `postgres://postgres:test-only@${"127.0.0.1"}:${PORT}/postgres`;
const SECRET = "local-smoke-session-secret";
const WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const FUTURE_ISO = "2027-09-19T00:00:00.000Z";

function dockerReady(): boolean {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

const HAS_DOCKER = dockerReady();

function setLaneEnv() {
  process.env["PERSISTENCE_BACKEND"] = "neon";
  process.env["DATABASE_URL"] = DB_URL;
  process.env["PACT_EXPECTED_REGION"] = "us-east-1";
  process.env["SB_REGION"] = "ap-southeast-1";
  process.env["SESSION_HMAC_SECRET"] = SECRET;
  process.env["OPENAI_API_KEY"] = "local-smoke-no-call";
  process.env["OPENAI_MODEL"] = "gpt-5.6-luna";
  process.env["ARC_RPC_URL"] = "http://127.0.0.1:9/";
}

describe.skipIf(!HAS_DOCKER)("Neon functions local smoke (docker PG17)", () => {
  beforeAll(async () => {
    setLaneEnv();
    execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore" });
    execSync(
      `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=test-only -p ${PORT}:5432 public.ecr.aws/supabase/postgres:17.6.1.166`,
      { stdio: "ignore", timeout: 120000 },
    );
    const { Pool } = await import("pg");
    const admin = new Pool({ connectionString: DB_URL, connectionTimeoutMillis: 5000 });
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
    const baseline = readFileSync(new URL("../migrations/0001_neon_baseline.sql", import.meta.url), "utf8");
    await admin.query(baseline);
    await admin.end();
  }, 180000);

  afterAll(async () => {
    try {
      execSync(`docker rm -f ${CONTAINER}`, { stdio: "ignore", timeout: 60000 });
    } catch { /* ignore */ }
  });

  it("serves Neon health with the Arc lane shape (no OpenAI contact)", async () => {
    const entry = await import("../functions/aigateway/index.ts");
    const response = await entry.default.fetch(
      new Request("http://local/health", { headers: { "x-request-id": "req-smoke-health" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      requestId: "req-smoke-health",
      configuredRegion: "us-east-1",
      expectedRegion: "us-east-1",
      chainId: 5042002,
      provider: "openai",
      model: "gpt-5.6-luna",
      modelAvailable: false,
    });
  });

  it("fails closed without PERSISTENCE_BACKEND=neon (fresh entry instance)", async () => {
    const saved = process.env["PERSISTENCE_BACKEND"];
    process.env["PERSISTENCE_BACKEND"] = "supabase";
    try {
      const fresh = await import("../functions/session/index.ts?fail-closed");
      const response = await fresh.default.fetch(
        new Request("http://local/v1/session/challenge", {
          method: "POST",
          headers: { "x-request-id": "req-smoke-no-backend" },
          body: JSON.stringify({ wallet: WALLET }),
        }),
      );
      expect(response.status).toBe(503);
    } finally {
      process.env["PERSISTENCE_BACKEND"] = saved;
    }
  });

  it("runs session challenge shape against Neon persistence", async () => {
    const entry = await import("../functions/session/index.ts");
    const response = await entry.default.fetch(
      new Request("http://local/v1/session/challenge", {
        method: "POST",
        headers: { "x-request-id": "req-smoke-challenge" },
        body: JSON.stringify({ wallet: WALLET }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body["nonce"]).toBe("string");
    expect(typeof body["message"]).toBe("string");
  });

  it("rejects gateway intent for unknown cards before any provider work", async () => {
    const { createNeonPool } = await import("../adapter/neon-persistence.ts");
    const pool = createNeonPool(DB_URL);
    const persistence = createNeonPersistence(pool);
    const token = issueSessionToken({ sessionId: "smoke-1", wallet: WALLET, role: "user" }, SECRET);
    await persistence.session.insertSession({
      id: "smoke-1",
      tokenHash: hashToken(token),
      wallet: WALLET,
      role: "user",
      issuedAtMs: Date.now() - 1000,
      expiresAtMs: Date.now() + 600000,
      revokedAtMs: null,
    });
    const entry = await import("../functions/aigateway/index.ts");
    const response = await entry.default.fetch(
      new Request("http://local/v1/agent/intents", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "x-request-id": "req-smoke-intent" },
        body: JSON.stringify({ prompt: "smoke probe", cardId: "404" }),
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(400);
    expect(body["code"]).toBe("CARD_NOT_ELIGIBLE");
    await pool.end?.();
  });

  it("reads seeded Arc rows and fails preflight closed on unreachable RPC", async () => {
    const { createNeonPool } = await import("../adapter/neon-persistence.ts");
    const pool = createNeonPool(DB_URL);
    const persistence = createNeonPersistence(pool, "arc");
    await persistence.card.createOrRecord({
      card_id: "1",
      controller_address: "0x7a474c005433def5fc496d2016f6ae794edfc423",
      owner_address: WALLET,
      agent_id: WALLET,
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
    const read = await persistence.card.getById({ cardId: "1", ownerAddress: WALLET, agentId: WALLET });
    expect(read?.asset).toBe("arc-testnet-usdc");
    const token = issueSessionToken({ sessionId: "smoke-2", wallet: WALLET, role: "user" }, SECRET);
    await persistence.session.insertSession({
      id: "smoke-2",
      tokenHash: hashToken(token),
      wallet: WALLET,
      role: "user",
      issuedAtMs: Date.now() - 1000,
      expiresAtMs: Date.now() + 600000,
      revokedAtMs: null,
    });
    const entry = await import("../functions/agentexecutor/index.ts");
    const response = await entry.default.fetch(
      new Request("http://local/v1/payments/preflight", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "x-request-id": "req-smoke-preflight" },
        body: JSON.stringify({ intentId: "intent-missing" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ decision: "declined", chainId: 5042002 });
    await pool.end?.();
  });
});
