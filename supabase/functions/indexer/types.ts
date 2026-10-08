/**
 * Phase 05 indexer boundary types.
 *
 * The indexer reads CONFIRMED chain logs, decodes only known Pact/ASC events
 * from allowlisted contract addresses, and upserts them by
 * (chainId, txHash, logIndex). It owns no payment authority: it can only
 * record what the chain already settled.
 */

export type PactEventType =
  | "CardCreated"
  | "CardActivated"
  | "CardSuspended"
  | "CardResumed"
  | "CardClosed"
  | "CreditVerified"
  | "PolicyUpdated"
  | "PaymentSettled"
  | "PoolFunded"
  | "PoolWithdrawn"
  | "MerchantPaymentReceived"
  | "MerchantRegistered";

/** One raw chain log, normalized to lowercase address + string topics. */
export type ChainLog = {
  address: string;
  topics: readonly string[];
  data: string;
  blockNumber: bigint;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  removed?: boolean;
};

/** A decoded, allowlisted event ready to be persisted. */
export type DecodedPactEvent = {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: bigint;
  blockHash: string;
  contractAddress: string;
  eventType: PactEventType;
  payload: Record<string, unknown>;
  payloadHash: string;
};

/** Persisted cursor. `nextBlock` advances only after a full range is stored. */
export type IndexerCursor = {
  chainId: number;
  nextBlock: bigint;
  latestConfirmedBlock: bigint;
  latestBlockHash?: string;
};

export interface ChainReader {
  latestBlock(): Promise<bigint>;
  getLogs(fromBlock: bigint, toBlock: bigint): Promise<readonly ChainLog[]>;
  getBlockHash(blockNumber: bigint): Promise<string | null>;
  getReceipt(txHash: string): Promise<{ status: 0 | 1; blockNumber?: number } | null>;
}

export type UpsertResult = "inserted" | "duplicate";

export interface CursorStore {
  load(chainId: number): Promise<IndexerCursor | null>;
  save(cursor: IndexerCursor): Promise<void>;
  upsertEvent(event: DecodedPactEvent): Promise<UpsertResult>;
}

export type PactEventDecoder = {
  decode(log: ChainLog): DecodedPactEvent | null;
};

export type IndexerTickResult = {
  advanced: boolean;
  nextBlock: bigint;
  latestConfirmedBlock: bigint;
  inserted: number;
  duplicates: number;
  ignored: number;
  reorgRewind: boolean;
};
