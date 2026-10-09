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

/**
 * One persisted intent, as the read model stores it. The console never invents
 * these fields: card, agent, asset and policy version were bound server-side
 * when the gateway created the intent.
 */
export type ApiIntentRead = {
  intentId: string;
  cardId: string;
  agentId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset: string;
  chainId: number;
  status: string;
  policyVersion: number;
  intentHash: string;
  requestId: string;
  createdAt: string;
  expiresAt: string;
};

export type ApiIntentDetail = IndexerSignal & {
  intent: ApiIntentRead;
  payments: ApiPayment[];
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

/**
 * A server-bound payment intent. Card, agent, asset and policy version are
 * resolved by the gateway, never accepted from the caller; the model only
 * contributes a merchant id and an amount, both re-validated server-side.
 */
export type ApiIntent = {
  intentId: string;
  agentId: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset: string;
  purpose: string;
  confidence: number;
  provider: string;
  model: string;
  createdAt: string;
  expiresAt: string;
  policyVersion: number;
  intentHash: string;
  chainId?: number;
};

export type ApiIntentResponse = {
  requestId: string;
  intentId: string;
  intent: ApiIntent;
  status: "ready";
};

export type ApiPreflightResponse = {
  requestId: string;
  intentId: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  chainId: number;
  checkedAt: string;
};

export type ApiExecuteResponse = {
  requestId: string;
  intentId: string;
  paymentId: string;
  status: "pending" | "settled" | "declined" | "failed";
  txHash?: string;
  explorerUrl?: string;
  reasonCode?: string;
};

export type ApiCardsResponse = IndexerSignal & { cards: ApiCard[]; chainReadAt: string };
export type ApiCardResponse = IndexerSignal & { card: ApiCard; chainReadAt: string };
export type ApiPaymentsResponse = IndexerSignal & { cardId: string; payments: ApiPayment[] };
export type ApiActivityResponse = IndexerSignal & { cardId: string; items: ApiActivityItem[] };
