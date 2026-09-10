import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { API_ERROR_CODES, mapDomainErrorToApiCode, toApiError } from "../src/api.js";
import { DomainError } from "../src/errors.js";

const EXPECTED_15 = [
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "INPUT_INVALID",
  "NETWORK_CONFIG_INVALID",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_MODEL_UNAVAILABLE",
  "PROVIDER_OUTPUT_INVALID",
  "REGION_MISMATCH",
  "CARD_NOT_ELIGIBLE",
  "PREFLIGHT_DECLINED",
  "PAYMENT_BROADCAST_TIMEOUT",
  "PAYMENT_FAILED",
  "PAYMENT_RECONCILIATION_REQUIRED",
  "RATE_LIMITED",
] as const;

describe("closed 15-code mapper", () => {
  it("has exactly the 15 Task 1.2 codes in order", () => {
    expect([...API_ERROR_CODES]).toEqual([...EXPECTED_15]);
    expect(new Set(API_ERROR_CODES).size).toBe(15);
  });

  it("maps every Phase 01 DomainError without an escape hatch", () => {
    expect(mapDomainErrorToApiCode("INTENT_SCHEMA_INVALID")).toBe("INPUT_INVALID");
    expect(mapDomainErrorToApiCode("SECRET_FIELD_REJECTED")).toBe("INPUT_INVALID");
    expect(mapDomainErrorToApiCode("MERCHANT_NOT_ALLOWLISTED")).toBe("CARD_NOT_ELIGIBLE");
    expect(mapDomainErrorToApiCode("NETWORK_CONFIG_INVALID")).toBe("NETWORK_CONFIG_INVALID");
    expect(mapDomainErrorToApiCode("AI_CONFIG_INVALID")).toBe("PROVIDER_MODEL_UNAVAILABLE");
  });

  it("maps DomainError instances and never passes raw bodies through", () => {
    const err = toApiError(
      new DomainError("AI_CONFIG_INVALID", "bad model sk-proj-secret-body"),
      "req-1",
    );
    expect(err.code).toBe("PROVIDER_MODEL_UNAVAILABLE");
    expect(err.requestId).toBe("req-1");
    expect(JSON.stringify(err)).not.toContain("sk-proj-secret-body");
  });

  it("sends unknown/throwable to INPUT_INVALID or PROVIDER_UNAVAILABLE, never raw", () => {
    const a = toApiError(new Error("weird"), "req-a");
    const b = toApiError("plain string failure", "req-b");
    const c = toApiError(undefined, "req-c");
    for (const err of [a, b, c]) {
      expect(["INPUT_INVALID", "PROVIDER_UNAVAILABLE"]).toContain(err.code);
      expect(err.requestId.length).toBeGreaterThan(0);
    }
  });

  it("forbids the string escape hatch in the mapper source", () => {
    const src = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/as string/);
    expect(src).toMatch(/const _exhaustive: never/);
  });
});
