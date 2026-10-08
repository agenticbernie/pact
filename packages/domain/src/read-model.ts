/**
 * Phase 05 receipt truth (AC-14 consumer).
 *
 * Two-signal rule: a payment is `settled` ONLY when BOTH a successful,
 * confirmed receipt AND a matching indexed PaymentSettled event are present.
 * A client response, a database row, or an executor status can never on their
 * own produce `settled` (never-settled-on-uncertain).
 *
 * Pure module, no I/O: the read API supplies the two signals and the indexer
 * supplies `latestIndexedBlock`.
 */

export const RECEIPT_TRUTH_STATUSES = [
  "pending",
  "declined",
  "failed",
  "settled",
  "uncertain",
] as const;

export type ReceiptTruthStatus = (typeof RECEIPT_TRUTH_STATUSES)[number];

export type ReceiptTruth = {
  status: ReceiptTruthStatus;
  receiptConfirmed: boolean;
  indexedPaymentEvent: boolean;
  latestIndexedBlock: number;
  txHash?: string;
  explorerUrl?: string;
  reasonCode?: string;
};

/**
 * Derive display truth from the two chain signals plus the index freshness.
 *
 * - receipt 1 + indexed event      -> settled
 * - receipt 1 + no indexed event   -> uncertain (indexer lag; never settled)
 * - receipt 0                      -> failed
 * - no receipt + indexed event     -> uncertain (receipt not confirmed)
 * - no receipt + no event          -> pending (broadcast outcome unknown)
 *
 * `declined` is not reachable here: it is a preflight decision the caller
 * applies from the attempt record.
 */
export function deriveReceiptTruth(input: {
  receiptStatus: 0 | 1 | null;
  indexedPaymentEvent: boolean;
  latestIndexedBlock: number;
  txHash?: string;
  explorerUrl?: string;
}): ReceiptTruth {
  const base = {
    receiptConfirmed: input.receiptStatus === 1,
    indexedPaymentEvent: input.indexedPaymentEvent,
    latestIndexedBlock: input.latestIndexedBlock,
    ...(input.txHash === undefined ? {} : { txHash: input.txHash }),
    ...(input.explorerUrl === undefined ? {} : { explorerUrl: input.explorerUrl }),
  };

  if (input.receiptStatus === 0) {
    return { ...base, status: "failed", reasonCode: "RECEIPT_REVERTED" };
  }
  if (input.receiptStatus === 1) {
    if (input.indexedPaymentEvent) {
      return { ...base, status: "settled" };
    }
    return { ...base, status: "uncertain", reasonCode: "PAYMENT_EVENT_NOT_INDEXED" };
  }
  if (input.indexedPaymentEvent) {
    return { ...base, status: "uncertain", reasonCode: "RECEIPT_UNCONFIRMED" };
  }
  return { ...base, status: "pending", reasonCode: "PAYMENT_NOT_BROADCAST" };
}
