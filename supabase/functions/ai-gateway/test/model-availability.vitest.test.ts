import { describe, expect, it, vi } from "vitest";
import { deriveModelAvailability, startGatewayServer } from "../index.ts";
import { PINNED_MODEL } from "../../../../packages/domain/src/model-config.ts";
import type { ModelConfig } from "../../../../packages/domain/src/model-config.ts";

const MODEL_CONFIG: ModelConfig = { provider: "openai", model: PINNED_MODEL, allowFallback: false };

describe("/health modelAvailable is derived, never hardcoded", () => {
  it("fails closed when the region gate does not pass", () => {
    expect(deriveModelAvailability({ apiKey: "key", modelConfig: MODEL_CONFIG, regionValid: false })).toBe(false);
  });

  it("fails closed when the provider key is absent or blank", () => {
    expect(deriveModelAvailability({ apiKey: undefined, modelConfig: MODEL_CONFIG, regionValid: true })).toBe(false);
    expect(deriveModelAvailability({ apiKey: "   ", modelConfig: MODEL_CONFIG, regionValid: true })).toBe(false);
  });

  it("fails closed when the pinned model config is unreadable or rejects a call", () => {
    expect(deriveModelAvailability({ apiKey: "key", modelConfig: undefined, regionValid: true })).toBe(false);
    const fallbackAllowed = { ...MODEL_CONFIG, allowFallback: true } as unknown as ModelConfig;
    expect(deriveModelAvailability({ apiKey: "key", modelConfig: fallbackAllowed, regionValid: true })).toBe(false);
  });

  it("reports available only with a key, a callable model pin, and a valid region", () => {
    expect(deriveModelAvailability({ apiKey: "key", modelConfig: MODEL_CONFIG, regionValid: true })).toBe(true);
  });

  it("serves the derived value on GET /health without contacting the provider", async () => {
    const fetchFn = vi.fn();
    const serve = (env: Record<string, string | undefined>) => {
      let served: ((request: Request) => Response | Promise<Response>) | undefined;
      startGatewayServer({ serve: (handler) => { served = handler; }, env, fetchFn });
      if (served === undefined) throw new Error("gateway server did not serve a handler");
      return served;
    };
    const health = (handler: (request: Request) => Response | Promise<Response>, requestId: string) =>
      handler(new Request("https://regional.invalid/health", { headers: { "x-request-id": requestId } }));

    const configured = await health(serve({
      PACT_EXPECTED_REGION: "us-east-1",
      SB_REGION: "ap-southeast-1",
      SESSION_HMAC_SECRET: "local-session-test",
      OPENAI_API_KEY: "local-provider-test",
    }), "req-health-key");
    expect(configured.status).toBe(200);
    expect(await configured.json()).toMatchObject({ modelAvailable: true });

    const unconfigured = await health(serve({
      PACT_EXPECTED_REGION: "us-east-1",
      SB_REGION: "ap-southeast-1",
      SESSION_HMAC_SECRET: "local-session-test",
    }), "req-health-no-key");
    expect(unconfigured.status).toBe(200);
    expect(await unconfigured.json()).toMatchObject({ modelAvailable: false });

    // Neither reading touched the provider: health stays side-effect-free.
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
