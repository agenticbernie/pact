import { describe, expect, it, vi } from "vitest";
import { createGatewayCompositionRoot, startGatewayServer, type IntentStore } from "../../ai-gateway/index.ts";
import type { AiProvider } from "../../ai-gateway/provider-port.ts";

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

describe("G15 gateway runtime composition", () => {
  it("uses the production composition root passed to Deno.serve", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({
      serve: (handler) => { served = handler; },
      env: { SUPABASE_FUNCTION_REGION: "us-east-1", OPENAI_API_KEY: "test-only" },
      provider,
      card,
      merchants: [{ id: "coffee-demo", label: "Coffee" }],
      store: { save: vi.fn(async () => undefined) },
    });
    expect(served).toBeDefined();
    const response = await served!(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(response.status).toBe(200);
  });

  it("persists only after shared validation and never persists a provider failure", async () => {
    const store: IntentStore = { save: vi.fn(async () => undefined) };
    const handler = createGatewayCompositionRoot({
      env: { SUPABASE_FUNCTION_REGION: "us-east-1" }, provider, card,
      merchants: [{ id: "coffee-demo", label: "Coffee" }], store,
    });
    const validResponse = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-valid" },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(validResponse.status).toBe(200);
    await expect(validResponse.json()).resolves.toMatchObject({ status: "ready", requestId: "req-valid" });
    expect(store.save).toHaveBeenCalledTimes(1);

    const failingStore: IntentStore = { save: vi.fn(async () => undefined) };
    const failedHandler = createGatewayCompositionRoot({
      env: { SUPABASE_FUNCTION_REGION: "us-east-1" },
      provider: { parseIntent: vi.fn(async () => { throw Object.assign(new Error("provider failure"), { status: 503 }); }) },
      card, merchants: [{ id: "coffee-demo", label: "Coffee" }], store: failingStore,
    });
    const failedResponse = await failedHandler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-failed" },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(failedResponse.status).toBe(400);
    await expect(failedResponse.json()).resolves.toMatchObject({ code: "PROVIDER_UNAVAILABLE", requestId: "req-failed" });
    expect(failingStore.save).not.toHaveBeenCalled();
  });
});
