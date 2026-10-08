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
import { keccak256, toUtf8Bytes } from "ethers";

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
  /** Server-bound values required by PactCardController.preflightPay. */
  amountBaseUnits?: string;
  deadline?: number;
  merchantId?: string;
  asset?: "native-testnet-ctc" | "arc-testnet-usdc";
  policyVersion?: number;
  agent?: string;
  /** Canonical intent hash committed by `pay`; server-bound, never client-supplied. */
  intentHash?: string;
};

export interface PaymentClient {
  readCard(cardId: string, agent?: string): Promise<OnChainCardSnapshot>;
  preflight(input: PayInput): Promise<PreflightResult>;
  sendPayment(input: PayInput): Promise<{ txHash: string }>;
  waitForReceipt(txHash: string): Promise<ReceiptResult>;
  findByNonce(cardId: string, nonce: string): Promise<ReceiptResult | null>;
}

export type ReadOnlyRpcTransport = (method: "eth_chainId" | "eth_call", params: unknown[]) => Promise<unknown>;

export function createFetchRpcTransport(rpcUrl: string, fetchFn: typeof fetch = fetch): ReadOnlyRpcTransport {
  return async (method, params) => {
    const response = await fetchFn(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) throw new Error("RPC request failed.");
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (body.error !== undefined || !("result" in body)) throw new Error("RPC response failed.");
    return body.result;
  };
}

export type ReadOnlyRpcPaymentClient = {
  readCard(cardId: string, agent?: string): Promise<OnChainCardSnapshot>;
  preflight(input: PayInput): Promise<PreflightResult>;
};

/** Injectable static-call boundary. It deliberately has no send/broadcast methods. */
export function createReadOnlyRpcPaymentClient(input: {
  rpcUrl: string;
  expectedChainId: number;
  agent?: string;
  transport: ReadOnlyRpcTransport;
}): ReadOnlyRpcPaymentClient {
  if (input.rpcUrl.length === 0) throw new Error("RPC endpoint is required.");
  const defaultAgent = input.agent;
  async function assertNetwork(): Promise<void> {
    const value = await input.transport("eth_chainId", []);
    const chainId = typeof value === "string" ? Number.parseInt(value, 16) : Number(value);
    if (chainId !== input.expectedChainId) throw Object.assign(new Error("Chain mismatch."), { code: "NETWORK_CONFIG_INVALID" });
  }
  return {
    async readCard(cardId, callerAgent) {
      await assertNetwork();
      const value = await input.transport("eth_call", [{ from: callerAgent ?? defaultAgent, kind: "readCard", cardId }, "latest"]);
      if (typeof value !== "object" || value === null) throw new Error("Card read failed.");
      return value as OnChainCardSnapshot;
    },
    async preflight(payInput) {
      await assertNetwork();
      const value = await input.transport("eth_call", [{ from: payInput.agent ?? defaultAgent, kind: "preflightPay", ...payInput }, "latest"]);
      if (typeof value !== "object" || value === null) throw new Error("Preflight failed.");
      return value as PreflightResult;
    },
  };
}

/** Gas-only signer policy: `pay` submission only, no policy mutation path. */
export const SIGNER_POLICY = "gas-only" as const;

/**
 * On-chain settlement nonce for one attempt: keccak256 of the idempotency key,
 * as an unsigned 256-bit integer. Deterministic, so a retry of the same
 * attempt reuses the same nonce: `usedNonces[cardId][nonce]` fails it closed
 * instead of letting a duplicate settle twice, and `findByNonce` can prove the
 * outcome from the settlement event.
 */
export function derivePaymentNonce(idempotencyKey: string): bigint {
  return BigInt(keccak256(toUtf8Bytes(idempotencyKey)));
}

/** Explicit chain-ID assertion: wrong chain fails before card setup/payment. */
export function assertSignerChainId(actual: number, expected: number): void {
  if (actual !== expected) {
    throw Object.assign(new Error("Signer chain mismatch."), { code: "NETWORK_CONFIG_INVALID" });
  }
}
