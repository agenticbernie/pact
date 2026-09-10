/**
 * Payment status machine (C-DDL consumer).
 *
 * `settled` is reachable ONLY on `receipt.status == 1`
 * (never-settled-on-uncertain). Null/unknown receipts never settle.
 */

export const PAYMENT_STATUSES = ["pending", "settled", "declined", "failed"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type ReceiptResult = {
  status: 0 | 1;
  txHash: string;
  blockNumber?: number;
};

export function classifyReceipt(receipt: { status: number; txHash: string }): PaymentStatus {
  if (receipt.status === 1) {
    return "settled";
  }
  return "failed";
}

/** Settled only on receipt.status == 1; null/undefined/0 never settle. */
export function isSettledReceipt(receipt: unknown): boolean {
  if (typeof receipt !== "object" || receipt === null) {
    return false;
  }
  const record = receipt as Record<string, unknown>;
  return record["status"] === 1;
}

export function paymentCodeForStatus(status: PaymentStatus): string {
  switch (status) {
    case "settled":
      return "settled";
    case "failed":
      return "PAYMENT_FAILED";
    case "pending":
      return "PAYMENT_BROADCAST_TIMEOUT";
    case "declined":
      return "PREFLIGHT_DECLINED";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
