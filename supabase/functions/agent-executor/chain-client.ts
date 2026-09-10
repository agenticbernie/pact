/**
 * Executor chain boundary (D-combined): one chain-client owns the static
 * `preflightPay` read and the `pay` send so preflight and execute cannot
 * drift. Gas-only agent signer: the signer may only submit `controller.pay`
 * with server-bound values; it can never change policy. The private key name
 * below is function-only (Supabase secrets); no value ever appears here.
 *
 * NOTE (secret hygiene): this module references the secret NAME only via
 * `readSignerKey`, which reads the runtime environment inside the deployed
 * function. Never log, return, or persist the value.
 */

export type OnChainCardSnapshot = {
  cardId: string;
  agent: string;
  policyVersion: number;
  chainId: number;
};

export type PreflightResult = {
  ok: boolean;
  reasonCode?: string;
};

export type ReceiptResult = {
  status: 0 | 1;
  txHash: string;
};

export type PayInput = {
  intentId: string;
  idempotencyKey: string;
  cardId: string;
  nonce: string;
};

export interface PaymentClient {
  readCard(cardId: string): Promise<OnChainCardSnapshot>;
  preflight(input: PayInput): Promise<PreflightResult>;
  sendPayment(input: PayInput): Promise<{ txHash: string }>;
  waitForReceipt(txHash: string): Promise<ReceiptResult>;
  findByNonce(cardId: string, nonce: string): Promise<ReceiptResult | null>;
}

/** Gas-only signer policy: `pay` submission only, no policy mutation path. */
export const SIGNER_POLICY = "gas-only" as const;

/** Explicit chain-ID assertion: wrong chain fails before card setup/payment. */
export function assertSignerChainId(actual: number, expected: number): void {
  if (actual !== expected) {
    throw Object.assign(new Error("Signer chain mismatch."), { code: "NETWORK_CONFIG_INVALID" });
  }
}
