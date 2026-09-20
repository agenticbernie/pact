/**
 * Arc verified-credit operating policy (procedural bounds, local-only).
 *
 * These checks validate the approved first-test operating policy. They are
 * procedural controls, not on-chain enforcement: the deployed controller does
 * not know the 0.1 USDC cap, the 0.01 USDC first-test payment, or the
 * 20-minute expiry bound. Every live mutation must still pass operator
 * approval and read-only preflight before broadcast.
 */

export const ARC_CREDIT_AMOUNT_CAP_BASE_UNITS = 100000000000000000n;
export const ARC_FIRST_TEST_PAYMENT_AMOUNT_BASE_UNITS = 10000000000000000n;
export const ARC_CREDIT_EXPIRY_DURATION_SECONDS = 1200;
export const ARC_CREDIT_DECIMALS = 18;

export type PolicyCheck = { ok: true } | { ok: false; reason: string };

export type RoleSet = {
  owner: string;
  authority: string;
  agent: string;
};

export type LiveReadiness = {
  poolBalance: bigint | null;
  paymentAmount: bigint;
  readsComplete: boolean;
  identitiesKnown: boolean;
};

const EVIDENCE_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ZERO_EVIDENCE_ID = `0x${"0".repeat(64)}`;

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function checkCreditAmount(amount: bigint): PolicyCheck {
  if (amount <= 0n) return { ok: false, reason: "credit-amount-zero" };
  if (amount > ARC_CREDIT_AMOUNT_CAP_BASE_UNITS) {
    return { ok: false, reason: "credit-amount-over-cap" };
  }
  return { ok: true };
}

export function checkFirstTestPaymentAmount(amount: bigint): PolicyCheck {
  if (amount <= 0n) return { ok: false, reason: "payment-amount-zero" };
  if (amount > ARC_FIRST_TEST_PAYMENT_AMOUNT_BASE_UNITS) {
    return { ok: false, reason: "payment-amount-over-first-test-policy" };
  }
  return { ok: true };
}

export function checkCreditExpiryDuration(durationSeconds: number): PolicyCheck {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, reason: "credit-expiry-not-positive" };
  }
  if (durationSeconds > ARC_CREDIT_EXPIRY_DURATION_SECONDS) {
    return { ok: false, reason: "credit-expiry-over-bound" };
  }
  return { ok: true };
}

export function checkEvidenceFreshness(
  evidenceId: string,
  usedEvidenceIds: readonly string[],
): PolicyCheck {
  if (!EVIDENCE_ID_PATTERN.test(evidenceId)) {
    return { ok: false, reason: "evidence-id-malformed" };
  }
  if (evidenceId.toLowerCase() === ZERO_EVIDENCE_ID) {
    return { ok: false, reason: "evidence-id-zero" };
  }
  if (usedEvidenceIds.some((used) => sameAddress(used, evidenceId))) {
    return { ok: false, reason: "evidence-id-reused" };
  }
  return { ok: true };
}

export function checkRoleSeparation(roles: RoleSet): PolicyCheck {
  if (!isNonEmpty(roles.owner) || !isNonEmpty(roles.authority) || !isNonEmpty(roles.agent)) {
    return { ok: false, reason: "role-identity-missing" };
  }
  if (sameAddress(roles.authority, roles.owner)) {
    return { ok: false, reason: "authority-is-owner" };
  }
  if (sameAddress(roles.authority, roles.agent)) {
    return { ok: false, reason: "authority-is-agent" };
  }
  if (sameAddress(roles.agent, roles.owner)) {
    return { ok: false, reason: "agent-is-owner" };
  }
  return { ok: true };
}

export function checkLiveReadiness(input: LiveReadiness): PolicyCheck {
  if (!input.readsComplete) return { ok: false, reason: "reads-uncertain" };
  if (!input.identitiesKnown) return { ok: false, reason: "identities-unknown" };
  if (input.poolBalance === null) return { ok: false, reason: "pool-balance-unknown" };
  if (input.poolBalance < input.paymentAmount) {
    return { ok: false, reason: "pool-balance-insufficient" };
  }
  return { ok: true };
}
