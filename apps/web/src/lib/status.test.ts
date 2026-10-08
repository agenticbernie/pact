import { describe, expect, it } from "vitest";
import { cardState, hasSettlementEvidence, paymentState } from "./status";

describe("paymentState", () => {
  it("reports settled only when both chain signals are present", () => {
    const state = paymentState({
      status: "settled",
      receiptConfirmed: true,
      indexedPaymentEvent: true,
    });
    expect(state.status).toBe("settled");
    expect(state.label).toBe("Settled");
    expect(state.tone).toBe("success");
  });

  it("downgrades a settled claim that lacks the indexed event", () => {
    const state = paymentState({ status: "settled", receiptConfirmed: true, indexedPaymentEvent: false });
    expect(state.status).toBe("uncertain");
    expect(state.label).toBe("Uncertain");
  });

  it("downgrades a settled claim that lacks a confirmed receipt", () => {
    const state = paymentState({ status: "settled", receiptConfirmed: false, indexedPaymentEvent: true });
    expect(state.status).toBe("uncertain");
  });

  it("keeps declined distinct from failed", () => {
    const declined = paymentState({ status: "declined", reasonCode: "PREFLIGHT_DECLINED" });
    const failed = paymentState({ status: "failed", reasonCode: "RECEIPT_REVERTED" });
    expect(declined.status).toBe("declined");
    expect(declined.detail).toContain("PREFLIGHT_DECLINED");
    expect(failed.status).toBe("failed");
    expect(failed.tone).toBe("error");
  });

  it("reports pending while no chain outcome exists", () => {
    expect(paymentState({ status: "pending" }).status).toBe("pending");
  });

  it("falls back to uncertain for an unrecognised status", () => {
    expect(paymentState({ status: "mystery" }).status).toBe("uncertain");
  });
});

describe("hasSettlementEvidence", () => {
  it("requires both signals", () => {
    expect(hasSettlementEvidence({ receiptConfirmed: true, indexedPaymentEvent: true })).toBe(true);
    expect(hasSettlementEvidence({ receiptConfirmed: true })).toBe(false);
    expect(hasSettlementEvidence({ indexedPaymentEvent: true })).toBe(false);
    expect(hasSettlementEvidence({})).toBe(false);
  });
});

describe("cardState", () => {
  it("labels the known lifecycle states", () => {
    expect(cardState("ACTIVE")).toEqual({ label: "Active", tone: "success" });
    expect(cardState("SUSPENDED")).toEqual({ label: "Suspended", tone: "error" });
    expect(cardState("EXPIRED")).toEqual({ label: "Expired", tone: "neutral" });
  });

  it("never invents a label for an unknown state", () => {
    expect(cardState("")).toEqual({ label: "Unknown", tone: "neutral" });
    expect(cardState("FROZEN")).toEqual({ label: "FROZEN", tone: "neutral" });
  });
});
