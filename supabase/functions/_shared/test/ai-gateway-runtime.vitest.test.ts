import { describe, expect, it, vi } from "vitest";
import { createGatewayCompositionRoot, startGatewayServer, type IntentStore } from "../../ai-gateway/index.ts";
import type { AiProvider } from "../../ai-gateway/provider-port.ts";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { hashToken } from "../session-token.ts";

const card = {
  cardId: "7",
  agent: "0x1111111111111111111111111111111111111111",
  asset: "native-testnet-ctc",
  recipient: "0x3333333333333333333333333333333333333333",
  policyVersion: 1,
};
const provider: AiProvider = {
  parseIntent: vi.fn(async () => ({
    provider: "openai" as const,
    model: "gpt-5.6-luna",
    merchantId: "coffee-demo",
    amountDecimal: "1",
    purpose: "coffee",
    confidence: 0.9,
  })),
};
const SECRET = "local-session-test";
const TOKEN = issueSessionToken({
  sessionId: "runtime-session",
  wallet: card.agent,
  role: "user",
}, SECRET);

function sessionPersistence() {
  return {
    insertChallenge: vi.fn(async () => undefined),
    consumeChallenge: vi.fn(async () => null),
    insertSession: vi.fn(async () => undefined),
    findSession: vi.fn(async () => ({
      id: "runtime-session",
      tokenHash: hashToken(TOKEN),
      wallet: card.agent,
      role: "user" as const,
      issuedAtMs: Date.now() - 1_000,
      expiresAtMs: Date.now() + 60_000,
      revokedAtMs: null,
    })),
    revokeSession: vi.fn(async () => false),
  };
}

describe("G15 gateway runtime composition", () => {
  it("uses the production composition root passed to Deno.serve", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({
      serve: (handler) => { served = handler; },
      env: {
         PACT_EXPECTED_REGION: "ap-southeast-1",
         SB_REGION: "ap-southeast-1",
        SESSION_HMAC_SECRET: SECRET,
        OPENAI_API_KEY: "test-only",
      },
      provider,
      card,
      merchants: [{ id: "coffee-demo", label: "Coffee" }],
      store: { save: vi.fn(async () => undefined) },
      sessionPersistence: sessionPersistence(),
    });
    expect(served).toBeDefined();
    const response = await served!(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(response.status).toBe(200);
  });

  it("persists only after shared validation and never persists a provider failure", async () => {
    const store: IntentStore = { save: vi.fn(async () => undefined) };
    const handler = createGatewayCompositionRoot({
       env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SECRET }, provider, card,
      merchants: [{ id: "coffee-demo", label: "Coffee" }], store, sessionPersistence: sessionPersistence(),
    });
    const validResponse = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-valid", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(validResponse.status).toBe(200);
    await expect(validResponse.json()).resolves.toMatchObject({ status: "ready", requestId: "req-valid" });
    expect(store.save).toHaveBeenCalledTimes(1);

    const failingStore: IntentStore = { save: vi.fn(async () => undefined) };
    const failedHandler = createGatewayCompositionRoot({
       env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SECRET },
      provider: { parseIntent: vi.fn(async () => { throw Object.assign(new Error("provider failure"), { status: 503 }); }) },
      card, merchants: [{ id: "coffee-demo", label: "Coffee" }], store: failingStore,
      sessionPersistence: sessionPersistence(),
    });
    const failedResponse = await failedHandler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-failed", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(failedResponse.status).toBe(400);
    await expect(failedResponse.json()).resolves.toMatchObject({ code: "PROVIDER_UNAVAILABLE", requestId: "req-failed" });
    expect(failingStore.save).not.toHaveBeenCalled();
  });
});
