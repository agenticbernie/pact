import { describe, expect, it } from "vitest";
import { intentReason, intentState, settlementKeyForIntent } from "./intent-state";

const NOW = Date.parse("2026-10-09T07:30:00Z");
const LATER = "2026-10-09T07:45:00Z";
const EARLIER = "2026-10-09T07:15:00Z";

function attempt(overrides: Record<string, unknown> = {}) {
  return { status: "pending", receiptConfirmed: false, indexedPaymentEvent: false, ...overrides };
}

describe("intent lifecycle", () => {
  it("is ready while no attempt exists and the intent has not expired", () => {
    expect(intentState({ expiresAt: LATER, payments: [], now: NOW }).status).toBe("ready");
  });

  it("is expired when the deadline passed without an attempt", () => {
    const state = intentState({ expiresAt: EARLIER, payments: [], now: NOW });
    expect(state.status).toBe("expired");
    expect(state.tone).toBe("neutral");
  });

  it("reports the proven chain outcome of an attempt", () => {
    const settled = intentState({
      expiresAt: EARLIER,
      payments: [attempt({ status: "settled", receiptConfirmed: true, indexedPaymentEvent: true })],
      now: NOW,
    });
    expect(settled.status).toBe("settled");
    expect(settled.tone).toBe("success");

    const failed = intentState({
      expiresAt: LATER,
      payments: [attempt({ status: "failed" })],
      now: NOW,
    });
    expect(failed.status).toBe("failed");

    const declined = intentState({
      expiresAt: LATER,
      payments: [attempt({ status: "declined" })],
      now: NOW,
    });
    expect(declined.status).toBe("declined");
  });

  it("keeps an unproven attempt pending, never ready to retry as new", () => {
    const state = intentState({ expiresAt: LATER, payments: [attempt()], now: NOW });
    expect(state.status).toBe("pending");
    expect(state.detail).toContain("never resubmitted");
  });

  it("prefers a proven settlement over any other attempt", () => {
    const state = intentState({
      expiresAt: LATER,
      payments: [attempt(), attempt({ status: "settled", receiptConfirmed: true, indexedPaymentEvent: true })],
      now: NOW,
    });
    expect(state.status).toBe("settled");
  });

  it("guards a claimed settlement without both chain signals", () => {
    // The status guard in lib/status downgrades this to `uncertain`, which is
    // an attempt to reconcile — never a settled intent.
    const state = intentState({
      expiresAt: LATER,
      payments: [attempt({ status: "settled", receiptConfirmed: true })],
      now: NOW,
    });
    expect(state.status).toBe("pending");
  });

  it("reuses an existing attempt's key so a retry cannot settle twice", () => {
    expect(settlementKeyForIntent("intent-req-1", [{ paymentId: "pay-intent-req-1" }])).toBe("pay-intent-req-1");
    expect(settlementKeyForIntent("intent-req-1", [])).toBe("pay-intent-req-1");
    expect(settlementKeyForIntent("intent-req-1", [{ paymentId: "" }])).toBe("pay-intent-req-1");
  });

  it("translates an attempt's reason code into an action", () => {
    expect(intentReason({ expiresAt: LATER, payments: [attempt({ reasonCode: "CREDIT_EXCEEDED" })] })).toContain(
      "credit",
    );
    expect(intentReason({ expiresAt: LATER, payments: [attempt()] })).toBeUndefined();
  });
});
