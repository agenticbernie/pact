/**
 * Wire shapes of the Phase 05 read API.
 *
 * These mirror the handler in `supabase/functions/read-api/index.ts`. Fields the
 * API omits when absent are optional here, so the console never renders an
 * invented default.
 */

export type ApiCard = {
  cardId: string;
  controllerAddress: string;
  ownerAddress: string;
  agentId: string;
  asset: string;
  status: string;
  ownerConfiguredCap: string;
  perTransactionLimit: string;
  verifiedCredit: string;
  spent: string;
  expiresAt: string;
  policyVersion: number;
  sourceBlock: number;
  updatedAt: string;
};

export type ApiIndexedEvent = {
  eventType: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  contractAddress: string;
  payload: Record<string, unknown>;
};

export type ApiActivityItem = {
  eventType: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  payload: Record<string, unknown>;
};

export type ApiPayment = {
  paymentId: string;
  intentId: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset: string;
  chainId: number;
  intentHash: string;
  nonce: string;
  /** Application row status; never settlement truth on its own. */
  attemptStatus: string;
  attemptCreatedAt?: string;
  attemptUpdatedAt?: string;
  intentCreatedAt?: string;
  intentExpiresAt?: string;
  /** Chain-derived truth (see lib/status.ts). */
  status?: string;
  receiptConfirmed?: boolean;
  indexedPaymentEvent?: boolean;
  reasonCode?: string;
  txHash?: string;
  explorerUrl?: string;
  latestIndexedBlock?: number;
};

export type ApiPaymentDetail = ApiPayment & {
  events: ApiIndexedEvent[];
  blockNumber?: number;
};

export type ApiConfig = {
  chainId: number;
  controller: string;
  pool: string;
  merchant: string;
  explorerUrl: string;
  latestIndexedBlock: number | null;
};

export type IndexerSignal = {
  latestIndexedBlock: number | null;
  stale: boolean;
};

export type ApiCardsResponse = IndexerSignal & { cards: ApiCard[]; chainReadAt: string };
export type ApiCardResponse = IndexerSignal & { card: ApiCard; chainReadAt: string };
export type ApiPaymentsResponse = IndexerSignal & { cardId: string; payments: ApiPayment[] };
export type ApiActivityResponse = IndexerSignal & { cardId: string; items: ApiActivityItem[] };
