import { describe, expect, it } from "vitest";
import { startGatewayServer } from "../../ai-gateway/index.ts";

describe("G17 regional health route", () => {
  it("serves exact GET /health without auth or runtime side effects", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({ serve: (handler) => { served = handler; }, env: { SUPABASE_FUNCTION_REGION: "us-east-1" } });
    const response = await served!(new Request("https://regional.invalid/health", { method: "GET", headers: { "x-request-id": "req-health" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      requestId: "req-health",
      configuredRegion: "us-east-1",
      expectedRegion: "us-east-1",
      chainId: 102031,
      provider: "openai",
      model: "gpt-5.6-luna",
      modelAvailable: false,
    });
    expect(response.headers.get("x-request-id")).toBe("req-health");
  });
});
