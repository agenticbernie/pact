import { describeReasonCode } from "./reason-codes";
import { paymentState, type StatusTone } from "./status";

/**
 * Lifecycle of ONE intent, derived from its persisted expiry plus the attempts
 * the read API reports for it — never from a client-side guess, and never from
 * the application row alone (settlement is the chain's answer).
 *
 * `pending` covers a broadcast attempt whose outcome is not proven yet: it is a
 * state to reconcile, not a state to retry from a new attempt.
 */
export type IntentLifecycle = "ready" | "expired" | "pending" | "declined" | "failed" | "settled";

export type IntentState = {
  status: IntentLifecycle;
  label: string;
  tone: StatusTone;
  detail: string;
};

const COPY: Record<IntentLifecycle, { label: string; tone: StatusTone; detail: string }> = {
  ready: {
    label: "Ready",
    tone: "accent",
    detail: "No attempt yet. The agent lane can preflight and settle this intent.",
  },
  expired: {
    label: "Expired",
    tone: "neutral",
    detail: "The intent expired without an attempt. Nothing on chain can settle it.",
  },
  pending: {
    label: "Pending",
    tone: "warning",
    detail:
      "An attempt exists without a proven chain outcome. Refresh to reconcile it — the same attempt is never resubmitted.",
  },
  declined: {
    label: "Declined",
    tone: "neutral",
    detail: "The card policy declined this intent before any transaction was sent.",
  },
  failed: {
    label: "Failed",
    tone: "error",
    detail: "The settlement transaction reverted on chain. No value moved.",
  },
  settled: {
    label: "Settled",
    tone: "success",
    detail: "The controller settled this intent: a confirmed receipt and the indexed event agree.",
  },
};

export type IntentStateInput = {
  expiresAt: string;
  payments: readonly {
    status?: string;
    receiptConfirmed?: boolean;
    indexedPaymentEvent?: boolean;
    reasonCode?: string;
  }[];
  now?: number;
};

/**
 * An attempt's chain-derived state as an intent lifecycle. `uncertain` (receipt
 * and indexed event disagree) is deliberately NOT a settled state: it is an
 * attempt to reconcile, so it reads as pending here.
 */
const LIFECYCLE_OF_ATTEMPT: Record<string, IntentLifecycle> = {
  settled: "settled",
  failed: "failed",
  declined: "declined",
  pending: "pending",
  uncertain: "pending",
};

export function intentState(input: IntentStateInput): IntentState {
  const now = input.now ?? Date.now();
  const attempts = input.payments.map((payment) => paymentState(payment));

  // Settlement truth first: a proven outcome outranks any other attempt.
  for (const lifecycle of ["settled", "failed", "declined", "pending"] as const) {
    const attempt = attempts.find((candidate) => LIFECYCLE_OF_ATTEMPT[candidate.status] === lifecycle);
    if (attempt === undefined) continue;
    const copy = COPY[lifecycle];
    // A pending attempt's own copy says nothing about how to proceed; the
    // intent-level detail does (reconcile it, never resubmit it as new).
    const detail = lifecycle === "pending" ? copy.detail : attempt.detail;
    return { status: lifecycle, label: copy.label, tone: copy.tone, detail };
  }

  const expiresAtMs = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    return { status: "expired", ...COPY.expired };
  }
  return { status: "ready", ...COPY.ready };
}

/** Reason sentence for an intent's most recent attempt, when it has one. */
export function intentReason(input: IntentStateInput): string | undefined {
  for (const payment of input.payments) {
    if (payment.reasonCode === undefined) continue;
    return describeReasonCode(payment.reasonCode) ?? `Reported reason: ${payment.reasonCode}.`;
  }
  return undefined;
}

/**
 * The idempotency key an operator may submit with — and the reason a retry can
 * never settle twice: an attempt's `paymentId` IS its idempotency key, and the
 * on-chain nonce is derived from it, so reusing it replays the stored attempt
 * instead of creating a second one. Only an intent with no attempt at all gets
 * the deterministic key derived from its id.
 */
export function settlementKeyForIntent(
  intentId: string,
  payments: readonly { paymentId: string }[],
): string {
  const existing = payments[0]?.paymentId;
  return existing === undefined || existing === "" ? `pay-${intentId}` : existing;
}
