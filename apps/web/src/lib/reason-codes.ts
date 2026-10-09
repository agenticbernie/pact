/**
 * The read API's refusal codes, in the operator's language.
 *
 * The executor answers a token-shaped `reasonCode` (the controller's own reason
 * when it has one), and a bare code on screen is not actionable. This maps the
 * codes the console can actually receive onto what they mean and what to do —
 * and returns nothing for a code it does not know, so an unknown token is shown
 * verbatim rather than explained wrongly.
 */
const REASON_COPY: Record<string, string> = {
  EXPIRED: "The intent expired before the agent submitted it. A payment needs a fresh intent.",
  POLICY_STALE:
    "The card's policy version moved on after this intent was created, so the intent is stale. Create a new intent.",
  CARD_NOT_ELIGIBLE:
    "The card, its assigned agent or the lane no longer matches, so settlement was refused before any transaction.",
  CREDIT_EXCEEDED: "The card's verified credit no longer covers this amount.",
  NONCE_USED:
    "This attempt's on-chain nonce was already used, so the same attempt can never settle twice.",
  PREFLIGHT_INPUT_INCOMPLETE:
    "The payment facts bound to this attempt are incomplete, so nothing was submitted.",
  PREFLIGHT_DECLINED: "The card policy declined the payment before any transaction was sent.",
  PAYMENT_RECONCILIATION_REQUIRED:
    "The broadcast outcome is unknown. Reconcile before retrying: a retry reuses this attempt's nonce, so it can never settle twice.",
  PAYMENT_EVENT_NOT_INDEXED:
    "The receipt is confirmed but the indexer has not decoded the settlement event yet. Refresh to reconcile.",
  RECEIPT_UNCONFIRMED:
    "The indexed event exists but no confirmed receipt was read yet. Refresh to reconcile.",
  PAYMENT_BROADCAST_TIMEOUT: "The node did not answer in time; the attempt is reconciled, never resent.",
  PAYMENT_FAILED: "The settlement transaction reverted on chain. No value moved.",
  DENIED: "The controller refused the preflight and its reason could not be decoded.",
};

export function describeReasonCode(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  return REASON_COPY[code];
}
