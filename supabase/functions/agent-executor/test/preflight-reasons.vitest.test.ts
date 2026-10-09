import { describe, expect, it } from "vitest";
import { handlePreflight } from "../index.ts";
import type { ExecutorDeps } from "../index.ts";
import { createInMemoryIntentResolver, type StoredIntent } from "../execute-composition.ts";
import type { AttemptStore } from "../attempt-store.ts";

const CHAIN = 5042002;
const AGENT = "0x1111111111111111111111111111111111111111";

function stored(overrides: Partial<StoredIntent> = {}): StoredIntent {
  return {
    intentId: "intent-1",
    agent: AGENT,
    cardId: "3",
    merchantId: "coffee-demo",
    amountBaseUnits: "100000000000000000",
    asset: "arc-testnet-usdc",
    policyVersion: 1,
    expiresAtMs: 2_000_000_000_000,
    ...overrides,
  };
}

/** `store`/`signerChainId` are unused by `handlePreflight`; the rest is real. */
function deps(input: {
  intent: StoredIntent | null;
  chainPolicyVersion?: number;
  preflight?: { ok: boolean; reasonCode?: string };
}): ExecutorDeps {
  return {
    store: {} as AttemptStore,
    client: {
      readCard: () =>
        Promise.resolve({
          cardId: "3",
          agent: AGENT,
          policyVersion: input.chainPolicyVersion ?? 1,
          chainId: CHAIN,
        }),
      preflight: () => Promise.resolve(input.preflight ?? { ok: true }),
      sendPayment: () => Promise.resolve({ txHash: "0xdead" }),
      waitForReceipt: () => Promise.resolve({ status: 1, txHash: "0xdead" }),
      findByNonce: () => Promise.resolve(null),
    },
    resolveIntent: createInMemoryIntentResolver(
      new Map(input.intent === null ? [] : [["intent-1", input.intent]]),
    ),
    expectedChainId: CHAIN,
    signerChainId: CHAIN,
    nowMs: 1_000_000_000_000,
  };
}

describe("handlePreflight reason codes", () => {
  it("names expiry rather than a generic refusal", async () => {
    const result = await handlePreflight(
      { intentId: "intent-1", requestId: "r" },
      deps({ intent: stored({ expiresAtMs: 999 }) }),
    );
    expect(result).toMatchObject({ decision: "declined", reasonCode: "EXPIRED" });
  });

  it("reports POLICY_STALE when the controller's policy version moved", async () => {
    const result = await handlePreflight(
      { intentId: "intent-1", requestId: "r" },
      deps({ intent: stored({ policyVersion: 0 }), chainPolicyVersion: 1 }),
    );
    expect(result).toMatchObject({ decision: "declined", reasonCode: "POLICY_STALE" });
  });

  it("surfaces the chain's own refusal (e.g. insufficient credit)", async () => {
    const result = await handlePreflight(
      { intentId: "intent-1", requestId: "r" },
      deps({ intent: stored(), preflight: { ok: false, reasonCode: "CREDIT_EXCEEDED" } }),
    );
    expect(result).toMatchObject({ decision: "declined", reasonCode: "CREDIT_EXCEEDED" });
  });

  it("falls back to the generic refusal for a non-token-shaped reason", async () => {
    const result = await handlePreflight(
      { intentId: "intent-1", requestId: "r" },
      deps({ intent: stored(), preflight: { ok: false, reasonCode: "<script>" } }),
    );
    expect(result).toMatchObject({ decision: "declined", reasonCode: "PREFLIGHT_DECLINED" });
  });

  it("still reports would_settle for an eligible intent", async () => {
    const result = await handlePreflight(
      { intentId: "intent-1", requestId: "r" },
      deps({ intent: stored() }),
    );
    expect(result).toMatchObject({ decision: "would_settle" });
  });
});
