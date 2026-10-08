/**
 * Agent signer boundary (execute lane): the only module that constructs a
 * signing wallet for payment submission.
 *
 * Gas-only signer policy: this client may submit `controller.pay` with
 * server-bound values (intent, card, merchant, amount, asset, deadline,
 * intentHash) and read card/preflight state. It has no policy-mutating path
 * and never chooses the recipient or the amount.
 *
 * Key hygiene: the private key arrives as an argument, is handed to `Wallet`
 * once, and is never logged, returned, serialized, or persisted. The runtime
 * entrypoint (Neon function) reads the secret name; this module never reads
 * the environment.
 *
 * On-chain nonce: `pay` requires a uint256 and `usedNonces[cardId][nonce]` is
 * per-card. The settlement nonce is therefore derived deterministically from
 * the attempt's idempotency key (`derivePaymentNonce`), so a retry of the same
 * attempt can never settle twice and `findByNonce` can prove an outcome.
 *
 * Deno-safe: ethers only, no Node imports.
 */
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import {
  NATIVE_ASSET_EVM_ADDRESS,
  merchantIdToBytes32,
} from "../../../packages/domain/src/canonical-hash.ts";
import { derivePaymentNonce } from "./chain-client.ts";
import type {
  OnChainCardSnapshot,
  PayInput,
  PaymentClient,
  PreflightResult,
  ReceiptResult,
} from "./chain-client.ts";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const EVM_KEY = /^0x[0-9a-fA-F]{64}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

export const PACT_CARD_CONTROLLER_ABI = [
  "function cards(uint256 cardId) view returns (address owner, address agent, address asset, uint256 ownerConfiguredCap, uint256 verifiedCredit, uint64 verifiedCreditExpiry, uint256 spent, uint256 perTransactionLimit, uint64 expiresAt, uint8 status, uint32 policyVersion)",
  "function preflightPay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline) view returns (bool allowed, bytes32 reason)",
  "function pay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline, bytes32 intentHash)",
  "event PaymentSettled(uint256 indexed cardId, bytes32 indexed merchantId, uint256 amount, uint256 nonce, bytes32 intentHash)",
] as const;

export type AgentSignerPaymentClient = {
  client: PaymentClient;
  /** Public address of the agent signer (never the key). */
  signerAddress: string;
  /** Chain ID observed from the RPC at construction; compared to the lane. */
  signerChainId: number;
};

function signerError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** `bytes32` reason → the ASCII code, e.g. `NONCE_USED`; unknown → `DENIED`. */
export function decodePreflightReason(reason: unknown): string {
  if (typeof reason !== "string" || !reason.startsWith("0x")) return "DENIED";
  let decoded = "";
  for (let index = 2; index + 1 < reason.length; index += 2) {
    const code = Number.parseInt(reason.slice(index, index + 2), 16);
    if (code === 0) break;
    decoded += String.fromCharCode(code);
  }
  return decoded.length === 0 ? "DENIED" : decoded;
}

function requirePayFacts(input: PayInput): {
  cardId: bigint;
  merchantId: string;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
} | null {
  if (
    input.merchantId === undefined ||
    input.amountBaseUnits === undefined ||
    input.deadline === undefined
  ) {
    return null;
  }
  try {
    return {
      cardId: BigInt(input.cardId),
      merchantId: merchantIdToBytes32(input.merchantId),
      amount: BigInt(input.amountBaseUnits),
      nonce: derivePaymentNonce(input.idempotencyKey),
      deadline: BigInt(input.deadline),
    };
  } catch {
    return null;
  }
}

/**
 * Builds the signing payment client. Resolves the RPC once so a wrong chain is
 * rejected before the signer can submit anything.
 */
export async function createAgentSignerPaymentClient(input: {
  rpcUrl: string;
  expectedChainId: number;
  controllerAddress: string;
  privateKey: string;
  confirmations?: number;
}): Promise<AgentSignerPaymentClient> {
  if (input.rpcUrl.length === 0) {
    throw signerError("NETWORK_CONFIG_INVALID", "RPC endpoint is required.");
  }
  if (!EVM_ADDRESS.test(input.controllerAddress)) {
    throw signerError("NETWORK_CONFIG_INVALID", "Controller address is invalid.");
  }
  if (!EVM_KEY.test(input.privateKey)) {
    throw signerError("SIGNER_KEY_INVALID", "Agent signer key is invalid.");
  }
  const provider = new JsonRpcProvider(input.rpcUrl);
  const network = await provider.getNetwork();
  const signerChainId = Number(network.chainId);
  if (signerChainId !== input.expectedChainId) {
    throw signerError("NETWORK_CONFIG_INVALID", "Signer chain mismatch.");
  }
  const wallet = new Wallet(input.privateKey, provider);
  const contract = new Contract(input.controllerAddress, [...PACT_CARD_CONTROLLER_ABI], wallet);
  const confirmations = input.confirmations ?? 1;

  const client: PaymentClient = {
    async readCard(cardId, agent): Promise<OnChainCardSnapshot> {
      const card = (await contract.cards(BigInt(cardId))) as unknown as {
        agent: string;
        policyVersion: bigint;
      };
      return {
        cardId,
        agent: agent ?? card.agent,
        policyVersion: Number(card.policyVersion),
        chainId: signerChainId,
      };
    },

    async preflight(payInput): Promise<PreflightResult> {
      const facts = requirePayFacts(payInput);
      if (facts === null) return { ok: false, reasonCode: "PREFLIGHT_INPUT_INCOMPLETE" };
      const [allowed, reason] = (await contract.preflightPay(
        facts.cardId,
        facts.merchantId,
        facts.amount,
        NATIVE_ASSET_EVM_ADDRESS,
        facts.nonce,
        facts.deadline,
        { from: payInput.agent ?? wallet.address },
      )) as [boolean, string];
      return allowed ? { ok: true } : { ok: false, reasonCode: decodePreflightReason(reason) };
    },

    async sendPayment(payInput): Promise<{ txHash: string }> {
      const facts = requirePayFacts(payInput);
      if (facts === null || payInput.intentHash === undefined || !BYTES32.test(payInput.intentHash)) {
        throw signerError("INPUT_INVALID", "Payment facts are incomplete.");
      }
      const tx = await contract.pay(
        facts.cardId,
        facts.merchantId,
        facts.amount,
        NATIVE_ASSET_EVM_ADDRESS,
        facts.nonce,
        facts.deadline,
        payInput.intentHash,
      );
      return { txHash: tx.hash };
    },

    async waitForReceipt(txHash): Promise<ReceiptResult> {
      const receipt = await provider.waitForTransaction(txHash, confirmations);
      if (receipt === null) {
        throw signerError("PAYMENT_BROADCAST_TIMEOUT", "Receipt not observed.");
      }
      return { status: receipt.status === 1 ? 1 : 0, txHash };
    },

    async findByNonce(cardId, nonce): Promise<ReceiptResult | null> {
      const logs = await contract.queryFilter(
        contract.filters.PaymentSettled(BigInt(cardId)),
        0,
        "latest",
      );
      const wanted = BigInt(nonce);
      for (const log of logs) {
        const args = (log as { args?: unknown }).args;
        if (args === undefined || args === null) continue;
        const settledNonce = (args as unknown as { nonce: bigint }).nonce;
        if (settledNonce === wanted) {
          return { status: 1, txHash: log.transactionHash };
        }
      }
      return null;
    },
  };

  return { client, signerAddress: wallet.address, signerChainId };
}
