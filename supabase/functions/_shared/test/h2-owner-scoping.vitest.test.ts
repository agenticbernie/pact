import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createExecutorCompositionRoot } from "../../agent-executor/index.ts";
import { createPostgrestIntentStore } from "../intent-store.ts";
import { createPostgrestCardStore } from "../card-store.ts";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { hashToken } from "../session-token.ts";
import { merchantIdToBytes32 } from "../../../../packages/domain/src/canonical-hash.ts";
import type { OwnerAuthorization } from "../owner-authorization.ts";

const loadAuthz = () => import("../owner-authorization.ts");

// Real Arc card-1 shape: owner (deployer) != agent (burner).
const ARC_OWNER = "0xb8bdcc633cd8e67250358d807918f99dc0c14d52";
const ARC_AGENT = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
const ARC_CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const ARC_CHAIN = 5042002;
const ARC_TX = "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb";
const ARC_BLOCK = 62948913;
const ARC_ALLOWLIST = merchantIdToBytes32("arc-demo-merchant");
const SECRET = "local-session-test";
const FUTURE = "2027-09-19T00:00:00.000Z";
const PAST = "2020-01-01T00:00:00.000Z";
const CONFIG = { supabaseUrl: "https://ref.supabase.co", serviceRoleKey: "test-only-service-role" };
const REGIONS = { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1" };

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    card_id: "1",
    controller_address: ARC_CONTROLLER,
    owner_address: ARC_OWNER,
    agent_id: ARC_AGENT,
    asset: "arc-testnet-usdc",
    chain_id: ARC_CHAIN,
    status: "ACTIVE",
    owner_configured_cap: "100000000000000000",
    per_transaction_limit: "10000000000000000",
    verified_credit: "100000000000000000",
    verified_credit_expires_at: FUTURE,
    spent: "0",
    expires_at: FUTURE,
    policy_version: 1,
    allowlist_hash: ARC_ALLOWLIST,
    source_block: ARC_BLOCK,
    source_tx_hash: ARC_TX,
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    intent_id: "intent-arc-1",
    card_id: "1",
    agent_id: ARC_AGENT,
    merchant_id: "arc-demo-merchant",
    amount_base_units: "10000000000000000",
    asset: "arc-testnet-usdc",
    purpose: "arc lane readiness probe",
    confidence: 0.9,
    provider: "openai",
    model: "gpt-5.6-luna",
    policy_version: 1,
    intent_hash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    status: "ready",
    request_id: "req-arc-1",
    idempotency_key: "idem-arc-1",
    created_at: "2026-09-19T00:00:00.000Z",
    expires_at: FUTURE,
    cards: { owner_address: ARC_OWNER },
    ...overrides,
  };
}

function validAuth(overrides: Record<string, unknown> = {}): OwnerAuthorization {
  return {
    intentId: "intent-arc-1",
    ownerAddress: ARC_OWNER,
    agentId: ARC_AGENT,
    cardId: "1",
    chainId: ARC_CHAIN,
    asset: "arc-testnet-usdc",
    controller: ARC_CONTROLLER,
    issuedBy: ARC_OWNER,
    policyVersion: 1,
    allowlistHash: ARC_ALLOWLIST,
    sourceBlock: ARC_BLOCK,
    sourceTxHash: ARC_TX,
    expiresAtMs: Date.parse(FUTURE),
    ...overrides,
  } as OwnerAuthorization;
}

function sessionFor(wallet: string) {
  const token = issueSessionToken({ sessionId: "s1", wallet, role: "user" }, SECRET);
  return {
    token,
    persistence: {
      insertChallenge: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => null),
      insertSession: vi.fn(async () => undefined),
      findSession: vi.fn(async (h: string, w: string) =>
        h === hashToken(token) && w === wallet
          ? { id: "s1", tokenHash: h, wallet: w, role: "user" as const, issuedAtMs: 1, expiresAtMs: Date.now() + 600000, revokedAtMs: null }
          : null),
      revokeSession: vi.fn(async () => false),
    },
  };
}

// Emulates PostgREST server-side filtering for the scoped reads.
function matchesPath(row: Record<string, unknown>, path: string): boolean {
  const params = new URL(`https://dummy${path}`).searchParams;
  const eq = (key: string): string | null => {
    const raw = params.get(key);
    if (raw === null || !raw.startsWith("eq.")) return null;
    return raw.slice(3).toLowerCase();
  };
  const checks: Array<[string, string]> = [];
  const intentId = eq("intent_id");
  if (intentId !== null) checks.push([String(row["intent_id"] ?? "").toLowerCase(), intentId]);
  const cardId = eq("card_id");
  if (cardId !== null) checks.push([String(row["card_id"] ?? "").toLowerCase(), cardId]);
  const agentId = eq("agent_id");
  if (agentId !== null) checks.push([String(row["agent_id"] ?? "").toLowerCase(), agentId]);
  const owner = eq("owner_address");
  if (owner !== null) checks.push([String(row["owner_address"] ?? "").toLowerCase(), owner]);
  const cardOwner = eq("cards.owner_address");
  if (cardOwner !== null) {
    const rel = row["cards"] as { owner_address?: unknown } | undefined;
    checks.push([String(rel?.owner_address ?? "").toLowerCase(), cardOwner]);
  }
  return checks.every(([a, b]) => a === b);
}

function storesFor(cardRows: Record<string, unknown>[], intentRows: Record<string, unknown>[], lane: unknown = undefined) {
  const cardTransport = async (req: { method: string; path: string }) => {
    if (req.method === "GET") return { status: 200, body: cardRows.filter((r) => matchesPath(r, req.path)) };
    return { status: 200, body: [] };
  };
  const intentTransport = async (req: { method: string; path: string }) => {
    if (req.method === "GET") return { status: 200, body: intentRows.filter((r) => matchesPath(r, req.path)) };
    return { status: 200, body: [] };
  };
  return {
    card: createPostgrestCardStore(CONFIG, cardTransport, lane as never),
    intent: createPostgrestIntentStore(CONFIG, intentTransport, lane as never),
  };
}

function rpcFake() {
  const calls: string[] = [];
  return {
    calls,
    transport: async (method: string, params: unknown[]) => {
      calls.push(method);
      if (method === "eth_chainId") return "0x4cef52";
      const from = (params[0] as Record<string, unknown>)["from"];
      expect(from).toBe(ARC_AGENT);
      return { cardId: "1", agent: ARC_AGENT, policyVersion: 1, chainId: ARC_CHAIN, ok: true };
    },
  };
}

async function preflight(handler: (r: Request) => Promise<Response>, token: string, intentId: string) {
  const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-request-id": "req-h2" },
    body: JSON.stringify({ intentId }),
  }));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("H2 Arc owner-agent scoping (RED-first)", () => {
  it("settles split-role with a valid authorization and lane binding", async () => {
    const { token, persistence } = sessionFor(ARC_AGENT);
    const stores = storesFor([cardRow()], [intentRow()], "arc");
    const rpc = rpcFake();
    const handler = createExecutorCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, ARC_RPC_URL: "http://local-rpc.invalid" },
      lane: "arc" as never,
      transport: rpc.transport,
      persistence: { session: persistence, ...stores } as never,
      ownerAuthorizations: { findAuthorization: async () => validAuth() },
    });
    const { status, body } = await preflight(handler, token, "intent-arc-1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ decision: "would_settle", chainId: ARC_CHAIN });
    expect(rpc.calls).toEqual(["eth_chainId", "eth_call", "eth_chainId", "eth_call"]);
  });

  it("fails closed when no authorization exists for split roles", async () => {
    const { token, persistence } = sessionFor(ARC_AGENT);
    const stores = storesFor([cardRow()], [intentRow()], "arc");
    const rpc = rpcFake();
    const handler = createExecutorCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, ARC_RPC_URL: "http://local-rpc.invalid" },
      lane: "arc" as never,
      transport: rpc.transport,
      persistence: { session: persistence, ...stores } as never,
    });
    const { status, body } = await preflight(handler, token, "intent-arc-1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ decision: "declined", chainId: ARC_CHAIN });
    expect(rpc.calls).toEqual([]);
  });

  it("fails closed on wrong owner, session-agent mismatch, card-agent mismatch, controller and chain/asset mismatch", async () => {
    const cases: Array<{ name: string; mutate: () => { cards: Record<string, unknown>[]; auth: OwnerAuthorization | null; wallet: string } }> = [
      {
        name: "wrong owner in authorization",
        mutate: () => ({ cards: [cardRow()], auth: validAuth({ ownerAddress: "0x1111111111111111111111111111111111111111" }), wallet: ARC_AGENT }),
      },
      {
        name: "session wallet differs from agent",
        mutate: () => ({ cards: [cardRow()], auth: validAuth(), wallet: "0x9999999999999999999999999999999999999999" }),
      },
      {
        name: "agent differs from card agent",
        mutate: () => ({
          cards: [cardRow({ agent_id: "0x3333333333333333333333333333333333333333" })],
          auth: validAuth(),
          wallet: ARC_AGENT,
        }),
      },
      {
        name: "controller mismatch",
        mutate: () => ({
          cards: [cardRow({ controller_address: "0x5e1771de29bd1a084900d032fd4db2ac7cf7528b" })],
          auth: validAuth(),
          wallet: ARC_AGENT,
        }),
      },
    ];
    for (const current of cases) {
      const { cards, auth, wallet } = current.mutate();
      const { token, persistence } = sessionFor(wallet);
      const stores = storesFor(cards, [intentRow()]);
      const rpc = rpcFake();
      const handler = createExecutorCompositionRoot({
        env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, ARC_RPC_URL: "http://local-rpc.invalid" },
        lane: "arc" as never,
        transport: rpc.transport,
        persistence: { session: persistence, ...stores } as never,
        ownerAuthorizations: { findAuthorization: async () => auth },
      });
      const { status, body } = await preflight(handler, token, "intent-arc-1");
      expect(status, current.name).toBe(200);
      expect(body["decision"]).toBe("declined");
    }
  });

  it("fails closed on expired, self-issued, foreign-issued, and stale-provenance authorizations", async () => {
    const variants: Array<{ name: string; auth: OwnerAuthorization }> = [
      { name: "expired", auth: validAuth({ expiresAtMs: Date.parse(PAST) }) },
      { name: "self-issued by agent", auth: validAuth({ issuedBy: ARC_AGENT }) },
      { name: "issued by foreign wallet", auth: validAuth({ issuedBy: "0x3333333333333333333333333333333333333333" }) },
      { name: "stale source block", auth: validAuth({ sourceBlock: 1 }) },
      { name: "stale source tx", auth: validAuth({ sourceTxHash: `0x${"0".repeat(64)}` }) },
      { name: "policy mismatch", auth: validAuth({ policyVersion: 2 }) },
      { name: "allowlist mismatch", auth: validAuth({ allowlistHash: `0x${"1".repeat(64)}` }) },
    ];
    for (const current of variants) {
      const { token, persistence } = sessionFor(ARC_AGENT);
      const stores = storesFor([cardRow()], [intentRow()]);
      const rpc = rpcFake();
      const handler = createExecutorCompositionRoot({
        env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, ARC_RPC_URL: "http://local-rpc.invalid" },
        lane: "arc" as never,
        transport: rpc.transport,
        persistence: { session: persistence, ...stores } as never,
        ownerAuthorizations: { findAuthorization: async () => current.auth },
      });
      const { status, body } = await preflight(handler, token, "intent-arc-1");
      expect(status, current.name).toBe(200);
      expect(body["decision"]).toBe("declined");
    }
  });

  it("fails closed when a CTC lane reads Arc rows", async () => {
    const { token, persistence } = sessionFor(ARC_AGENT);
    const stores = storesFor([cardRow()], [intentRow()]);
    const handler = createExecutorCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
      transport: async (method: string) => (method === "eth_chainId" ? "0x18e8f" : { ok: true }),
      persistence: { session: persistence, ...stores } as never,
    });
    const { status, body } = await preflight(handler, token, "intent-arc-1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ decision: "declined", chainId: 102031 });
  });

  it("keeps the legacy CTC single-wallet path byte-identical", async () => {
    const wallet = "0x1111111111111111111111111111111111111111";
    const { token, persistence } = sessionFor(wallet);
    const legacyCard = {
      ...cardRow(),
      card_id: "7",
      owner_address: wallet,
      agent_id: wallet,
      asset: "native-testnet-ctc",
      chain_id: 102031,
      controller_address: "0x2222222222222222222222222222222222222222",
      source_block: 9,
      source_tx_hash: `0x${"a".repeat(64)}`,
    };
    const legacyIntent = {
      ...intentRow(),
      intent_id: "intent-req-1",
      card_id: "7",
      agent_id: wallet,
      asset: "native-testnet-ctc",
      cards: { owner_address: wallet },
    };
    const stores = storesFor([legacyCard], [legacyIntent]);
    const calls: string[] = [];
    const handler = createExecutorCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
      transport: async (method: string) => {
        calls.push(method);
        return method === "eth_chainId" ? "0x18e8f" : { cardId: "7", agent: wallet, policyVersion: 1, chainId: 102031, ok: true };
      },
      persistence: { session: persistence, ...stores } as never,
    });
    const { status, body } = await preflight(handler, token, "intent-req-1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ decision: "would_settle", chainId: 102031 });
    expect(calls).toEqual(["eth_chainId", "eth_call", "eth_chainId", "eth_call"]);
  });

  it("keeps card-7 legacy fixtures in place", () => {
    const cardStoreTest = readFileSync(new URL("./card-store.vitest.test.ts", import.meta.url), "utf8");
    const intentStoreTest = readFileSync(new URL("./intent-store.vitest.test.ts", import.meta.url), "utf8");
    expect(cardStoreTest).toMatch(/card_id:\s*"7"/);
    expect(intentStoreTest).toMatch(/intent-req-1/);
  });

  it("validates authorizations purely with closed codes", async () => {
    const authz = await loadAuthz();
    const ctx = {
      sessionWallet: ARC_AGENT,
      intent: { intentId: "intent-arc-1", agentId: ARC_AGENT, cardId: "1", policyVersion: 1 },
      card: {
        card_id: "1",
        controller_address: ARC_CONTROLLER,
        owner_address: ARC_OWNER,
        agent_id: ARC_AGENT,
        asset: "arc-testnet-usdc",
        chain_id: ARC_CHAIN,
        policy_version: 1,
        allowlist_hash: ARC_ALLOWLIST,
        source_block: ARC_BLOCK,
        source_tx_hash: ARC_TX,
      },
      lane: { chainId: ARC_CHAIN, asset: "arc-testnet-usdc", rpcEnvName: "ARC_RPC_URL", controller: ARC_CONTROLLER },
      nowMs: Date.parse("2026-09-19T12:00:00.000Z"),
    };
    const ok = authz.validateOwnerAuthorization(validAuth(), ctx);
    expect(ok).toEqual({ ok: true });
    expect(authz.validateOwnerAuthorization(null, ctx)).toEqual({ ok: false, code: "PREFLIGHT_DECLINED" });
    expect(authz.validateOwnerAuthorization(validAuth({ expiresAtMs: 1 }), ctx)).toEqual({ ok: false, code: "PREFLIGHT_DECLINED" });
    expect(authz.validateOwnerAuthorization(validAuth({ issuedBy: ARC_AGENT }), ctx)).toEqual({ ok: false, code: "CARD_NOT_ELIGIBLE" });
    expect(authz.validateOwnerAuthorization(validAuth({ ownerAddress: ARC_AGENT }), ctx)).toEqual({ ok: false, code: "CARD_NOT_ELIGIBLE" });
    expect(authz.validateOwnerAuthorization(validAuth({ chainId: 102031 }), ctx)).toEqual({ ok: false, code: "CARD_NOT_ELIGIBLE" });
    expect(authz.validateOwnerAuthorization(validAuth({ asset: "native-testnet-ctc" } as never), ctx)).toEqual({ ok: false, code: "CARD_NOT_ELIGIBLE" });
  });

  it("builds a complete PVL record without secret material", async () => {
    const authz = await loadAuthz();
    const record = authz.buildH2ValidationRecord({
      sessionWallet: ARC_AGENT,
      intent: {
        intentId: "intent-arc-1",
        agentId: ARC_AGENT,
        cardId: "1",
        merchantId: "arc-demo-merchant",
        amountBaseUnits: "10000000000000000",
        asset: "arc-testnet-usdc",
        policyVersion: 1,
        intentHash: `0x${"c".repeat(64)}`,
        expiresAt: FUTURE,
      },
      card: {
        card_id: "1",
        controller_address: ARC_CONTROLLER,
        owner_address: ARC_OWNER,
        agent_id: ARC_AGENT,
        asset: "arc-testnet-usdc",
        chain_id: ARC_CHAIN,
        policy_version: 1,
        allowlist_hash: ARC_ALLOWLIST,
        source_block: ARC_BLOCK,
        source_tx_hash: ARC_TX,
      },
      lane: { chainId: ARC_CHAIN, asset: "arc-testnet-usdc", rpcEnvName: "ARC_RPC_URL", controller: ARC_CONTROLLER },
      authorization: validAuth(),
      decision: "would_settle",
      evaluatedAt: "2026-09-19T12:00:00.000Z",
    });
    for (const key of [
      "principal", "owner", "agent", "sessionWallet", "cardId", "controller",
      "chainId", "asset", "ownerAuthorization", "policyVersion", "allowlistHash",
      "decision", "evaluatedAt", "intentExpiresAt", "sourceBlock", "sourceTxHash", "intentHash",
    ]) {
      expect(record[key as keyof typeof record], key).toBeDefined();
    }
    expect(record["ownerAuthorization"]).toMatchObject({ mode: "authorized", issuedBy: ARC_OWNER });
    expect(JSON.stringify(record).toLowerCase()).not.toMatch(/secret|privatekey|bearer|apikey|password/);
  });

  it("keeps the HTTP envelope free of validation internals", async () => {
    const { token, persistence } = sessionFor(ARC_AGENT);
    const stores = storesFor([cardRow()], [intentRow()], "arc");
    const rpc = rpcFake();
    const handler = createExecutorCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, ARC_RPC_URL: "http://local-rpc.invalid" },
      lane: "arc" as never,
      transport: rpc.transport,
      persistence: { session: persistence, ...stores } as never,
      ownerAuthorizations: { findAuthorization: async () => validAuth() },
    });
    const { status, body } = await preflight(handler, token, "intent-arc-1");
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["chainId", "checkedAt", "decision", "intentId", "requestId"]);
    expect("validation" in body).toBe(false);
  });
});
