/**
 * Card issuance and payment policy checks for the console.
 *
 * Every rule the dashboard applies before it asks a wallet to sign, or before
 * it offers a settlement action, is stated here as a pure function of facts the
 * caller already read. Nothing in this module talks to a chain, a wallet or the
 * API, so the same checks back the form validation and the pre-submission
 * eligibility summary, and they are unit-testable without a browser.
 *
 * Two rules govern what these checks may claim:
 * - They are advisory. The deployed controller enforces the real policy in
 *   `createCard` / `pay`, and the executor enforces role and nonce rules; a
 *   passing summary here never substitutes for a receipt.
 * - They never invent a fact. A read that did not happen leaves the check
 *   failed with an `unknown-*` reason rather than silently passing.
 *
 * The contract mirrors live in the repo, not in the bundle: `CardStatus` and the
 * preflight reason codes are transcribed from `contracts/src/PactTypes.sol`,
 * and the ABI fragments from `packages/pact-sdk/src/abi.ts`.
 */
import { getAddress } from "ethers";

/** `PactCardController.NATIVE_ASSET`: the logical id `arc-testnet-usdc` on chain. */
export const NATIVE_ASSET_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Logical asset id of the Arc lane's native settlement asset. */
export const ARC_LANE_ASSET_ID = "arc-testnet-usdc";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

/** `enum CardStatus` in `contracts/src/PactTypes.sol`, in declaration order. */
export const CARD_STATUS = ["Issued", "Active", "Suspended", "Closed"] as const;
export type CardStatusName = (typeof CARD_STATUS)[number];
export const ACTIVE_CARD_STATUS = 1;

export function cardStatusName(code: number): CardStatusName | "Unknown" {
  return CARD_STATUS[code] ?? "Unknown";
}

/* ------------------------------------------------------------------ *
 * Address and amount parsing
 * ------------------------------------------------------------------ */

export type AddressResult = { ok: true; address: string } | { ok: false; reason: string };

/**
 * Normalize a user-supplied agent address to EIP-55 checksum form.
 *
 * A malformed value (wrong length, non-hex, an all-zero address, or a mixed-case
 * checksum that does not verify) is rejected rather than repaired: silently
 * padding or truncating a 38-character address is exactly how a payment ends up
 * bound to the wrong agent.
 */
export function normalizeEvmAddress(value: string): AddressResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false, reason: "address-missing" };
  if (!ADDRESS_PATTERN.test(trimmed)) return { ok: false, reason: "address-malformed" };
  let address: string;
  try {
    address = getAddress(trimmed);
  } catch {
    return { ok: false, reason: "address-checksum-invalid" };
  }
  if (address.toLowerCase() === NATIVE_ASSET_ADDRESS) return { ok: false, reason: "address-zero" };
  return { ok: true, address };
}

export function sameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Exact decimal → base units. Returns null for anything not representable. */
export function parseBaseUnits(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;
  const [whole = "", fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  const paddedFraction = fraction.padEnd(decimals, "0");
  return BigInt(whole) * scale + (paddedFraction === "" ? 0n : BigInt(paddedFraction));
}

/* ------------------------------------------------------------------ *
 * Card issuance
 * ------------------------------------------------------------------ */

export type CardDraftField = "agent" | "ownerConfiguredCap" | "perTransactionLimit" | "expiresAt" | "merchants";

export type CardDraftIssue = { field: CardDraftField; reason: string };

export type CardDraft = {
  /** EIP-55 checksummed agent address. */
  agent: string;
  ownerConfiguredCap: bigint;
  perTransactionLimit: bigint;
  /** Unix seconds, the unit `createCard` takes. */
  expiresAtSeconds: bigint;
  /** Selected merchant ids, in catalog order. */
  merchants: string[];
};

export type CardDraftInput = {
  agent: string;
  ownerConfiguredCap: string;
  perTransactionLimit: string;
  /** `YYYY-MM-DDTHH:mm` from a date-time input. */
  expiresAt: string;
  merchants: readonly string[];
  /** Merchant ids the trusted catalog offers. */
  catalog: readonly string[];
  decimals: number;
  now?: Date;
};

export type CardDraftResult =
  | { ok: true; draft: CardDraft }
  | { ok: false; issues: CardDraftIssue[] };

/** Validate every field of the issuance form before any wallet prompt. */
export function validateCardDraft(input: CardDraftInput): CardDraftResult {
  const now = input.now ?? new Date();
  const issues: CardDraftIssue[] = [];

  const agent = normalizeEvmAddress(input.agent);
  if (!agent.ok) issues.push({ field: "agent", reason: agent.reason });

  const cap = parseBaseUnits(input.ownerConfiguredCap, input.decimals);
  if (cap === null) issues.push({ field: "ownerConfiguredCap", reason: "cap-not-a-number" });
  else if (cap <= 0n) issues.push({ field: "ownerConfiguredCap", reason: "cap-not-positive" });

  const perTransaction = parseBaseUnits(input.perTransactionLimit, input.decimals);
  if (perTransaction === null) {
    issues.push({ field: "perTransactionLimit", reason: "limit-not-a-number" });
  } else if (perTransaction <= 0n) {
    issues.push({ field: "perTransactionLimit", reason: "limit-not-positive" });
  } else if (cap !== null && perTransaction > cap) {
    // Mirrors the controller's own ordering rule: a single payment can never be
    // allowed to exceed the card-wide cap it is carved out of.
    issues.push({ field: "perTransactionLimit", reason: "limit-over-cap" });
  }

  let expiresAtSeconds: bigint | null = null;
  const expiry = new Date(input.expiresAt);
  if (input.expiresAt.trim() === "" || Number.isNaN(expiry.getTime())) {
    issues.push({ field: "expiresAt", reason: "expiry-missing" });
  } else {
    const seconds = BigInt(Math.floor(expiry.getTime() / 1000));
    if (seconds <= BigInt(Math.floor(now.getTime() / 1000))) {
      issues.push({ field: "expiresAt", reason: "expiry-not-future" });
    } else {
      expiresAtSeconds = seconds;
    }
  }

  const selected = input.catalog.filter((id) => input.merchants.includes(id));
  if (input.merchants.length === 0) {
    issues.push({ field: "merchants", reason: "merchants-empty" });
  } else if (selected.length !== input.merchants.length) {
    issues.push({ field: "merchants", reason: "merchants-unknown" });
  }

  // Any issue at all — including one the checks above could not express as a
  // null — fails closed. A partially valid draft is never returned.
  if (
    issues.length > 0 ||
    !agent.ok ||
    cap === null ||
    perTransaction === null ||
    expiresAtSeconds === null
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    draft: {
      agent: agent.address,
      ownerConfiguredCap: cap,
      perTransactionLimit: perTransaction,
      expiresAtSeconds,
      merchants: selected,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Pre-submission environment checks
 * ------------------------------------------------------------------ */

export type EnvironmentCheck = { ok: true } | { ok: false; reason: string };

/** The connected wallet must be on the chain the read API reports. */
export function checkWalletChain(actualChainId: number, expectedChainId: number): EnvironmentCheck {
  if (!Number.isInteger(actualChainId) || actualChainId <= 0) {
    return { ok: false, reason: "chain-unknown" };
  }
  if (actualChainId !== expectedChainId) return { ok: false, reason: "chain-mismatch" };
  return { ok: true };
}

/** The configured controller must actually carry bytecode before we encode a call. */
export function checkControllerDeployment(bytecode: string, expectedAddress: string): EnvironmentCheck {
  if (!ADDRESS_PATTERN.test(expectedAddress.trim())) {
    return { ok: false, reason: "controller-address-invalid" };
  }
  if (typeof bytecode !== "string" || bytecode === "" || bytecode === "0x" || bytecode === "0x0") {
    return { ok: false, reason: "controller-not-deployed" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Payment eligibility
 * ------------------------------------------------------------------ */

/** On-chain card snapshot, read through the deployed controller's `cards(id)`. */
export type ChainCardSnapshot = {
  owner: string;
  agent: string;
  asset: string;
  ownerConfiguredCap: bigint;
  verifiedCredit: bigint;
  verifiedCreditExpiry: bigint;
  spent: bigint;
  perTransactionLimit: bigint;
  expiresAt: bigint;
  status: number;
};

/** `min(ownerConfiguredCap, verifiedCredit)`: the controller's effective limit. */
export function effectiveLimit(card: ChainCardSnapshot): bigint {
  return card.ownerConfiguredCap < card.verifiedCredit ? card.ownerConfiguredCap : card.verifiedCredit;
}

/** The controller's `availableCredit`: zero once the card or the credit has expired. */
export function availableCredit(card: ChainCardSnapshot, nowSeconds: number): bigint {
  if (nowSeconds >= Number(card.expiresAt)) return 0n;
  if (nowSeconds >= Number(card.verifiedCreditExpiry)) return 0n;
  const limit = effectiveLimit(card);
  return limit > card.spent ? limit - card.spent : 0n;
}

export type PolicyCheck = { id: string; label: string; ok: boolean; detail: string };

export type PaymentEligibilityInput = {
  /** Null when the on-chain read did not happen; every chain check then fails. */
  card: ChainCardSnapshot | null;
  controller: string;
  expectedController: string;
  chainId: number;
  expectedChainId: number;
  laneAsset: string;
  /** The session wallet asking for the payment. */
  sessionWallet: string;
  /** Owner of the card as the read model reports it. */
  expectedOwner: string;
  amountBaseUnits: bigint;
  merchantId: string;
  merchantAllowed: boolean | null;
  merchantActive: boolean | null;
  poolBalance: bigint | null;
  /** Intent expiry, in unix seconds. */
  deadlineSeconds: bigint;
  nowSeconds: number;
};

export type PaymentEligibility = {
  ok: boolean;
  checks: PolicyCheck[];
  /** True when the session wallet is the card's assigned agent (the only caller `pay` accepts). */
  callerIsAgent: boolean;
  availableBaseUnits: bigint;
};

/**
 * The mandatory policy surface, evaluated in one place so the review screen and
 * the submit guard can never disagree. `ok` is true only when every check
 * passed; the contract still re-evaluates all of it when the agent settles.
 */
export function evaluatePaymentEligibility(input: PaymentEligibilityInput): PaymentEligibility {
  const checks: PolicyCheck[] = [];
  const card = input.card;
  const add = (id: string, label: string, ok: boolean, detail: string) => {
    checks.push({ id, label, ok, detail });
  };

  add(
    "chain-id",
    "Connected to the expected chain",
    checkWalletChain(input.chainId, input.expectedChainId).ok,
    input.chainId === input.expectedChainId
      ? `Chain ${input.expectedChainId}`
      : `Wallet reports chain ${input.chainId}, lane expects ${input.expectedChainId}`,
  );
  add(
    "controller-address",
    "Controller matches the trusted configuration",
    card !== null && sameAddress(input.controller, input.expectedController),
    card === null ? "No on-chain card read yet" : input.controller,
  );
  add(
    "card-exists",
    "Card exists on chain",
    card !== null,
    card === null ? "No on-chain card read yet" : `Read from ${input.expectedController}`,
  );
  add(
    "owner-scope",
    "Card belongs to the session owner",
    card !== null && sameAddress(card.owner, input.expectedOwner),
    card === null ? "Unknown" : card.owner,
  );
  const callerIsAgent = card !== null && sameAddress(card.agent, input.sessionWallet);
  add(
    "caller-authorized",
    "Caller is the card's assigned agent",
    callerIsAgent,
    card === null
      ? "Unknown"
      : callerIsAgent
        ? `${input.sessionWallet} is the assigned agent`
        : `Assigned agent is ${card.agent}; only that wallet may submit the settlement`,
  );
  add(
    "card-active",
    "Card is active",
    card !== null && card.status === ACTIVE_CARD_STATUS,
    card === null ? "Unknown" : `Status ${cardStatusName(card.status)}`,
  );
  add(
    "card-not-expired",
    "Card has not expired",
    card !== null && Number(card.expiresAt) > input.nowSeconds,
    card === null ? "Unknown" : `Expires at ${new Date(Number(card.expiresAt) * 1000).toISOString()}`,
  );
  add(
    "asset-supported",
    "Settlement asset matches the deployed asset",
    card !== null && sameAddress(card.asset, NATIVE_ASSET_ADDRESS) && input.laneAsset === ARC_LANE_ASSET_ID,
    card === null ? "Unknown" : `${input.laneAsset} → ${card.asset}`,
  );
  add(
    "credit-positive",
    "Verified credit is positive",
    card !== null && card.verifiedCredit > 0n,
    card === null ? "Unknown" : `${card.verifiedCredit} base units`,
  );
  add(
    "credit-unexpired",
    "Verified credit is unexpired",
    card !== null && Number(card.verifiedCreditExpiry) > input.nowSeconds,
    card === null
      ? "Unknown"
      : card.verifiedCreditExpiry === 0n
        ? "No credit has been applied to this card"
        : `Credit expires at ${new Date(Number(card.verifiedCreditExpiry) * 1000).toISOString()}`,
  );
  add(
    "amount-positive",
    "Amount is positive",
    input.amountBaseUnits > 0n,
    `${input.amountBaseUnits} base units`,
  );
  add(
    "per-transaction-limit",
    "Within the per-transaction limit",
    card !== null && input.amountBaseUnits <= card.perTransactionLimit,
    card === null ? "Unknown" : `Limit ${card.perTransactionLimit} base units`,
  );
  add(
    "cumulative-limit",
    "Cumulative spend stays inside the effective limit",
    card !== null && card.spent + input.amountBaseUnits <= effectiveLimit(card),
    card === null
      ? "Unknown"
      : `Spent ${card.spent} of ${effectiveLimit(card)} base units`,
  );
  add(
    "merchant-allowlisted",
    `Merchant ${input.merchantId} is on the card allowlist`,
    input.merchantAllowed === true,
    input.merchantAllowed === null ? "Allowlist read failed" : input.merchantAllowed ? "Allowed" : "Not on the card allowlist",
  );
  add(
    "merchant-active",
    "Merchant is active in the simulator",
    input.merchantActive === true,
    input.merchantActive === null ? "Merchant read failed" : input.merchantActive ? "Active" : "Inactive",
  );
  add(
    "pool-balance",
    "Credit pool can cover the payment",
    input.poolBalance !== null && input.poolBalance >= input.amountBaseUnits,
    input.poolBalance === null ? "Pool balance read failed" : `${input.poolBalance} base units available`,
  );
  add(
    "deadline",
    "Intent deadline is in the future",
    input.deadlineSeconds > BigInt(input.nowSeconds),
    input.deadlineSeconds === 0n
      ? "No intent yet"
      : new Date(Number(input.deadlineSeconds) * 1000).toISOString(),
  );

  const availableBaseUnits = card === null ? 0n : availableCredit(card, input.nowSeconds);
  return {
    ok: checks.every((check) => check.ok),
    checks,
    callerIsAgent,
    availableBaseUnits,
  };
}

/** Operator-readable copy for the short reasons the validators return. */
const REASON_TEXT: Readonly<Record<string, string>> = {
  "address-missing": "Enter the agent's wallet address.",
  "address-malformed": "An address is 0x followed by exactly 40 hex characters.",
  "address-zero": "The zero address cannot be an agent.",
  "address-checksum-invalid": "That address fails its EIP-55 checksum — check for a mistyped character.",
  "cap-not-a-number": "Enter the spending cap as a plain decimal number.",
  "cap-not-positive": "The spending cap must be greater than zero.",
  "limit-not-a-number": "Enter the per-transaction limit as a plain decimal number.",
  "limit-not-positive": "The per-transaction limit must be greater than zero.",
  "limit-over-cap": "The per-transaction limit cannot exceed the spending cap.",
  "expiry-missing": "Choose when the card expires.",
  "expiry-not-future": "The expiry must be in the future.",
  "merchants-empty": "Select at least one merchant the agent may pay.",
  "merchants-unknown": "Only merchants from the trusted catalog may be allowlisted.",
  "chain-unknown": "The wallet did not report a chain id.",
  "chain-mismatch": "Switch the wallet to the Arc testnet before continuing.",
  "controller-address-invalid": "The configured controller address is not a valid address.",
  "controller-not-deployed": "No contract bytecode at the configured controller address.",
};

export function describeReason(reason: string): string {
  return REASON_TEXT[reason] ?? reason;
}
