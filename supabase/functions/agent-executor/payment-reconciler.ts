/**
 * Timeout/nonce-reconcile policy (S5): on broadcast timeout, call
 * `findByNonce` + receipt lookup by stored `txHash` before any retry. If
 * neither proves the outcome, return PAYMENT_RECONCILIATION_REQUIRED and
 * never submit a second transaction. `settled` only on `receipt.status==1`
 * (never-settled-on-uncertain).
 */
import type { PaymentClient, ReceiptResult } from "./chain-client.ts";

export type ReconcileOutcome =
  | { proven: true; receipt: ReceiptResult }
  | { proven: false };

export async function reconcileAfterTimeout(input: {
  client: PaymentClient;
  cardId: string;
  nonce: string;
  txHash: string;
  lookupReceipt?: (txHash: string) => Promise<ReceiptResult | null>;
}): Promise<ReconcileOutcome> {
  const byNonce = await input.client.findByNonce(input.cardId, input.nonce);
  if (byNonce !== null && byNonce.txHash === input.txHash) {
    return { proven: true, receipt: byNonce };
  }
  if (input.lookupReceipt !== undefined) {
    const byHash = await input.lookupReceipt(input.txHash);
    if (byHash !== null) {
      return { proven: true, receipt: byHash };
    }
  }
  return { proven: false };
}
