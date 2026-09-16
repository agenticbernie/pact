import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createGatewayCompositionRoot, createGatewayEntrypointHandler } from "../../ai-gateway/index.ts";
import { createExecutorCompositionRoot } from "../../agent-executor/index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const SECRET = "local-session-test";

function gatewayDeps() {
  return {
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
    sessionPersistence: {
      insertChallenge: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => null),
      insertSession: vi.fn(async () => undefined),
      findSession: vi.fn(async () => null),
      revokeSession: vi.fn(async () => false),
    },
  };
}

describe("G25/G29 application auth and public health", () => {
  it("has explicit JWT bypass settings for the three application-auth functions", () => {
    const path = new URL("../../../config.toml", import.meta.url);
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    for (const slug of ["session", "ai-gateway", "agent-executor"]) {
      expect(source).toMatch(new RegExp(`\\[functions\\.${slug}\\][\\s\\S]*?verify_jwt\\s*=\\s*false`));
    }
  });

  it("keeps health public, correlated, and exactly seven keys", async () => {
    const handler = createGatewayEntrypointHandler({ configuredRegion: "ap-southeast-1", expectedRegion: "us-east-1" });
    const response = await handler(new Request("https://regional.invalid/functions/v1/ai-gateway/health", {
      headers: { "x-request-id": "req-health" },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({
      requestId: "req-health",
      configuredRegion: "ap-southeast-1",
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

  it("rejects protected gateway and executor routes before side effects", async () => {
    const gateway = gatewayDeps();
    const gatewayHandler = createGatewayCompositionRoot({
      env: {
        PACT_EXPECTED_REGION: "ap-southeast-1",
        SB_REGION: "ap-southeast-1",
        SESSION_HMAC_SECRET: SECRET,
        OPENAI_API_KEY: "local-provider-test",
      },
      ...gateway,
    });
    const gatewayResponse = await gatewayHandler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(gatewayResponse.status).toBe(401);
    expect(gateway.provider.parseIntent).not.toHaveBeenCalled();
    expect(gateway.store.save).not.toHaveBeenCalled();

    const readCard = vi.fn(async () => ({ cardId: "7", agent: WALLET, policyVersion: 1, chainId: 102031 }));
    const preflight = vi.fn(async () => ({ ok: true }));
    const executorHandler = createExecutorCompositionRoot({
      env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SECRET },
      readOnlyClient: { readCard, preflight },
    });
    const executorResponse = await executorHandler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      body: JSON.stringify({ intentId: "intent-1", cardId: "7", nonce: "client-value" }),
    }));
    expect(executorResponse.status).toBe(401);
    expect(readCard).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });
});
