/**
 * Pact Protocol — Core Types, Schemas, HTLC Helpers & Fee Calculations
 * Strictly aligned with docs/pact_docs.md (§1.3, §3.2, §3.4) and docs/phase0_spec_lock.md
 */
import { randomBytes } from "node:crypto";
import { encodePacked, keccak256, parseUnits, formatUnits } from "viem";

export enum Priority {
  SPEED = 0, // Lightning Route (~1-3s)
  COST = 1,  // Economy Route (~15-45s batch)
}

export type IntentLifecycleState =
  | "CREATED"
  | "DISPATCHED"
  | "SETTLED"
  | "CLAIMED"
  | "REFUNDED";

export type SupportedTargetChainId = 421614 | 84532 | 43113; // Arbitrum Sepolia | Base Sepolia | Avalanche Fuji

/**
 * Dynamic QR JSON Schema (§3.2.3: application/vnd.pact.payment+json)
 */
export interface PactPaymentRequest {
  protocol: "pact";
  version?: "1.0";
  orderId: string;
  merchant: `0x${string}`;
  targetChainId: SupportedTargetChainId;
  targetToken: "USDC";
  amount: string; // Decimal string up to 6 decimals, e.g. "3.50"
  timestamp?: number;
}

export interface StoredQuoteRecord {
  hash_lock: `0x${string}`;
  secret: string;
  order_id: string | null;
  merchant: string | null;
  target_chain_id: number | null;
  amount_atomic: string | null;
  lightning_fee_atomic: string;
  economy_fee_atomic: string;
  deadline: number;
  created_at: number;
}

export interface StoredIntentRecord {
  intent_id: `0x${string}`;
  order_id: string | null;
  sender: `0x${string}`;
  token_in: `0x${string}`;
  amount_in: string;
  fee_paid: string;
  target_chain_id: number;
  receiver: `0x${string}`;
  token_out: `0x${string}`;
  priority: Priority;
  hash_lock: `0x${string}`;
  secret: string | null;
  deadline: number;
  state: IntentLifecycleState;
  source_tx_hash: `0x${string}` | null;
  source_block_number: number | null;
  dest_tx_hash: `0x${string}` | null;
  claim_tx_hash: `0x${string}` | null;
  error_message: string | null;
  retry_count: number;
  created_at: number;
  updated_at: number;
}

/**
 * Deterministic Fee Model (§1.3)
 * All values in 6-decimal USDC atomic units (1 USDC = 1_000_000n)
 */
export const USDC_DECIMALS = 6;
export const LIGHTNING_THRESHOLD_USDC = 15_000_000n; // $15.00
export const LIGHTNING_FLAT_FEE_USDC = 50_000n;      // $0.05
export const LIGHTNING_BPS = 30n;                    // 0.30% (30 / 10_000)
export const ECONOMY_FLAT_FEE_USDC = 5_000n;         // $0.005
export const MIN_ECONOMY_INVOICE_USDC = 1_000_000n;  // $1.00 (1 USDC)
export const DEFAULT_DEADLINE_SECONDS = 900;         // 15 minutes (§1.4)
export const FALLBACK_DEMO_SECRET = "pact-demo-secret";

export function calculateFeeAtomic(
  amountAtomic: bigint,
  priority: Priority,
  estimatedGasUsdAtomic?: bigint
): bigint {
  if (priority === Priority.COST) {
    if (estimatedGasUsdAtomic !== undefined) {
      const dynamicFee = (estimatedGasUsdAtomic * 120n) / 100n;
      return dynamicFee > ECONOMY_FLAT_FEE_USDC ? dynamicFee : ECONOMY_FLAT_FEE_USDC;
    }
    return ECONOMY_FLAT_FEE_USDC;
  }
  if (amountAtomic >= LIGHTNING_THRESHOLD_USDC) {
    return LIGHTNING_FLAT_FEE_USDC;
  }
  return (amountAtomic * LIGHTNING_BPS) / 10_000n;
}

/**
 * Computes keccak256(abi.encodePacked(secret)) matching Solidity `PactEscrow.claimEscrow` verbatim.
 */
export function computeHashLock(secret: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [secret]));
}

/**
 * Generates a fresh cryptographic preimage secret and its on-chain hashLock commitment.
 */
export function generateSecretAndHashLock(): { secret: string; hashLock: `0x${string}` } {
  const secret = `pact_${randomBytes(24).toString("hex")}`;
  const hashLock = computeHashLock(secret);
  return { secret, hashLock };
}

export function parseUsdcAmount(amountStr: string): bigint {
  return parseUnits(amountStr, USDC_DECIMALS);
}

export function formatUsdcAmount(amountAtomic: bigint): string {
  return formatUnits(amountAtomic, USDC_DECIMALS);
}
