import { describe, expect, it } from "vitest";
import { parseAgentIntent } from "../src/schemas.js";
import type { CanonicalIntentInput } from "../src/types.js";
import { canonicalIntentHash, merchantIdToBytes32 } from "../src/canonical-hash.js";

// Arc H1/H2 lane fixtures: on-chain card 1 provenance (chain, controller,
// creation event, amounts) with a single-operator lane wallet. The real
// card 1 has owner != agent; that shape is covered by the owner-mismatch
// characterization test in arc-lane-composition.vitest.test.ts.
export const ARC_CHAIN_ID = 5042002;
export const ARC_ASSET = "arc-testnet-usdc";
export const ARC_CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
export const ARC_CARD_ID = "1";
export const ARC_AGENT = "0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682";
export const ARC_MERCHANT = "arc-demo-merchant";
export const ARC_AMOUNT = "10000000000000000";
export const ARC_EXPIRES_AT = "2027-09-19T00:00:00.000Z";
export const ARC_POLICY_VERSION = 1;

function arcIntent(overrides: Record<string, unknown> = {}) {
  return {
    intentId: "intent-arc-1",
    agentId: ARC_AGENT,
    cardId: ARC_CARD_ID,
    merchantId: ARC_MERCHANT,
    amountBaseUnits: ARC_AMOUNT,
    asset: ARC_ASSET,
    purpose: "arc lane readiness probe",
    confidence: 0.9,
    provider: "openai",
    model: "gpt-5.6-luna",
    createdAt: "2026-09-19T00:00:00.000Z",
    expiresAt: ARC_EXPIRES_AT,
    policyVersion: ARC_POLICY_VERSION,
    intentHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ...overrides,
  };
}

describe("Arc H1/H2 lane domain compatibility (RED-first)", () => {
  it("accepts the Arc lane asset in AgentIntent parsing", () => {
    expect(() => parseAgentIntent(arcIntent())).not.toThrow();
    expect(parseAgentIntent(arcIntent()).asset).toBe(ARC_ASSET);
  });

  it("keeps accepting the legacy CTC asset (history preserved)", () => {
    expect(() =>
      parseAgentIntent({ ...arcIntent(), asset: "native-testnet-ctc" }),
    ).not.toThrow();
  });

  it("rejects an unknown asset in AgentIntent parsing", () => {
    expect(() => parseAgentIntent({ ...arcIntent(), asset: "usdc" })).toThrow();
  });

  it("hashes Arc lane metadata to a stable canonical hash", () => {
    const input: CanonicalIntentInput = {
      cardId: ARC_CARD_ID,
      agentId: ARC_AGENT,
      merchantId: ARC_MERCHANT,
      amountBaseUnits: ARC_AMOUNT,
      asset: ARC_ASSET,
      purpose: "arc lane readiness probe",
      expiresAt: ARC_EXPIRES_AT,
      policyVersion: ARC_POLICY_VERSION,
    };
    const first = canonicalIntentHash(input);
    expect(first).toMatch(/^0x[0-9a-f]{64}$/);
    expect(canonicalIntentHash(input)).toBe(first);
  });

  it("exposes the Arc lane module with chain/asset/binding constants", async () => {
    const lane = (await import("../src/arc-lane.js")) as Record<string, unknown>;
    expect(lane["ARC_LANE_CHAIN_ID"]).toBe(5042002);
    expect(lane["ARC_LANE_ASSET_ID"]).toBe("arc-testnet-usdc");
    expect(lane["ARC_LANE_CONTROLLER"]).toBe(ARC_CONTROLLER);
    expect(
      (lane["isLaneAssetPair"] as (c: number, a: string) => boolean)(
        5042002,
        "arc-testnet-usdc",
      ),
    ).toBe(true);
    expect(
      (lane["isLaneAssetPair"] as (c: number, a: string) => boolean)(
        5042002,
        "native-testnet-ctc",
      ),
    ).toBe(false);
    expect(
      (lane["isLaneAssetPair"] as (c: number, a: string) => boolean)(
        102031,
        "arc-testnet-usdc",
      ),
    ).toBe(false);
    expect(
      (lane["laneForChainId"] as (c: number) => string)(5042002),
    ).toBe("arc");
    expect(
      (lane["laneForChainId"] as (c: number) => string)(102031),
    ).toBe("creditcoin");
    expect(() =>
      (lane["laneForChainId"] as (c: number) => string)(1),
    ).toThrow();
    expect(() =>
      (lane["assertArcLaneBinding"] as (i: unknown) => void)({
        chainId: 5042002,
        asset: "arc-testnet-usdc",
        controller: ARC_CONTROLLER,
      }),
    ).not.toThrow();
    expect(() =>
      (lane["assertArcLaneBinding"] as (i: unknown) => void)({
        chainId: 5042002,
        asset: "native-testnet-ctc",
      }),
    ).toThrow();
  });

  it("derives a deterministic allowlist-shaped hash for the Arc fixture merchant", () => {
    expect(merchantIdToBytes32(ARC_MERCHANT)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
