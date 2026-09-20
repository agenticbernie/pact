import { describe, expect, it } from "vitest";
import {
  assertSupportedProviderId,
  SUPPORTED_AI_PROVIDERS,
} from "../provider-port.ts";

describe("AI provider boundary (OpenAI now, gateway reserved)", () => {
  it("supports exactly the pinned OpenAI provider", () => {
    expect(SUPPORTED_AI_PROVIDERS).toEqual(["openai"]);
    expect(assertSupportedProviderId("openai")).toBe("openai");
  });

  it("rejects the future Neon AI Gateway id fail-closed", () => {
    expect(() => assertSupportedProviderId("neon-ai-gateway")).toThrow(
      /not enabled/i,
    );
  });

  it("rejects unknown provider ids fail-closed", () => {
    expect(() => assertSupportedProviderId("other-provider")).toThrow();
    expect(() => assertSupportedProviderId("")).toThrow();
  });
});
