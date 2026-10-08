/**
 * Wallet-facing chain access for the console.
 *
 * The console only ever asks the injected wallet for two things: the account,
 * and a signature over a `createCard` / `activateCard` transaction that the
 * owner explicitly confirms. No private key, session token or privileged value
 * reaches this module, and the settlement path (`pay`) is deliberately absent —
 * that call belongs to the agent lane, never to a browser.
 *
 * Reads use a plain RPC runner, so eligibility can be checked before a wallet is
 * involved. Every write is followed by a receipt wait and an on-chain re-read;
 * a transaction hash is never reported as a card.
 */
import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  keccak256,
  toUtf8Bytes,
  type ContractRunner,
  type Signer,
} from "ethers";
import { injectedProvider, type Eip1193Provider } from "../session/wallet";
import {
  checkControllerDeployment,
  checkWalletChain,
  describeReason,
  type CardDraft,
  type ChainCardSnapshot,
} from "./card-policy";
import { CARD_CONTROLLER_ABI, CREDIT_POOL_ABI, MERCHANT_SIMULATOR_ABI } from "./controller-abi";
import { ARC_TESTNET_NAME, toHexChainId } from "./network";

/* ------------------------------------------------------------------ *
 * Small, typed shims over ethers' dynamic contract
 * ------------------------------------------------------------------ */

type Callable = (...args: unknown[]) => Promise<unknown>;

type TxResponse = {
  hash: string;
  wait: () => Promise<ReceiptLike | null>;
};

type ReceiptLike = {
  status: number | null;
  logs: readonly { address: string; topics: readonly string[]; data: string }[];
};

function fn(contract: Contract, name: string): Callable {
  const candidate = (contract as unknown as Record<string, unknown>)[name];
  if (typeof candidate !== "function") {
    throw new Error(`The controller ABI has no ${name} entry.`);
  }
  return candidate as Callable;
}

function asBigInt(value: unknown): bigint {
  return typeof value === "bigint" ? value : BigInt(String(value));
}

function asAddress(value: unknown): string {
  return String(value);
}

/** Merchant id → bytes32, exactly as `canonical-hash.ts` defines it. */
export function merchantIdToBytes32(merchantId: string): string {
  return keccak256(toUtf8Bytes(merchantId.trim().toLowerCase()));
}

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

/** Read-only runner for the public lane RPC. Needs no wallet. */
export function readOnlyRunner(rpcUrl: string, chainId: number): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
}

export type WalletContext = {
  provider: BrowserProvider;
  signer: Signer;
  address: string;
  chainId: number;
};

export class ChainError extends Error {
  readonly reason: string;

  constructor(reason: string, message?: string) {
    super(message ?? describeReason(reason));
    this.name = "ChainError";
    this.reason = reason;
  }
}

/**
 * Connect the injected wallet and make sure it is on the expected chain.
 * A mismatch is offered as an EIP-3326 switch rather than a silent encode
 * against the wrong network.
 */
export async function connectInjectedWallet(expectedChainId: number): Promise<WalletContext> {
  const injected = injectedProvider();
  if (injected === null) {
    throw new ChainError(
      "wallet-missing",
      "No browser wallet detected. Install an EVM wallet extension to sign as the owner.",
    );
  }
  await injected.request({ method: "eth_requestAccounts" });
  let chainId = await readChainId(injected);
  if (chainId !== expectedChainId) {
    await switchChain(injected, expectedChainId);
    chainId = await readChainId(injected);
  }
  const check = checkWalletChain(chainId, expectedChainId);
  if (!check.ok) throw new ChainError(check.reason);
  const provider = new BrowserProvider(injected, { name: ARC_TESTNET_NAME, chainId: expectedChainId });
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address, chainId };
}

async function readChainId(injected: Eip1193Provider): Promise<number> {
  const value = await injected.request({ method: "eth_chainId" });
  if (typeof value !== "string" || value === "") throw new ChainError("chain-unknown");
  return Number(BigInt(value));
}

async function switchChain(injected: Eip1193Provider, chainId: number): Promise<void> {
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(chainId) }],
    });
  } catch {
    throw new ChainError(
      "chain-mismatch",
      `Your wallet is not on the Arc testnet (chain ${chainId}). Add it to the wallet, or switch networks, and try again.`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** Confirm the configured controller really carries code on the connected chain. */
export async function assertControllerDeployed(
  runner: ContractRunner,
  controller: string,
): Promise<void> {
  const bytecode = await runner.provider?.getCode(controller);
  const check = checkControllerDeployment(bytecode ?? "0x", controller);
  if (!check.ok) throw new ChainError(check.reason);
}

/** `cards(cardId)` → the snapshot every policy check is derived from. */
export async function readChainCard(
  runner: ContractRunner,
  controller: string,
  cardId: string,
): Promise<ChainCardSnapshot | null> {
  const contract = new Contract(controller, CARD_CONTROLLER_ABI, runner);
  const raw = (await fn(contract, "cards")(cardId)) as unknown[];
  const owner = asAddress(raw[0]);
  if (owner === "0x0000000000000000000000000000000000000000") return null;
  return {
    owner,
    agent: asAddress(raw[1]),
    asset: asAddress(raw[2]),
    ownerConfiguredCap: asBigInt(raw[3]),
    verifiedCredit: asBigInt(raw[4]),
    verifiedCreditExpiry: asBigInt(raw[5]),
    spent: asBigInt(raw[6]),
    perTransactionLimit: asBigInt(raw[7]),
    expiresAt: asBigInt(raw[8]),
    status: Number(raw[9]),
  };
}

export async function readPoolBalance(runner: ContractRunner, pool: string): Promise<bigint> {
  const contract = new Contract(pool, CREDIT_POOL_ABI, runner);
  return asBigInt(await fn(contract, "availableBalance")());
}

export async function readMerchantActive(
  runner: ContractRunner,
  merchant: string,
  merchantId: string,
): Promise<boolean> {
  const contract = new Contract(merchant, MERCHANT_SIMULATOR_ABI, runner);
  return (await fn(contract, "isMerchantActive")(merchantIdToBytes32(merchantId))) === true;
}

export async function readMerchantAllowlisted(
  runner: ContractRunner,
  controller: string,
  cardId: string,
  merchantId: string,
): Promise<boolean> {
  const contract = new Contract(controller, CARD_CONTROLLER_ABI, runner);
  return (await fn(contract, "cardAllowlist")(cardId, merchantIdToBytes32(merchantId))) === true;
}

/**
 * Static-call the controller's own preflight with `from` set to the agent, so
 * the console can show the same verdict `pay` will reach — including the
 * checks that only exist on chain (nonce reuse, pool balance, deadline).
 */
export async function readOnChainPreflight(
  runner: ContractRunner,
  controller: string,
  input: {
    cardId: string;
    merchantId: string;
    amountBaseUnits: bigint;
    asset: string;
    nonce: bigint;
    deadlineSeconds: bigint;
    agent: string;
  },
): Promise<{ allowed: boolean; reason: string }> {
  const contract = new Contract(controller, CARD_CONTROLLER_ABI, runner);
  const result = (await fn(contract, "preflightPay")(
    input.cardId,
    merchantIdToBytes32(input.merchantId),
    input.amountBaseUnits,
    input.asset,
    input.nonce,
    input.deadlineSeconds,
    { from: input.agent },
  )) as unknown[];
  return { allowed: result[0] === true, reason: String(result[1]) };
}

/* ------------------------------------------------------------------ *
 * Card issuance
 * ------------------------------------------------------------------ */

export type IssuanceStep =
  | "submitting-create"
  | "confirming-create"
  | "submitting-activate"
  | "confirming-activate";

export type IssuedCard = {
  cardId: string;
  createTxHash: string;
  activateTxHash: string;
  /** On-chain state read back after activation. */
  card: ChainCardSnapshot | null;
};

/**
 * `createCard` then `activateCard`, each in its own owner-authorized
 * transaction (the deployed controller keeps issuance and activation separate,
 * so a card exists before it can spend).
 *
 * The card id comes from the `CardCreated` event, never from the call's return
 * value: a mined transaction receipt does not carry return data. If the event
 * is missing from the receipt, the transaction is reported as mined-but-
 * unusable rather than guessing an id.
 */
export async function issueCard(input: {
  runner: ContractRunner;
  signer: Signer;
  controller: string;
  draft: CardDraft;
  onStep?: (step: IssuanceStep) => void;
}): Promise<IssuedCard> {
  const contract = new Contract(input.controller, CARD_CONTROLLER_ABI, input.signer);
  const allowlist = input.draft.merchants.map(merchantIdToBytes32);

  input.onStep?.("submitting-create");
  const createTx = (await fn(contract, "createCard")(
    input.draft.agent,
    input.draft.ownerConfiguredCap,
    input.draft.perTransactionLimit,
    input.draft.expiresAtSeconds,
    allowlist,
  )) as TxResponse;

  input.onStep?.("confirming-create");
  const createReceipt = await createTx.wait();
  assertMined(createReceipt, "The card creation transaction did not succeed.");
  const cardId = findCardCreatedId(contract, createReceipt, input.controller);
  if (cardId === null) {
    throw new ChainError(
      "card-event-missing",
      `Transaction ${createTx.hash} mined without a CardCreated event, so the card id is unknown. Check the explorer before retrying.`,
    );
  }

  input.onStep?.("submitting-activate");
  const activateTx = (await fn(contract, "activateCard")(cardId)) as TxResponse;

  input.onStep?.("confirming-activate");
  const activateReceipt = await activateTx.wait();
  assertMined(activateReceipt, "The activation transaction did not succeed.");

  const card = await readChainCard(input.runner, input.controller, cardId);
  return { cardId, createTxHash: createTx.hash, activateTxHash: activateTx.hash, card };
}

function assertMined(receipt: ReceiptLike | null, message: string): asserts receipt is ReceiptLike {
  if (receipt === null || receipt.status !== 1) {
    throw new ChainError("transaction-reverted", message);
  }
}

/** The `CardCreated` event's first argument, from a mined receipt's own logs. */
export function findCardCreatedId(
  contract: Contract,
  receipt: Pick<ReceiptLike, "logs">,
  controller: string,
): string | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== controller.toLowerCase()) continue;
    try {
      const parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed !== null && parsed.name === "CardCreated") return String(parsed.args[0]);
    } catch {
      // A log the controller emits that this ABI subset does not describe.
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Error copy
 * ------------------------------------------------------------------ */

const CONTRACT_ERROR_TEXT: Readonly<Record<string, string>> = {
  InvalidPolicy: "The controller rejected the policy (agent, cap, limit or expiry).",
  InvalidAmount: "The controller rejected the amount: caps and limits must be non-zero.",
  InvalidCardStatus: "The card is not in a state that allows this operation.",
  UnauthorizedCaller: "That wallet is not authorized for this card.",
  CardExpired: "The card has expired.",
  CreditExceeded: "The payment exceeds the card's limit.",
  MerchantNotAllowed: "The merchant is not on the card's allowlist.",
  MerchantInactive: "The merchant is inactive in the simulator.",
  NonceAlreadyUsed: "That payment nonce has already been used — this payment was settled before.",
  PoolBalanceLow: "The credit pool does not hold enough to settle this payment.",
  PaymentDeadlineExpired: "The intent deadline has passed.",
  EvidenceAlreadyApplied: "That credit evidence id was already applied.",
  UnknownAgent: "The agent has no active card on this controller.",
  InvalidAsset: "The asset does not match the card's settlement asset.",
};

/** Wallet/contract failure → one actionable sentence, never a raw stack. */
export function describeChainError(error: unknown): string {
  if (error instanceof ChainError) return error.message;
  if (error === null || typeof error !== "object") return "The wallet request failed.";
  const candidate = error as {
    code?: unknown;
    reason?: unknown;
    shortMessage?: unknown;
    message?: unknown;
    revert?: { name?: unknown } | null;
  };
  if (candidate.code === "ACTION_REJECTED" || candidate.code === 4001) {
    return "You rejected the request in your wallet. Nothing was submitted.";
  }
  const revertName = typeof candidate.revert?.name === "string" ? candidate.revert.name : undefined;
  if (revertName !== undefined && CONTRACT_ERROR_TEXT[revertName] !== undefined) {
    return CONTRACT_ERROR_TEXT[revertName];
  }
  const reason = typeof candidate.reason === "string" ? candidate.reason : undefined;
  if (reason !== undefined && CONTRACT_ERROR_TEXT[reason] !== undefined) {
    return CONTRACT_ERROR_TEXT[reason];
  }
  for (const text of [candidate.shortMessage, candidate.message]) {
    if (typeof text !== "string" || text === "") continue;
    for (const [name, message] of Object.entries(CONTRACT_ERROR_TEXT)) {
      if (text.includes(name)) return message;
    }
    return text;
  }
  return "The wallet request failed.";
}
