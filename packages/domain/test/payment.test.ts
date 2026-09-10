import { describe, expect, it } from "vitest";
import {
  PAYMENT_STATUSES,
  classifyReceipt,
  isSettledReceipt,
  paymentCodeForStatus,
} from "../src/payment.js";

describe("payment state machine (C-DDL)", () => {
  it("exposes pending/settled/declined/failed", () => {
    expect([...PAYMENT_STATUSES]).toEqual(["pending", "settled", "declined", "failed"]);
  });

  it("settles only on receipt.status==1, never on uncertain", () => {
    expect(classifyReceipt({ status: 1, txHash: "0xabc" })).toBe("settled");
    expect(classifyReceipt({ status: 0, txHash: "0xabc" })).toBe("failed");
    expect(isSettledReceipt({ status: 1, txHash: "0xabc" })).toBe(true);
    expect(isSettledReceipt({ status: 0, txHash: "0xabc" })).toBe(false);
    expect(isSettledReceipt(null)).toBe(false);
    expect(isSettledReceipt(undefined)).toBe(false);
  });

  it("maps statuses to stable API codes", () => {
    expect(paymentCodeForStatus("settled")).toBe("settled");
    expect(paymentCodeForStatus("failed")).toBe("PAYMENT_FAILED");
    expect(paymentCodeForStatus("pending")).toBe("PAYMENT_BROADCAST_TIMEOUT");
    expect(paymentCodeForStatus("declined")).toBe("PREFLIGHT_DECLINED");
  });
});
