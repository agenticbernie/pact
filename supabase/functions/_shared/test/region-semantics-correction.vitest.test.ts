import { describe, expect, it, vi } from "vitest";
import { resolveRegionConfig, regionsMatch } from "../region-config.ts";
import { createGatewayCompositionRoot, createGatewayEntrypointHandler } from "../../ai-gateway/index.ts";
import { createExecutorCompositionRoot, createExecutorEntrypointHandler } from "../../agent-executor/index.ts";

// Production shape: authoritative project region us-east-1 (operator
// PACT_EXPECTED_REGION) with platform-observed edge runtime ap-southeast-1.
// This pair MUST NOT read as a project-region mismatch.
const PROD_ENV = {
  PACT_EXPECTED_REGION: "us-east-1",
  SB_REGION: "ap-southeast-1",
};

describe("Region semantics correction (RED-first)", () => {
  it("names authoritative, observed, and configured regions explicitly", () => {
    const resolved = resolveRegionConfig(PROD_ENV);
    expect(resolved.expectedRegion).toBe("us-east-1");
    expect(resolved).toHaveProperty("observedRuntimeRegion", "ap-southeast-1");
    expect(resolved.configuredRegion).toBe("us-east-1");
    expect("observedRegion" in resolved).toBe(false);
    expect(regionsMatch(resolved.expectedRegion, resolved.observedRuntimeRegion)).toBe(true);
  });

  it("reports the authoritative region (not observed runtime) on composition health", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    const { startGatewayServer } = await import("../../ai-gateway/index.ts");
    startGatewayServer({ serve: (handler) => { served = handler; }, env: PROD_ENV });
    const response = await served!(new Request("https://regional.invalid/health", {
      headers: { "x-request-id": "req-region-health" },
    }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      requestId: "req-region-health",
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

  it("does not reject protected executor work for the healthy production pair", async () => {
    const handler = createExecutorEntrypointHandler({
      configuredRegion: "us-east-1",
      expectedRegion: "us-east-1",
      actualRegion: "ap-southeast-1",
      readOnlyClient: {
        readCard: vi.fn(async () => ({ cardId: "7", agent: "0x1111111111111111111111111111111111111111", policyVersion: 1, chainId: 102031 })),
        preflight: vi.fn(async () => ({ ok: true })),
      },
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { "x-request-id": "req-region-exec" },
      body: JSON.stringify({ intentId: "intent-1", cardId: "7", nonce: "7:1" }),
    }));
    // Passes the region gate (no 503 REGION_MISMATCH); legacy seam answers.
    expect(response.status).toBe(200);
  });

  it("does not reject protected gateway work for the healthy production pair", async () => {
    const provider = {
      parseIntent: vi.fn(async () => ({
        provider: "openai" as const,
        model: "gpt-5.6-luna",
        merchantId: "coffee-demo",
        amountDecimal: "1",
        purpose: "coffee",
        confidence: 1,
      })),
    };
    const handler = createGatewayEntrypointHandler({
      configuredRegion: "us-east-1",
      expectedRegion: "us-east-1",
      deps: {
        provider,
        card: { cardId: "7", agent: "0x1111111111111111111111111111111111111111", asset: "native-testnet-ctc", recipient: "", policyVersion: 1 },
        merchants: [{ id: "coffee-demo", label: "Coffee" }],
        expectedRegion: "us-east-1",
        actualRegion: "ap-southeast-1",
        nowMs: Date.now(),
        store: { save: vi.fn(async () => undefined) },
        configuredRegion: "us-east-1",
        sessionSecret: "local-session-test",
        sessionPersistence: {
          insertChallenge: vi.fn(async () => undefined),
          consumeChallenge: vi.fn(async () => null),
          insertSession: vi.fn(async () => undefined),
          findSession: vi.fn(async () => null),
          revokeSession: vi.fn(async () => false),
        },
      },
    });
    const response = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "x-request-id": "req-region-gw" },
      body: JSON.stringify({ prompt: "hi", cardId: "7" }),
    }));
    // Passes the region gate; stops at session auth (401), never 503.
    expect(response.status).toBe(401);
    expect(provider.parseIntent).not.toHaveBeenCalled();
  });

  it("fails closed when the authoritative region is missing", async () => {
    const resolved = resolveRegionConfig({ SB_REGION: "ap-southeast-1" });
    expect(resolved.configuredRegion).toBe("unknown");
    expect(regionsMatch(resolved.expectedRegion, resolved.observedRuntimeRegion)).toBe(false);
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    const { startExecutorServer } = await import("../../agent-executor/index.ts");
    startExecutorServer({
      serve: (handler) => { served = handler; },
      env: { SB_REGION: "ap-southeast-1", ARC_RPC_URL: "http://local-rpc.invalid" },
    });
    const response = await served!(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { "x-request-id": "req-region-missing" },
      body: JSON.stringify({ intentId: "x" }),
    }));
    expect(response.status).toBe(503);
  });

  it("fails closed on malformed region values", () => {
    expect(regionsMatch("not_a_region", "ap-southeast-1")).toBe(false);
    expect(regionsMatch("us-east-1", "unknown")).toBe(false);
    expect(regionsMatch("us-east-1", "not_a_region")).toBe(false);
  });

  it("keeps session bootstrap free of region coupling", async () => {
    const { startSessionServer } = await import("../../session/index.ts");
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startSessionServer({
      serve: (handler) => { served = handler; },
      env: { ...PROD_ENV, SESSION_HMAC_SECRET: "local-session-test" },
      persistence: {
        insertChallenge: vi.fn(async () => undefined),
        consumeChallenge: vi.fn(async () => null),
        insertSession: vi.fn(async () => undefined),
        findSession: vi.fn(async () => null),
        revokeSession: vi.fn(async () => false),
      },
    });
    const response = await served!(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      headers: { "x-request-id": "req-region-session" },
      body: JSON.stringify({ walletAddress: "0x1111111111111111111111111111111111111111" }),
    }));
    expect(response.status).toBe(200);
  });

  it("never treats the observed runtime region as project truth in composition", async () => {
    const root = createGatewayCompositionRoot({ env: PROD_ENV });
    const probe = await root(new Request("https://regional.invalid/health", {
      headers: { "x-request-id": "req-region-truth" },
    }));
    const body = (await probe.json()) as Record<string, unknown>;
    expect(body["configuredRegion"]).not.toBe("ap-southeast-1");
    const execRoot = createExecutorCompositionRoot({ env: { ...PROD_ENV, ARC_RPC_URL: "http://local-rpc.invalid" } });
    expect(typeof execRoot).toBe("function");
  });
});
