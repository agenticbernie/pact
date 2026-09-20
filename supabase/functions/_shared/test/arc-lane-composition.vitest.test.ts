import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createPostgrestCardStore } from "../card-store.ts";
import { createPostgrestIntentStore } from "../intent-store.ts";
import { createExecutorCompositionRoot } from "../../agent-executor/index.ts";
import { createGatewayCompositionRoot } from "../../ai-gateway/index.ts";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { hashToken } from "../session-token.ts";
import { merchantIdToBytes32 } from "../../../../packages/domain/src/canonical-hash.ts";

// Arc H1/H2 lane fixtures. Chain/controller/creation-event/amount facts are
// the real on-chain card-1 provenance; owner/agent collapse to ONE disposable
// lane wallet because the current owner-scoped H2 lookup requires
// owner == agent == session wallet (see the owner-mismatch test below and the
// migration decision §5). The real card 1 has owner != agent.
const ARC_CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const ARC_OWNER_REAL = "0xb8bdcc633cd8e67250358d807918f99dc0c14d52";
const ARC_AGENT_REAL = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
const LANE_WALLET = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET = "local-session-test";
const FUTURE = "2027-09-19T00:00:00.000Z";

function arcCardRow(overrides: Record<string, unknown> = {}) {
  return {
    card_id: "1",
    controller_address: ARC_CONTROLLER,
    owner_address: LANE_WALLET,
    agent_id: LANE_WALLET,
    asset: "arc-testnet-usdc",
    chain_id: 5042002,
    status: "ACTIVE",
    owner_configured_cap: "100000000000000000",
    per_transaction_limit: "10000000000000000",
    verified_credit: "100000000000000000",
    verified_credit_expires_at: FUTURE,
    spent: "0",
    expires_at: FUTURE,
    policy_version: 1,
    allowlist_hash: merchantIdToBytes32("arc-demo-merchant"),
    source_block: 62948913,
    source_tx_hash:
      "0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb",
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

function arcIntentRow(overrides: Record<string, unknown> = {}) {
  return {
    intent_id: "intent-arc-1",
    card_id: "1",
    agent_id: LANE_WALLET,
    merchant_id: "arc-demo-merchant",
    amount_base_units: "10000000000000000",
    asset: "arc-testnet-usdc",
    purpose: "arc lane readiness probe",
    confidence: 0.9,
    provider: "openai",
    model: "gpt-5.6-luna",
    policy_version: 1,
    intent_hash:
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    status: "ready",
    request_id: "req-arc-1",
    idempotency_key: "idem-arc-1",
    created_at: "2026-09-19T00:00:00.000Z",
    expires_at: FUTURE,
    cards: { owner_address: LANE_WALLET },
    ...overrides,
  };
}

const CONFIG = {
  supabaseUrl: "https://ref.supabase.co",
  serviceRoleKey: "test-only-service-role",
};

function sessionPersistenceFor(token: string, wallet: string) {
  return {
    insertChallenge: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => null),
    insertSession: vi.fn(async () => undefined),
    findSession: vi.fn(async (tokenHash: string, w: string) =>
      tokenHash === hashToken(token) && w === wallet
        ? {
          id: "arc-session-1",
          tokenHash,
          wallet: w,
          role: "user" as const,
          issuedAtMs: Date.now() - 1_000,
          expiresAtMs: Date.now() + 600_000,
          revokedAtMs: null,
        }
        : null),
    revokeSession: vi.fn(async () => false),
  };
}

const REGIONS = {
  PACT_EXPECTED_REGION: "ap-southeast-1",
  SB_REGION: "ap-southeast-1",
};

describe("Arc H1/H2 lane composition (RED-first)", () => {
  it("accepts an Arc card row under the Arc lane and rejects CTC there", async () => {
    const store = createPostgrestCardStore(CONFIG, async (req) => {
      if (req.method === "POST") return { status: 201, body: [arcCardRow()] };
      return { status: 200, body: [] };
    }, "arc" as never);
    const created = await store.createOrRecord(arcCardRow() as never);
    expect(created.card_id).toBe("1");
    const ctcRow = { ...arcCardRow(), asset: "native-testnet-ctc", chain_id: 102031 };
    await expect(store.createOrRecord(ctcRow as never)).rejects.toThrow();
  });

  it("rejects lane-pair mismatches even without a strict lane", async () => {
    const store = createPostgrestCardStore(CONFIG, async () => ({ status: 200, body: [] }));
    await expect(
      store.createOrRecord({ ...arcCardRow(), asset: "native-testnet-ctc" } as never),
    ).rejects.toThrow();
    await expect(
      store.createOrRecord({ ...arcCardRow(), chain_id: 102031 } as never),
    ).rejects.toThrow();
  });

  it("accepts an Arc intent under the Arc lane and rejects CTC there", async () => {
    const store = createPostgrestIntentStore(CONFIG, async (req) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [{ ...arcCardRow(), cards: undefined }] };
      }
      if (req.method === "POST") return { status: 201, body: [arcIntentRow()] };
      return { status: 200, body: [] };
    }, "arc" as never);
    const saved = await store.insertIntent({
      intent: {
        intentId: "intent-arc-1",
        agentId: LANE_WALLET,
        cardId: "1",
        merchantId: "arc-demo-merchant",
        amountBaseUnits: "10000000000000000",
        asset: "arc-testnet-usdc",
        purpose: "arc lane readiness probe",
        confidence: 0.9,
        provider: "openai",
        model: "gpt-5.6-luna",
        createdAt: "2026-09-19T00:00:00.000Z",
        expiresAt: FUTURE,
        policyVersion: 1,
        intentHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      },
      idempotencyKey: "idem-arc-1",
      ownerAddress: LANE_WALLET,
      requestId: "req-arc-1",
    });
    expect(saved.intentId).toBe("intent-arc-1");
  });

  it("settles the Arc read-only preflight with lane binding (chain/asset/controller)", async () => {
    const token = issueSessionToken(
      { sessionId: "arc-session-1", wallet: LANE_WALLET, role: "user" },
      SECRET,
    );
    const cardTransport = async (req: { method: string; path: string }) => {
      if (req.method === "GET") return { status: 200, body: [arcCardRow()] };
      return { status: 200, body: [] };
    };
    const intentTransport = async (req: { method: string; path: string }) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [{ ...arcCardRow() }] };
      }
      if (req.method === "GET") return { status: 200, body: [arcIntentRow()] };
      return { status: 200, body: [] };
    };
    const rpcCalls: string[] = [];
    const handler = createExecutorCompositionRoot({
      env: {
        ...REGIONS,
        SESSION_HMAC_SECRET: SECRET,
        ARC_RPC_URL: "http://local-rpc.invalid",
      },
      lane: "arc" as never,
      transport: async (method, params) => {
        rpcCalls.push(method);
        if (method === "eth_chainId") return "0x4cef52";
        const input = params[0] as Record<string, unknown>;
        expect(input["from"]).toBe(LANE_WALLET);
        return { cardId: "1", agent: LANE_WALLET, policyVersion: 1, chainId: 5042002, ok: true };
      },
      persistence: {
        session: sessionPersistenceFor(token, LANE_WALLET),
        intent: createPostgrestIntentStore(CONFIG, intentTransport, "arc" as never),
        card: createPostgrestCardStore(CONFIG, cardTransport, "arc" as never),
      } as never,
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-request-id": "req-arc-preflight" },
      body: JSON.stringify({ intentId: "intent-arc-1" }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ decision: "would_settle", chainId: 5042002 });
    expect(rpcCalls).toEqual(["eth_chainId", "eth_call", "eth_chainId", "eth_call"]);
    expect(JSON.stringify(rpcCalls)).not.toMatch(/eth_sendTransaction|sendRawTransaction/i);
  });

  it("declines an Arc card bound to the wrong controller", async () => {
    const token = issueSessionToken(
      { sessionId: "arc-session-1", wallet: LANE_WALLET, role: "user" },
      SECRET,
    );
    const wrongController = "0x5e1771de29bd1a084900d032fd4db2ac7cf7528b";
    const cardTransport = async () => ({
      status: 200,
      body: [arcCardRow({ controller_address: wrongController })],
    });
    const intentTransport = async (req: { method: string; path: string }) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [arcCardRow({ controller_address: wrongController })] };
      }
      if (req.method === "GET") return { status: 200, body: [arcIntentRow()] };
      return { status: 200, body: [] };
    };
    const handler = createExecutorCompositionRoot({
      env: {
        ...REGIONS,
        SESSION_HMAC_SECRET: SECRET,
        ARC_RPC_URL: "http://local-rpc.invalid",
      },
      lane: "arc" as never,
      transport: async (method) =>
        method === "eth_chainId"
          ? "0x4cef52"
          : { cardId: "1", agent: LANE_WALLET, policyVersion: 1, chainId: 5042002, ok: true },
      persistence: {
        session: sessionPersistenceFor(token, LANE_WALLET),
        intent: createPostgrestIntentStore(CONFIG, intentTransport, "arc" as never),
        card: createPostgrestCardStore(CONFIG, cardTransport, "arc" as never),
      } as never,
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-request-id": "req-arc-wrong-ctrl" },
      body: JSON.stringify({ intentId: "intent-arc-1" }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ decision: "declined", reasonCode: "CARD_NOT_ELIGIBLE", chainId: 5042002 });
  });

  it("documents the owner-mismatch semantic on the real card-1 shape (owner != agent)", async () => {
    const token = issueSessionToken(
      { sessionId: "arc-session-1", wallet: ARC_AGENT_REAL, role: "user" },
      SECRET,
    );
    const realCardRow = arcCardRow({ owner_address: ARC_OWNER_REAL, agent_id: ARC_AGENT_REAL });
    const intentTransport = async (req: { method: string; path: string }) => {
      if (req.method === "GET" && req.path.startsWith("/rest/v1/cards")) {
        return { status: 200, body: [realCardRow] };
      }
      // Emulates PostgREST server-side filtering: the scoped intent read
      // asks cards.owner_address == session wallet (the agent), which the
      // real card 1 (owner-held) does not satisfy.
      return { status: 200, body: [] };
    };
    const handler = createExecutorCompositionRoot({
      env: {
        ...REGIONS,
        SESSION_HMAC_SECRET: SECRET,
        ARC_RPC_URL: "http://local-rpc.invalid",
      },
      lane: "arc" as never,
      transport: async (method) =>
        method === "eth_chainId"
          ? "0x4cef52"
          : { cardId: "1", agent: ARC_AGENT_REAL, policyVersion: 1, chainId: 5042002, ok: true },
      persistence: {
        session: sessionPersistenceFor(token, ARC_AGENT_REAL),
        intent: createPostgrestIntentStore(CONFIG, intentTransport, "arc" as never),
        card: createPostgrestCardStore(CONFIG, async () => ({ status: 200, body: [realCardRow] }), "arc" as never),
      } as never,
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-request-id": "req-arc-owner-mismatch" },
      body: JSON.stringify({ intentId: "intent-arc-1" }),
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ decision: "declined", chainId: 5042002 });
  });

  it("emits the server-bound Arc asset from the gateway (lane card, not a CTC literal)", async () => {
    const token = issueSessionToken(
      { sessionId: "arc-session-1", wallet: LANE_WALLET, role: "user" },
      SECRET,
    );
    const provider = {
      parseIntent: vi.fn(async () => ({
        provider: "openai" as const,
        model: "gpt-5.6-luna",
        merchantId: "arc-demo-merchant",
        amountDecimal: "0.01",
        purpose: "arc lane readiness probe",
        confidence: 1,
      })),
    };
    const savedIntents: unknown[] = [];
    const store = {
      save: vi.fn(async (intent: unknown) => {
        savedIntents.push(intent);
      }),
    };
    const handler = createGatewayCompositionRoot({
      env: { ...REGIONS, SESSION_HMAC_SECRET: SECRET, OPENAI_API_KEY: "local-provider-test" },
      lane: "arc" as never,
      provider,
      card: {
        cardId: "1",
        agent: LANE_WALLET,
        asset: "arc-testnet-usdc",
        recipient: "",
        policyVersion: 1,
      },
      merchants: [{ id: "arc-demo-merchant", label: "Arc Demo" }],
      store,
      sessionPersistence: sessionPersistenceFor(token, LANE_WALLET),
    });
    const response = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "x-request-id": "req-arc-intent" },
      body: JSON.stringify({ prompt: "arc lane probe", cardId: "1" }),
    }));
    expect(response.status).toBe(200);
    expect(provider.parseIntent).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
    const saved = savedIntents[0] as Record<string, unknown>;
    expect(saved["asset"]).toBe("arc-testnet-usdc");
    expect(saved["cardId"]).toBe("1");
    expect(saved["amountBaseUnits"]).toBe("10000000000000000");
    expect(saved["intentHash"]).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("reports the Arc chain on the lane health shape", async () => {
    const handler = createGatewayCompositionRoot({
      env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1" },
      lane: "arc" as never,
    });
    const response = await handler(new Request("https://regional.invalid/health", {
      headers: { "x-request-id": "req-arc-health" },
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ chainId: 5042002 });
  });

  it("wires the Arc RPC name and lane module in executor/gateway sources", () => {
    const executorSource = readFileSync(new URL("../../agent-executor/index.ts", import.meta.url), "utf8");
    const gatewaySource = readFileSync(new URL("../../ai-gateway/index.ts", import.meta.url), "utf8");
    const laneSource = readFileSync(new URL("../lane-config.ts", import.meta.url), "utf8");
    expect(executorSource).toMatch(/ARC_RPC_URL/);
    expect(executorSource).toMatch(/lane-config/);
    expect(gatewaySource).toMatch(/lane-config/);
    expect(laneSource).toMatch(/arc-lane/);
    const both = `${executorSource}\n${gatewaySource}`;
    expect(both).toMatch(/lane:\s*"arc"|lane: LaneSelection/);
    expect(both).not.toMatch(/new Wallet|AGENT_SIGNER_PRIVATE_KEY\s*[:=]\s*Deno/);
    expect(both).not.toMatch(/eth_sendTransaction|sendRawTransaction|estimateGas/);
  });
});
