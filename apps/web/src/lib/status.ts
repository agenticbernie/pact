/**
 * Display truth for the console.
 *
 * The read API owns settlement truth (Phase 05, AC-14): a payment is `settled`
 * only when a confirmed receipt AND a matching indexed `PaymentSettled` event
 * are both present. This module never invents a state; it maps the API's answer
 * onto a label and tone, and keeps a guard so a payload that claims `settled`
 * without both signals is shown as `uncertain` instead.
 */

export const TRUTH_STATUSES = ["pending", "declined", "failed", "settled", "uncertain"] as const;

export type TruthStatus = (typeof TRUTH_STATUSES)[number];

/** Status colour family, mapped to Astryx StatusDot / Token variants at render time. */
export type StatusTone = "success" | "warning" | "error" | "neutral" | "accent";

export type PaymentTruthInput = {
  status?: string;
  receiptConfirmed?: boolean;
  indexedPaymentEvent?: boolean;
  reasonCode?: string;
};

export type PaymentState = {
  status: TruthStatus;
  label: string;
  tone: StatusTone;
  detail: string;
};

const PAYMENT_COPY: Record<TruthStatus, { label: string; tone: StatusTone; detail: string }> = {
  settled: {
    label: "Settled",
    tone: "success",
    detail: "Confirmed on-chain receipt and a matching indexed PaymentSettled event.",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    detail: "No chain outcome yet: the payment is neither confirmed nor refused.",
  },
  declined: {
    label: "Declined",
    tone: "neutral",
    detail: "The card policy blocked this attempt before any transaction was sent.",
  },
  failed: {
    label: "Failed",
    tone: "error",
    detail: "The transaction reverted on-chain. No value moved.",
  },
  uncertain: {
    label: "Uncertain",
    tone: "accent",
    detail: "The receipt and the indexed event disagree. Reconcile before trusting either.",
  },
};

function isTruthStatus(value: string | undefined): value is TruthStatus {
  return TRUTH_STATUSES.some((candidate) => candidate === value);
}

/** Two-signal guard: `settled` is unreachable without both chain signals. */
export function hasSettlementEvidence(input: PaymentTruthInput): boolean {
  return input.receiptConfirmed === true && input.indexedPaymentEvent === true;
}

export function paymentState(input: PaymentTruthInput): PaymentState {
  let status: TruthStatus = isTruthStatus(input.status) ? input.status : "uncertain";
  if (status === "settled" && !hasSettlementEvidence(input)) {
    status = "uncertain";
  }
  const copy = PAYMENT_COPY[status];
  return {
    status,
    label: copy.label,
    tone: copy.tone,
    detail: input.reasonCode === undefined ? copy.detail : `${copy.detail} Reason: ${input.reasonCode}.`,
  };
}

export type CardState = { label: string; tone: StatusTone };

/** Card lifecycle as reported by the read model (never inferred from payments). */
export function cardState(status: string): CardState {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return { label: "Active", tone: "success" };
    case "SUSPENDED":
      return { label: "Suspended", tone: "error" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
    case "":
      return { label: "Unknown", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}
