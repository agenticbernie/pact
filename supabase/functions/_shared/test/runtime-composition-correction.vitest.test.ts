import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { startSessionServer } from "../../session/index.ts";
import { startGatewayServer } from "../../ai-gateway/index.ts";
import { startExecutorServer } from "../../agent-executor/index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";

function request(path: string): Request {
  return new Request(`https://regional.invalid${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intentId: "intent-1", cardId: "7", nonce: "client-value" }),
  });
}

describe("G24 production composition roots", () => {
  it("accepts a valid project region with a different observed edge region", async () => {
    let sessionHandler: ((request: Request) => Response | Promise<Response>) | undefined;
    startSessionServer({
      serve: (handler) => { sessionHandler = handler; },
      env: {
        PACT_EXPECTED_REGION: "us-east-1",
        SB_REGION: "ap-southeast-1",
        SESSION_HMAC_SECRET: "local-session-test",
      },
      persistence: {
        insertChallenge: vi.fn(async () => undefined),
        consumeChallenge: vi.fn(async () => null),
        insertSession: vi.fn(async () => undefined),
        findSession: vi.fn(async () => null),
        revokeSession: vi.fn(async () => false),
      },
    });
    const sessionResponse = await sessionHandler!(request("/v1/session/challenge"));
    expect(sessionResponse.status).not.toBe(503);
    expect(await sessionResponse.json()).not.toMatchObject({ code: "REGION_MISMATCH" });

    let gatewayHandler: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({
      serve: (handler) => { gatewayHandler = handler; },
      env: { PACT_EXPECTED_REGION: "us-east-1", SB_REGION: "ap-southeast-1" },
      provider: { parseIntent: vi.fn(async () => ({
        provider: "openai" as const,
        model: "gpt-5.6-luna",
        merchantId: "coffee-demo",
        amountDecimal: "1",
        purpose: "coffee",
        confidence: 1,
      })) },
      card: {
        cardId: "7",
        agent: WALLET,
        asset: "native-testnet-ctc",
        recipient: "0x3333333333333333333333333333333333333333",
        policyVersion: 1,
      },
      merchants: [{ id: "coffee-demo", label: "Coffee" }],
      store: { save: vi.fn(async () => undefined) },
    });
    const gatewayResponse = await gatewayHandler!(request("/v1/agent/intents"));
    expect(gatewayResponse.status).toBe(503);
    expect(await gatewayResponse.json()).not.toMatchObject({ code: "REGION_MISMATCH" });

    let executorHandler: ((request: Request) => Response | Promise<Response>) | undefined;
    startExecutorServer({
      serve: (handler) => { executorHandler = handler; },
      env: { PACT_EXPECTED_REGION: "us-east-1", SB_REGION: "ap-southeast-1" },
      readOnlyClient: {
        readCard: vi.fn(async () => ({ cardId: "7", agent: WALLET, policyVersion: 1, chainId: 102031 })),
        preflight: vi.fn(async () => ({ ok: true })),
      },
    });
    const executorResponse = await executorHandler!(request("/v1/payments/preflight"));
    expect(executorResponse.status).not.toBe(503);
    expect(await executorResponse.json()).not.toMatchObject({ code: "NETWORK_CONFIG_INVALID" });
  });

  it("requires the production roots to name their real adapter composition", () => {
    const sources = [
      readFileSync(new URL("../../session/index.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../ai-gateway/index.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../agent-executor/index.ts", import.meta.url), "utf8"),
    ].join("\n");
    expect(sources).toMatch(/createPostgrestPersistenceFromEnv/);
    expect(sources).toMatch(/SB_REGION/);
    expect(sources).toMatch(/CardStore|cardStore/);
    expect(sources).toMatch(/IntentStore|intentStore/);
  });

  it("fails closed when expected or observed region inputs are absent or mismatched", async () => {
    const provider = { parseIntent: vi.fn(async () => ({
      provider: "openai" as const,
      model: "gpt-5.6-luna",
      merchantId: "coffee-demo",
      amountDecimal: "1",
      purpose: "coffee",
      confidence: 1,
    })) };
    const cardReads = vi.fn(async () => null);
    const intentWrites = vi.fn(async () => undefined);
    const rpcReads = vi.fn(async () => ({ cardId: "7", agent: WALLET, policyVersion: 1, chainId: 102031 }));
    const sessionPersistence = {
      insertChallenge: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => null),
      insertSession: vi.fn(async () => undefined),
      findSession: vi.fn(async () => null),
      revokeSession: vi.fn(async () => false),
    };
    const deps = {
      provider,
      card: {
        cardId: "7",
        agent: WALLET,
        asset: "native-testnet-ctc" as const,
        recipient: "",
        policyVersion: 1,
      },
      merchants: [{ id: "coffee-demo", label: "Coffee" }],
      store: { save: intentWrites },
      cardStore: { getById: cardReads },
      sessionPersistence,
    };

    const cases = [
      { name: "missing expected", env: { SB_REGION: "ap-southeast-1" } },
      { name: "unknown expected", env: { PACT_EXPECTED_REGION: "unknown", SB_REGION: "ap-southeast-1" } },
      { name: "invalid expected", env: { PACT_EXPECTED_REGION: "not_a_region", SB_REGION: "ap-southeast-1" } },
      { name: "missing observed", env: { PACT_EXPECTED_REGION: "us-east-1" } },
      { name: "unknown observed", env: { PACT_EXPECTED_REGION: "us-east-1", SB_REGION: "unknown" } },
      { name: "invalid observed", env: { PACT_EXPECTED_REGION: "us-east-1", SB_REGION: "not_a_region" } },
    ];

    for (const current of cases) {
      let sessionHandler: ((request: Request) => Response | Promise<Response>) | undefined;
      startSessionServer({
        serve: (handler) => { sessionHandler = handler; },
        env: { ...current.env, SESSION_HMAC_SECRET: "local-session-test" },
        persistence: sessionPersistence,
      });
      const sessionResponse = await sessionHandler!(request("/v1/session/challenge"));
      expect(sessionResponse.status).toBe(503);

      let gatewayHandler: ((request: Request) => Response | Promise<Response>) | undefined;
      startGatewayServer({
        serve: (handler) => { gatewayHandler = handler; },
        env: { ...current.env, SESSION_HMAC_SECRET: "local-session-test" },
        ...deps,
      });
      const gatewayResponse = await gatewayHandler!(request("/v1/agent/intents"));
      expect(gatewayResponse.status).toBe(503);

      let executorHandler: ((request: Request) => Response | Promise<Response>) | undefined;
      startExecutorServer({
        serve: (handler) => { executorHandler = handler; },
        env: { ...current.env, CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
        readOnlyClient: {
          readCard: rpcReads,
          preflight: vi.fn(async () => ({ ok: true })),
        },
      });
      const executorResponse = await executorHandler!(request("/v1/payments/preflight"));
      expect(executorResponse.status).toBe(503);
    }

    expect(provider.parseIntent).not.toHaveBeenCalled();
    expect(cardReads).not.toHaveBeenCalled();
    expect(intentWrites).not.toHaveBeenCalled();
    expect(rpcReads).not.toHaveBeenCalled();
    expect(sessionPersistence.insertChallenge).not.toHaveBeenCalled();
    expect(sessionPersistence.findSession).not.toHaveBeenCalled();
  });

  it("reports equal expected and observed regions through the public health shape", async () => {
    let gatewayHandler: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({
      serve: (handler) => { gatewayHandler = handler; },
      env: { PACT_EXPECTED_REGION: "us-east-1", SB_REGION: "ap-southeast-1" },
    });
    const response = await gatewayHandler!(new Request("https://regional.invalid/health", {
      headers: { "x-request-id": "req-g34-health" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      requestId: "req-g34-health",
      configuredRegion: "us-east-1",
      expectedRegion: "us-east-1",
      chainId: 102031,
      provider: "openai",
      model: "gpt-5.6-luna",
      modelAvailable: false,
    });
    expect(Object.keys(body).sort()).toEqual([
      "chainId", "configuredRegion", "expectedRegion", "model", "modelAvailable", "provider", "requestId",
    ]);
  });

  it("keeps the expected region binding separate from observed runtime state", () => {
    const roots = [
      "../../session/index.ts",
      "../../ai-gateway/index.ts",
      "../../agent-executor/index.ts",
    ];
    for (const file of roots) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const serveBlock = source.slice(source.lastIndexOf("if (typeof Deno"));
      expect(source).toMatch(/PACT_EXPECTED_REGION/);
      expect(source).toMatch(/SB_REGION/);
      expect(serveBlock).toMatch(/PACT_EXPECTED_REGION/);
      expect(serveBlock).toMatch(/SB_REGION/);
      expect(serveBlock).not.toMatch(/SUPABASE_FUNCTION_REGION/);
      expect(source).not.toMatch(/(?:PACT_EXPECTED_REGION|SB_REGION)[^;\n]*\?\?\s*["'][^"']+["']/);
      expect(source).not.toMatch(/EXPECTED_REGION\s*=\s*["'][^"']+["']/);
    }
    const providerSource = readFileSync(new URL("../../ai-gateway/openai-provider.ts", import.meta.url), "utf8");
    expect(providerSource).not.toMatch(/us-east-1/);
  });
});
