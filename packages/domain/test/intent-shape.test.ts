import { describe, expect, it } from "vitest";
import { canonicalIntentHash } from "../src/canonical-hash.js";
import { assertMerchantAllowed, createMerchantCatalog, parseAgentIntent } from "../src/schemas.js";
import { DomainError } from "../src/errors.js";

const AGENT = "0x1111111111111111111111111111111111111111";

function baseIntent(overrides: Record<string, unknown> = {}) {
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
    intentHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
    ...overrides,
  };
}

describe("merchantId-only intent shape (S2)", () => {
  it("rejects extra model-supplied fields (recipient/address/asset/card/nonce)", () => {
    for (const extra of [
      { recipientAddress: "0x2222222222222222222222222222222222222222" },
      { recipient: "0x2222222222222222222222222222222222222222" },
      { calldata: "0x1234" },
      { nonce: "5" },
      { assetAddress: "0x2222222222222222222222222222222222222222" },
      { cardAddress: "0x2222222222222222222222222222222222222222" },
    ]) {
      expect(() => parseAgentIntent({ ...baseIntent(), ...extra })).toThrowError(DomainError);
    }
  });

  it("rejects unknown merchants through the catalog allowlist", () => {
    const catalog = createMerchantCatalog(["coffee-demo"]);
    expect(() => assertMerchantAllowed(catalog, "unknown-shop")).toThrowError(DomainError);
    expect(() => assertMerchantAllowed(catalog, "coffee-demo")).not.toThrow();
  });

  it("keeps hash stable via the reused canonical function", () => {
    const a = canonicalIntentHash({
      cardId: "7",
      agentId: AGENT,
      merchantId: "coffee-demo",
      amountBaseUnits: "250",
      asset: "native-testnet-ctc",
      purpose: "demo coffee purchase",
      expiresAt: "2026-09-09T00:05:00Z",
      policyVersion: 1,
    });
    const b = canonicalIntentHash({
      cardId: "7",
      agentId: AGENT,
      merchantId: "coffee-demo",
      amountBaseUnits: "250",
      asset: "native-testnet-ctc",
      purpose: "demo coffee purchase",
      expiresAt: "2026-09-09T00:05:00Z",
      policyVersion: 1,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });
});
