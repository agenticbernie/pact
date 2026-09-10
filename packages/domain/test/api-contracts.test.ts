import { describe, expect, it } from "vitest";
import {
  API_ERROR_CODES,
  MAX_PROMPT_LENGTH,
  createApiError,
  parseIntentRequest,
  requireRequestId,
  toApiError,
} from "../src/api.js";

describe("api contracts", () => {
  it("exposes the closed 15-code surface", () => {
    expect(API_ERROR_CODES).toHaveLength(15);
  });

  it("requires cardId and a bounded prompt", () => {
    const ok = parseIntentRequest({ cardId: "7", prompt: "buy coffee" });
    expect(ok.cardId).toBe("7");
    expect(() => parseIntentRequest({ cardId: "", prompt: "buy coffee" })).toThrow();
    expect(() => parseIntentRequest({ cardId: "7", prompt: "" })).toThrow();
    expect(() =>
      parseIntentRequest({ cardId: "7", prompt: "p".repeat(MAX_PROMPT_LENGTH + 1) }),
    ).toThrow();
    expect(MAX_PROMPT_LENGTH).toBe(2000);
  });

  it("rejects a missing requestId", () => {
    expect(() => requireRequestId(undefined)).toThrow();
    expect(() => requireRequestId("")).toThrow();
    expect(requireRequestId("req-1")).toBe("req-1");
  });

  it("keeps stable status values and redacted errors", () => {
    const err = createApiError("PROVIDER_UNAVAILABLE", "req-1");
    expect(err.requestId).toBe("req-1");
    expect(err.code).toBe("PROVIDER_UNAVAILABLE");
    expect(JSON.stringify(err)).not.toContain("sk-");
    const mapped = toApiError(new Error("boom"), "req-2");
    expect(mapped.requestId).toBe("req-2");
    expect(API_ERROR_CODES).toContain(mapped.code);
  });
});
