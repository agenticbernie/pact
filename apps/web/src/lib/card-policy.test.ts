/**
 * Policy-check tests. These cover the rules the issuance form and the payment
 * panel rely on before a wallet is ever asked to sign, including the malformed
 * address shape that a truncated transcription produces (38 hex characters) —
 * it must be rejected, never padded.
 */
import { describe, expect, it } from "vitest";
import {
  availableCredit,
  cardStatusName,
  checkControllerDeployment,
  checkWalletChain,
  effectiveLimit,
  normalizeEvmAddress,
  parseBaseUnits,
  validateCardDraft,
  evaluatePaymentEligibility,
  type ChainCardSnapshot,
  type PolicyCheck,
} from "./card-policy";

const ZERO = "0x0000000000000000000000000000000000000000";
const AGENT = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
const AGENT_CHECKSUM = "0xdc26A45c3166c28A3a3A6e02fC8A3BA88d631682";
const OWNER = "0x83bc1007076f6681a90d7d60ad62cb53a120f833";
const CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const MERCHANTS = ["coffee-demo", "book-demo"] as const;

function checkById(checks: PolicyCheck[], id: string): PolicyCheck {
  const found = checks.find((check) => check.id === id);
  if (found === undefined) throw new Error(`Missing check ${id}`);
  return found;
}

describe("normalizeEvmAddress", () => {
  it("checksums a valid lowercase address", () => {
    expect(normalizeEvmAddress(AGENT)).toEqual({ ok: true, address: AGENT_CHECKSUM });
  });

  it("rejects the truncated 38-character address", () => {
    expect(normalizeEvmAddress("0xdc26A45c3166c28A3A6e02fC8A3BA88d631682")).toEqual({
      ok: false,
      reason: "address-malformed",
    });
  });

  it("rejects a 41-character address, the zero address and a broken checksum", () => {
    expect(normalizeEvmAddress(`${AGENT}ab`).ok).toBe(false);
    expect(normalizeEvmAddress(ZERO)).toEqual({ ok: false, reason: "address-zero" });
    expect(normalizeEvmAddress("0xDc26A45c3166c28A3a3A6e02fC8A3BA88d631682")).toEqual({
      ok: false,
      reason: "address-checksum-invalid",
    });
  });

  it("rejects an empty value", () => {
    expect(normalizeEvmAddress("   ")).toEqual({ ok: false, reason: "address-missing" });
  });
});

describe("parseBaseUnits", () => {
  it("parses exact 18-decimal amounts", () => {
    expect(parseBaseUnits("0.005", 18)).toBe(5_000_000_000_000_000n);
    expect(parseBaseUnits("0.1", 18)).toBe(100_000_000_000_000_000n);
    expect(parseBaseUnits("1.2", 18)).toBe(1_200_000_000_000_000_000n);
    expect(parseBaseUnits("0", 18)).toBe(0n);
  });

  it("rejects text, negatives and over-precise values", () => {
    expect(parseBaseUnits("abc", 18)).toBeNull();
    expect(parseBaseUnits("-1", 18)).toBeNull();
    expect(parseBaseUnits("1e18", 18)).toBeNull();
    expect(parseBaseUnits("0.0000000000000000001", 18)).toBeNull();
  });
});

describe("validateCardDraft", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  const base = {
    agent: AGENT,
    ownerConfiguredCap: "0.1",
    perTransactionLimit: "0.01",
    expiresAt: "2026-11-07T12:00",
    merchants: ["coffee-demo"],
    catalog: MERCHANTS,
    decimals: 18,
    now,
  };

  it("accepts a well-formed draft and normalizes it", () => {
    const result = validateCardDraft(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.agent).toBe(AGENT_CHECKSUM);
    expect(result.draft.ownerConfiguredCap).toBe(100_000_000_000_000_000n);
    expect(result.draft.perTransactionLimit).toBe(10_000_000_000_000_000n);
    expect(result.draft.merchants).toEqual(["coffee-demo"]);
    expect(result.draft.expiresAtSeconds).toBe(BigInt(Math.floor(Date.parse("2026-11-07T12:00") / 1000)));
  });

  it("rejects a per-transaction limit above the owner cap", () => {
    const result = validateCardDraft({ ...base, perTransactionLimit: "1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([{ field: "perTransactionLimit", reason: "limit-over-cap" }]);
  });

  it("rejects non-positive limits, a past expiry, no merchant and an unknown merchant", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ownerConfiguredCap: "0" }, "cap-not-positive"],
      [{ perTransactionLimit: "0" }, "limit-not-positive"],
      [{ expiresAt: "2026-09-01T00:00" }, "expiry-not-future"],
      [{ merchants: [] }, "merchants-empty"],
      [{ merchants: ["not-in-catalog"] }, "merchants-unknown"],
      [{ agent: "0xdc26A45c3166c28A3A6e02fC8A3BA88d631682" }, "address-malformed"],
    ];
    for (const [patch, reason] of cases) {
      const result = validateCardDraft({ ...base, ...patch });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.issues.map((issue) => issue.reason)).toContain(reason);
    }
  });
});

describe("environment checks", () => {
  it("accepts the lane chain and rejects any other", () => {
    expect(checkWalletChain(5042002, 5042002)).toEqual({ ok: true });
    expect(checkWalletChain(1, 5042002)).toEqual({ ok: false, reason: "chain-mismatch" });
    expect(checkWalletChain(0, 5042002)).toEqual({ ok: false, reason: "chain-unknown" });
  });

  it("requires real bytecode at the controller address", () => {
    expect(checkControllerDeployment("0x6080", CONTROLLER)).toEqual({ ok: true });
    expect(checkControllerDeployment("0x", CONTROLLER)).toEqual({
      ok: false,
      reason: "controller-not-deployed",
    });
    expect(checkControllerDeployment("0x6080", "nope")).toEqual({
      ok: false,
      reason: "controller-address-invalid",
    });
  });
});

describe("card status naming", () => {
  it("mirrors the Solidity enum order", () => {
    expect([0, 1, 2, 3].map(cardStatusName)).toEqual(["Issued", "Active", "Suspended", "Closed"]);
    expect(cardStatusName(9)).toBe("Unknown");
  });
});

const NOW = 1_760_000_000;

function card(overrides: Partial<ChainCardSnapshot> = {}): ChainCardSnapshot {
  return {
    owner: OWNER,
    agent: AGENT,
    asset: ZERO,
    ownerConfiguredCap: 100_000_000_000_000_000n,
    verifiedCredit: 100_000_000_000_000_000n,
    verifiedCreditExpiry: BigInt(NOW + 600),
    spent: 0n,
    perTransactionLimit: 10_000_000_000_000_000n,
    expiresAt: BigInt(NOW + 86_400),
    status: 1,
    ...overrides,
  };
}

function eligibility(overrides: Partial<Parameters<typeof evaluatePaymentEligibility>[0]> = {}) {
  return evaluatePaymentEligibility({
    card: card(),
    controller: CONTROLLER,
    expectedController: CONTROLLER,
    chainId: 5042002,
    expectedChainId: 5042002,
    laneAsset: "arc-testnet-usdc",
    sessionWallet: AGENT_CHECKSUM,
    expectedOwner: OWNER,
    amountBaseUnits: 5_000_000_000_000_000n,
    merchantId: "coffee-demo",
    merchantAllowed: true,
    merchantActive: true,
    poolBalance: 985_000_000_000_000_000n,
    deadlineSeconds: BigInt(NOW + 900),
    nowSeconds: NOW,
    ...overrides,
  });
}

describe("evaluatePaymentEligibility", () => {
  it("passes every check for a funded, active card and identifies the agent", () => {
    const result = eligibility();
    expect(result.ok).toBe(true);
    expect(result.callerIsAgent).toBe(true);
    expect(result.availableBaseUnits).toBe(100_000_000_000_000_000n);
  });

  it("fails closed when no chain card was read", () => {
    const result = eligibility({ card: null });
    expect(result.ok).toBe(false);
    expect(checkById(result.checks, "card-exists").ok).toBe(false);
    expect(result.callerIsAgent).toBe(false);
  });

  it("blocks an expired card and an expired credit", () => {
    const expired = eligibility({ card: card({ expiresAt: BigInt(NOW - 1) }) });
    expect(checkById(expired.checks, "card-not-expired").ok).toBe(false);
    const creditExpired = eligibility({ card: card({ verifiedCreditExpiry: BigInt(NOW - 1) }) });
    expect(checkById(creditExpired.checks, "credit-unexpired").ok).toBe(false);
    expect(creditExpired.availableBaseUnits).toBe(0n);
  });

  it("enforces the per-transaction limit and the cumulative limit", () => {
    const overTx = eligibility({ amountBaseUnits: 20_000_000_000_000_000n });
    expect(checkById(overTx.checks, "per-transaction-limit").ok).toBe(false);
    const overCumulative = eligibility({
      card: card({ spent: 95_000_000_000_000_000n }),
      amountBaseUnits: 10_000_000_000_000_000n,
    });
    expect(checkById(overCumulative.checks, "per-transaction-limit").ok).toBe(true);
    expect(checkById(overCumulative.checks, "cumulative-limit").ok).toBe(false);
  });

  it("blocks an unknown or inactive merchant and a thin pool", () => {
    expect(checkById(eligibility({ merchantAllowed: false }).checks, "merchant-allowlisted").ok).toBe(false);
    expect(checkById(eligibility({ merchantActive: false }).checks, "merchant-active").ok).toBe(false);
    expect(checkById(eligibility({ poolBalance: 1n }).checks, "pool-balance").ok).toBe(false);
    expect(checkById(eligibility({ poolBalance: null }).checks, "pool-balance").ok).toBe(false);
  });

  it("blocks a caller who is not the card's agent", () => {
    const result = eligibility({ sessionWallet: OWNER });
    expect(result.callerIsAgent).toBe(false);
    expect(result.ok).toBe(false);
    expect(checkById(result.checks, "caller-authorized").ok).toBe(false);
  });

  it("blocks a card owned by somebody else and the wrong chain", () => {
    expect(checkById(eligibility({ expectedOwner: AGENT }).checks, "owner-scope").ok).toBe(false);
    expect(checkById(eligibility({ chainId: 1 }).checks, "chain-id").ok).toBe(false);
    expect(
      checkById(eligibility({ expectedController: AGENT }).checks, "controller-address").ok,
    ).toBe(false);
  });

  it("requires the deployed native asset and a positive amount", () => {
    expect(checkById(eligibility({ card: card({ asset: AGENT }) }).checks, "asset-supported").ok).toBe(false);
    expect(checkById(eligibility({ amountBaseUnits: 0n }).checks, "amount-positive").ok).toBe(false);
  });

  it("derives the effective limit as min(cap, credit)", () => {
    const limited = card({ ownerConfiguredCap: 20n, verifiedCredit: 100n });
    expect(effectiveLimit(limited)).toBe(20n);
    expect(availableCredit(limited, NOW)).toBe(20n);
    expect(availableCredit(card({ spent: 150_000_000_000_000_000n }), NOW)).toBe(0n);
  });
});
