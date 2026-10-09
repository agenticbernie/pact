import { describe, expect, it } from "vitest";
import { applyAuthoritativePolicyVersion } from "../index.ts";
import type { ProviderCardContext } from "../provider-port.ts";

const RECORD: ProviderCardContext = {
  cardId: "3",
  agent: "0x1111111111111111111111111111111111111111",
  asset: "arc-testnet-usdc",
  recipient: "",
  // Projection placeholder, not the chain's value.
  policyVersion: 0,
};

describe("applyAuthoritativePolicyVersion", () => {
  it("keeps the record value when no resolver is wired", async () => {
    await expect(applyAuthoritativePolicyVersion(RECORD, undefined)).resolves.toEqual(RECORD);
  });

  it("overrides the placeholder with the controller's version", async () => {
    const card = await applyAuthoritativePolicyVersion(RECORD, () => Promise.resolve(1));
    expect(card.policyVersion).toBe(1);
    // Nothing else about the card changes.
    expect(card.cardId).toBe(RECORD.cardId);
    expect(card.agent).toBe(RECORD.agent);
  });

  it("keeps the record value when the chain answers null", async () => {
    await expect(
      applyAuthoritativePolicyVersion(RECORD, () => Promise.resolve(null)),
    ).resolves.toEqual(RECORD);
  });

  it("keeps the record value when the read throws", async () => {
    await expect(
      applyAuthoritativePolicyVersion(RECORD, () => Promise.reject(new Error("rpc down"))),
    ).resolves.toEqual(RECORD);
  });

  it("ignores a non-integer or negative answer", async () => {
    await expect(applyAuthoritativePolicyVersion(RECORD, () => Promise.resolve(1.5))).resolves.toEqual(RECORD);
    await expect(applyAuthoritativePolicyVersion(RECORD, () => Promise.resolve(-1))).resolves.toEqual(RECORD);
  });
});
