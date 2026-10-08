import { describe, expect, it } from "vitest";
import { RECEIPT_TRUTH_STATUSES, deriveReceiptTruth } from "../src/read-model.js";

describe("Phase 05 receipt truth (AC-14)", () => {
  it("exposes pending/declined/failed/settled/uncertain", () => {
    expect([...RECEIPT_TRUTH_STATUSES]).toEqual([
      "pending",
      "declined",
      "failed",
      "settled",
      "uncertain",
    ]);
  });

  it("settles only when receipt_confirmed AND indexed event are both true", () => {
    const truth = deriveReceiptTruth({
      receiptStatus: 1,
      indexedPaymentEvent: true,
      latestIndexedBlock: 66170486,
      txHash: "0xabc",
      explorerUrl: "https://explorer.testnet.arc.io/tx/0xabc",
    });
    expect(truth.status).toBe("settled");
    expect(truth.receiptConfirmed).toBe(true);
    expect(truth.indexedPaymentEvent).toBe(true);
    expect(truth.reasonCode).toBeUndefined();
  });

  it("never settles a successful receipt without the indexed event", () => {
    const truth = deriveReceiptTruth({
      receiptStatus: 1,
      indexedPaymentEvent: false,
      latestIndexedBlock: 66170486,
    });
    expect(truth.status).toBe("uncertain");
    expect(truth.receiptConfirmed).toBe(true);
    expect(truth.reasonCode).toBe("PAYMENT_EVENT_NOT_INDEXED");
  });

  it("never settles an indexed event without a confirmed receipt", () => {
    const truth = deriveReceiptTruth({
      receiptStatus: null,
      indexedPaymentEvent: true,
      latestIndexedBlock: 66170486,
    });
    expect(truth.status).toBe("uncertain");
    expect(truth.reasonCode).toBe("RECEIPT_UNCONFIRMED");
  });

  it("fails a reverted receipt", () => {
    const truth = deriveReceiptTruth({
      receiptStatus: 0,
      indexedPaymentEvent: false,
      latestIndexedBlock: 66170486,
    });
    expect(truth.status).toBe("failed");
    expect(truth.receiptConfirmed).toBe(false);
    expect(truth.reasonCode).toBe("RECEIPT_REVERTED");
  });

  it("stays pending when nothing is observed yet", () => {
    const truth = deriveReceiptTruth({
      receiptStatus: null,
      indexedPaymentEvent: false,
      latestIndexedBlock: 66170486,
    });
    expect(truth.status).toBe("pending");
    expect(truth.reasonCode).toBe("PAYMENT_NOT_BROADCAST");
  });
});
