/**
 * Phase 05 read store (SQL over the read model).
 *
 * Reads are DERIVED data: cards/activity/payments come from the indexed
 * `chain_events` ledger plus the Phase 04 tables. This store never authorizes
 * anything — the read API combines it with a live receipt lookup before it
 * says "settled".
 *
 * Every user value travels in `params` ($1 placeholders); query text is static.
 * Cards are scoped by owner on the SQL side, so a session can only ever read
 * its own wallet's rows.
 */
export type ReadQueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type ReadQueryFn = (text: string, params: unknown[]) => Promise<ReadQueryResult>;

export type CardReadModel = {
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

export type ActivityItem = {
  eventType: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  payload: Record<string, unknown>;
};

export type PaymentAttemptRow = {
  paymentId: string;
  intentId: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset: string;
  chainId: number;
  intentHash: string;
  nonce: string;
  status: string;
  txHash?: string;
};

export type ReadStore = {
  latestIndexedBlock(chainId: number): Promise<number | null>;
  getCard(cardId: string, ownerWallet: string): Promise<CardReadModel | null>;
  listActivity(chainId: number, cardId: string, limit: number): Promise<ActivityItem[]>;
  getPayment(paymentId: string, ownerWallet: string): Promise<PaymentAttemptRow | null>;
  hasIndexedPaymentEvent(chainId: number, txHash: string): Promise<boolean>;
};

const LATEST_BLOCK_SQL =
  "select latest_confirmed_block from indexer_state where chain_id = $1";

const CARD_SQL =
  "select card_id, controller_address, owner_address, agent_id, asset, status, " +
  "owner_configured_cap, per_transaction_limit, verified_credit, spent, expires_at, " +
  "policy_version, source_block, updated_at " +
  "from cards where card_id = $1 and lower(owner_address) = lower($2)";

const ACTIVITY_SQL =
  "select event_type, tx_hash, block_number, log_index, payload from chain_events " +
  "where chain_id = $1 and payload ->> 'cardId' = $2 " +
  "order by block_number desc, log_index desc limit $3";

const PAYMENT_SQL =
  "select pa.idempotency_key, pa.intent_id, pa.status, pa.tx_hash, pa.card_nonce, " +
  "i.card_id, i.merchant_id, i.amount_base_units, i.asset, i.chain_id, i.intent_hash " +
  "from payment_attempts pa " +
  "join intents i on i.intent_id = pa.intent_id " +
  "join cards c on c.card_id = i.card_id " +
  "where pa.idempotency_key = $1 and lower(c.owner_address) = lower($2)";

const PAYMENT_EVENT_SQL =
  "select id from chain_events where chain_id = $1 and tx_hash = $2 and event_type = 'PaymentSettled' limit 1";

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function requiredString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function createSqlReadStore(query: ReadQueryFn): ReadStore {
  return {
    async latestIndexedBlock(chainId: number): Promise<number | null> {
      const result = await query(LATEST_BLOCK_SQL, [chainId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return Number(row["latest_confirmed_block"]);
    },

    async getCard(cardId: string, ownerWallet: string): Promise<CardReadModel | null> {
      const result = await query(CARD_SQL, [cardId, ownerWallet]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return {
        cardId: requiredString(row["card_id"]),
        controllerAddress: requiredString(row["controller_address"]),
        ownerAddress: requiredString(row["owner_address"]),
        agentId: requiredString(row["agent_id"]),
        asset: requiredString(row["asset"]),
        status: requiredString(row["status"]),
        ownerConfiguredCap: requiredString(row["owner_configured_cap"]),
        perTransactionLimit: requiredString(row["per_transaction_limit"]),
        verifiedCredit: requiredString(row["verified_credit"]),
        spent: requiredString(row["spent"]),
        expiresAt: requiredString(row["expires_at"]),
        policyVersion: Number(row["policy_version"]),
        sourceBlock: Number(row["source_block"]),
        updatedAt: requiredString(row["updated_at"]),
      };
    },

    async listActivity(chainId: number, cardId: string, limit: number): Promise<ActivityItem[]> {
      const result = await query(ACTIVITY_SQL, [chainId, cardId, limit]);
      return result.rows.map((row) => ({
        eventType: requiredString(row["event_type"]),
        txHash: requiredString(row["tx_hash"]),
        blockNumber: Number(row["block_number"]),
        logIndex: Number(row["log_index"]),
        payload: (row["payload"] ?? {}) as Record<string, unknown>,
      }));
    },

    async getPayment(paymentId: string, ownerWallet: string): Promise<PaymentAttemptRow | null> {
      const result = await query(PAYMENT_SQL, [paymentId, ownerWallet]);
      const row = result.rows[0];
      if (row === undefined) return null;
      const txHash = optionalString(row["tx_hash"]);
      return {
        paymentId: requiredString(row["idempotency_key"]),
        intentId: requiredString(row["intent_id"]),
        cardId: requiredString(row["card_id"]),
        merchantId: requiredString(row["merchant_id"]),
        amountBaseUnits: requiredString(row["amount_base_units"]),
        asset: requiredString(row["asset"]),
        chainId: Number(row["chain_id"]),
        intentHash: requiredString(row["intent_hash"]),
        nonce: requiredString(row["card_nonce"]),
        status: requiredString(row["status"]),
        ...(txHash === undefined ? {} : { txHash }),
      };
    },

    async hasIndexedPaymentEvent(chainId: number, txHash: string): Promise<boolean> {
      const result = await query(PAYMENT_EVENT_SQL, [chainId, txHash.toLowerCase()]);
      return result.rows.length > 0;
    },
  };
}
