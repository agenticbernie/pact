import { describe, expect, it } from "vitest";
import {
  AgentIntentSchema,
  assertMerchantAllowed,
  createMerchantCatalog,
  parseAgentIntent,
} from "../src/schemas.js";
import { DomainError } from "../src/errors.js";

const AGENT = "0x1111111111111111111111111111111111111111";

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    intentId: "intent-001",
    agentId: AGENT,
    cardId: "7",
    merchantId: "coffee-demo",
    amountBaseUnits: "250",
    asset: "native-testnet-ctc",
    purpose: "demo coffee purchase",
    confidence: 0.92,
    provider: "openai",
    model: "gpt-5.6-luna",
    createdAt: "2026-09-09T00:00:00Z",
    expiresAt: "2026-09-09T00:05:00Z",
    policyVersion: 1,
    intentHash:
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    ...overrides,
  };
}

describe("AgentIntentSchema", () => {
  it("parses a valid intent", () => {
    const intent = AgentIntentSchema.parse(makeIntent());
    expect(intent.merchantId).toBe("coffee-demo");
    expect(intent.asset).toBe("native-testnet-ctc");
    expect(intent.provider).toBe("openai");
    expect(intent.model).toBe("gpt-5.6-luna");
    expect(intent.policyVersion).toBe(1);
  });

  it("rejects a malformed merchant ID", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ merchantId: "Coffee Shop!" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ merchantId: "UPPER" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ merchantId: "" }))).toThrow();
  });

  it("rejects an unregistered merchant through catalog lookup", () => {
    const catalog = createMerchantCatalog(["coffee-demo"]);
    expect(() => assertMerchantAllowed(catalog, "tea-house")).toThrowError(DomainError);
    try {
      assertMerchantAllowed(catalog, "tea-house");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("MERCHANT_NOT_ALLOWLISTED");
    }
    expect(() => assertMerchantAllowed(catalog, "coffee-demo")).not.toThrow();
  });

  it("rejects zero and non-canonical amounts", () => {
    for (const amount of ["0", "01", "00", "1.5", "1e3", " 10", "10 ", "+10", "-5", "0x10"]) {
      expect(() => AgentIntentSchema.parse(makeIntent({ amountBaseUnits: amount })), amount).toThrow();
    }
    expect(AgentIntentSchema.parse(makeIntent({ amountBaseUnits: "1" })).amountBaseUnits).toBe("1");
  });

  it("rejects a wrong logical asset", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ asset: "eth" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ asset: "0x0000000000000000000000000000000000000000" }))).toThrow();
  });

  it("rejects invalid confidence and time values", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ confidence: 1.5 }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ confidence: -0.1 }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ createdAt: "not-a-time" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ createdAt: "2026-09-09T00:00:00+02:00" }))).toThrow();
    expect(() =>
      AgentIntentSchema.parse(
        makeIntent({ createdAt: "2026-09-09T00:05:00Z", expiresAt: "2026-09-09T00:05:00Z" }),
      ),
    ).toThrow();
    expect(() =>
      AgentIntentSchema.parse(
        makeIntent({ createdAt: "2026-09-09T00:06:00Z", expiresAt: "2026-09-09T00:05:00Z" }),
      ),
    ).toThrow();
  });

  it("rejects a purpose longer than 160 chars", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ purpose: "p".repeat(161) }))).toThrow();
  });

  it("rejects a zero or malformed agent address", () => {
    expect(() =>
      AgentIntentSchema.parse(
        makeIntent({ agentId: "0x0000000000000000000000000000000000000000" }),
      ),
    ).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ agentId: "not-an-address" }))).toThrow();
  });

  it("rejects a raw recipient address with a redacted DomainError", () => {
    try {
      parseAgentIntent(makeIntent({ recipientAddress: "0x2222222222222222222222222222222222222222" }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SECRET_FIELD_REJECTED");
      expect((error as DomainError).message).not.toContain("0x2222");
    }
  });

  it("rejects nested secret-bearing fields without echoing values", () => {
    try {
      parseAgentIntent(makeIntent({ notes: { apiKey: "sk-super-secret-value" } }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("SECRET_FIELD_REJECTED");
      expect((error as DomainError).message).not.toContain("sk-super-secret-value");
      expect(JSON.stringify((error as DomainError).details)).not.toContain("sk-super-secret-value");
    }
  });

  it("rejects unknown top-level keys instead of stripping them", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ extraField: "nope" }))).toThrow();
  });

  it("rejects a non-OpenAI provider or substituted model", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ provider: "anthropic" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ model: "gpt-4o" }))).toThrow();
  });

  it("rejects a malformed intent hash", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ intentHash: "0x123" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ intentHash: "not-hex" }))).toThrow();
  });

  it("rejects a non-decimal card ID", () => {
    expect(() => AgentIntentSchema.parse(makeIntent({ cardId: "card-7" }))).toThrow();
    expect(() => AgentIntentSchema.parse(makeIntent({ cardId: "07" }))).toThrow();
  });
});
