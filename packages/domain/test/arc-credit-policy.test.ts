import { describe, expect, it } from "vitest";
import {
  ARC_CREDIT_AMOUNT_CAP_BASE_UNITS,
  ARC_CREDIT_DECIMALS,
  ARC_CREDIT_EXPIRY_DURATION_SECONDS,
  ARC_FIRST_TEST_PAYMENT_AMOUNT_BASE_UNITS,
  checkCreditAmount,
  checkCreditExpiryDuration,
  checkEvidenceFreshness,
  checkFirstTestPaymentAmount,
  checkLiveReadiness,
  checkRoleSeparation,
} from "../src/arc-credit-policy.js";

const FRESH_EVIDENCE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const ZERO_EVIDENCE = "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("Arc verified-credit operating policy (procedural bounds)", () => {
  it("pins the approved numeric parameters", () => {
    expect(ARC_CREDIT_AMOUNT_CAP_BASE_UNITS).toBe(100000000000000000n);
    expect(ARC_FIRST_TEST_PAYMENT_AMOUNT_BASE_UNITS).toBe(10000000000000000n);
    expect(ARC_CREDIT_EXPIRY_DURATION_SECONDS).toBe(1200);
    expect(ARC_CREDIT_DECIMALS).toBe(18);
  });

  it("accepts the approved credit amount, payment amount, expiry, evidence, and roles", () => {
    expect(checkCreditAmount(100000000000000000n).ok).toBe(true);
    expect(checkFirstTestPaymentAmount(10000000000000000n).ok).toBe(true);
    expect(checkCreditExpiryDuration(1200).ok).toBe(true);
    expect(
      checkEvidenceFreshness(FRESH_EVIDENCE, []).ok,
    ).toBe(true);
    expect(
      checkRoleSeparation({
        owner: "0x1111111111111111111111111111111111111111",
        authority: "0x2222222222222222222222222222222222222222",
        agent: "0x3333333333333333333333333333333333333333",
      }).ok,
    ).toBe(true);
  });

  it("rejects zero credit and credit above the 0.1 USDC cap", () => {
    expect(checkCreditAmount(0n).ok).toBe(false);
    expect(checkCreditAmount(100000000000000001n).ok).toBe(false);
  });

  it("rejects first-test payments above 0.01 USDC", () => {
    expect(checkFirstTestPaymentAmount(0n).ok).toBe(false);
    expect(checkFirstTestPaymentAmount(10000000000000001n).ok).toBe(false);
  });

  it("rejects over-long, zero, and negative expiries", () => {
    expect(checkCreditExpiryDuration(1201).ok).toBe(false);
    expect(checkCreditExpiryDuration(0).ok).toBe(false);
    expect(checkCreditExpiryDuration(-1).ok).toBe(false);
  });

  it("rejects zero, malformed, and reused evidence IDs", () => {
    expect(checkEvidenceFreshness(ZERO_EVIDENCE, []).ok).toBe(false);
    expect(checkEvidenceFreshness("not-hex", []).ok).toBe(false);
    expect(checkEvidenceFreshness(FRESH_EVIDENCE, [FRESH_EVIDENCE]).ok).toBe(false);
  });

  it("rejects overlapping or missing role identities", () => {
    const owner = "0x1111111111111111111111111111111111111111";
    const authority = "0x2222222222222222222222222222222222222222";
    const agent = "0x3333333333333333333333333333333333333333";
    expect(checkRoleSeparation({ owner, authority: owner, agent }).ok).toBe(false);
    expect(checkRoleSeparation({ owner, authority, agent: authority }).ok).toBe(false);
    expect(checkRoleSeparation({ owner, authority, agent: owner }).ok).toBe(false);
    expect(checkRoleSeparation({ owner: "", authority, agent }).ok).toBe(false);
    expect(checkRoleSeparation({ owner, authority: "", agent }).ok).toBe(false);
    expect(checkRoleSeparation({ owner, authority, agent: "" }).ok).toBe(false);
  });

  it("fails closed on missing pool balance or uncertain reads", () => {
    expect(
      checkLiveReadiness({
        poolBalance: null,
        paymentAmount: 10000000000000000n,
        readsComplete: true,
        identitiesKnown: true,
      }).ok,
    ).toBe(false);
    expect(
      checkLiveReadiness({
        poolBalance: 1000000000000000000n,
        paymentAmount: 10000000000000000n,
        readsComplete: false,
        identitiesKnown: true,
      }).ok,
    ).toBe(false);
    expect(
      checkLiveReadiness({
        poolBalance: 1000000000000000000n,
        paymentAmount: 10000000000000000n,
        readsComplete: true,
        identitiesKnown: false,
      }).ok,
    ).toBe(false);
    expect(
      checkLiveReadiness({
        poolBalance: 1000000000000000000n,
        paymentAmount: 10000000000000000n,
        readsComplete: true,
        identitiesKnown: true,
      }).ok,
    ).toBe(true);
  });
});
