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

/**
 * Provenance of `policyVersion`. The controller's card events carry no policy
 * version, so the column alone can be a projection placeholder:
 * - `unknown`  — never observed from the chain; do not present it as verified.
 * - `stale`    — observed, but a newer card event was indexed since; the value
 *                may no longer match the controller.
 * - `verified` — observed on chain at (or after) the newest indexed event.
 */
export type PolicyVersionStatus = "unknown" | "stale" | "verified";

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
  policyVersionStatus: PolicyVersionStatus;
  policyVersionSource: string;
  policyVersionBlock: number;
  sourceBlock: number;
  updatedAt: string;
};

/** A server-bound payment intent, as persisted by the AI gateway. */
export type IntentReadModel = {
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
  attemptCreatedAt?: string;
  attemptUpdatedAt?: string;
  intentCreatedAt?: string;
  intentExpiresAt?: string;
};

/** One indexed chain log, as stored by the Phase 05 indexer. */
export type IndexedEventRow = {
  eventType: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  contractAddress: string;
  payload: Record<string, unknown>;
};

export type ReadStore = {
  latestIndexedBlock(chainId: number): Promise<number | null>;
  getCard(cardId: string, ownerWallet: string): Promise<CardReadModel | null>;
  listCards(ownerWallet: string): Promise<CardReadModel[]>;
  listActivity(chainId: number, cardId: string, limit: number): Promise<ActivityItem[]>;
  getPayment(paymentId: string, ownerWallet: string): Promise<PaymentAttemptRow | null>;
  listPayments(chainId: number, cardId: string, ownerWallet: string, limit: number): Promise<PaymentAttemptRow[]>;
  getIntent(intentId: string, ownerWallet: string): Promise<IntentReadModel | null>;
  listIntentPayments(intentId: string, ownerWallet: string, limit: number): Promise<PaymentAttemptRow[]>;
  hasIndexedPaymentEvent(chainId: number, txHash: string): Promise<boolean>;
  paymentEvents(chainId: number, txHash: string): Promise<IndexedEventRow[]>;
};

const LATEST_BLOCK_SQL =
  "select latest_confirmed_block from indexer_state where chain_id = $1";

/**
 * Card columns plus the newest indexed event block for the same card. The
 * policy-version provenance is derived from those two facts (`toCard`), so the
 * read model can say `unknown`/`stale`/`verified` without a second round trip.
 */
const CARD_COLUMNS =
  "c.card_id, c.controller_address, c.owner_address, c.agent_id, c.asset, c.status, " +
  "c.owner_configured_cap, c.per_transaction_limit, c.verified_credit, c.spent, c.expires_at, " +
  "c.policy_version, c.policy_version_source, c.policy_version_block, " +
  "c.source_block, c.updated_at, " +
  "(select max(e.block_number) from chain_events e " +
  "where e.chain_id = c.chain_id and e.payload ->> 'cardId' = c.card_id) as policy_version_event_block";

const CARD_SQL =
  "select " + CARD_COLUMNS + " from cards c " +
  "where c.card_id = $1 and lower(c.owner_address) = lower($2)";

const ACTIVITY_SQL =
  "select event_type, tx_hash, block_number, log_index, payload from chain_events " +
  "where chain_id = $1 and payload ->> 'cardId' = $2 " +
  "order by block_number desc, log_index desc limit $3";

const CARDS_SQL =
  "select " + CARD_COLUMNS + " from cards c " +
  "where lower(c.owner_address) = lower($1) order by c.card_id";

const PAYMENT_COLUMNS =
  "pa.idempotency_key, pa.intent_id, pa.status, pa.tx_hash, pa.card_nonce, " +
  "pa.created_at, pa.updated_at, i.card_id, i.merchant_id, i.amount_base_units, i.asset, " +
  "i.chain_id, i.intent_hash, i.created_at as intent_created_at, i.expires_at as intent_expires_at";

const PAYMENT_SQL =
  "select " + PAYMENT_COLUMNS + " " +
  "from payment_attempts pa " +
  "join intents i on i.intent_id = pa.intent_id " +
  "join cards c on c.card_id = i.card_id " +
  "where pa.idempotency_key = $1 and lower(c.owner_address) = lower($2)";

const CARD_PAYMENTS_SQL =
  "select " + PAYMENT_COLUMNS + " " +
  "from payment_attempts pa " +
  "join intents i on i.intent_id = pa.intent_id " +
  "join cards c on c.card_id = i.card_id " +
  "where i.card_id = $1 and i.chain_id = $2 and lower(c.owner_address) = lower($3) " +
  "order by pa.updated_at desc limit $4";

const INTENT_SQL =
  "select i.intent_id, i.card_id, i.merchant_id, i.amount_base_units, i.asset, i.chain_id, " +
  "i.status, i.policy_version, i.intent_hash, i.request_id, i.created_at, i.expires_at, " +
  "c.agent_id " +
  "from intents i join cards c on c.card_id = i.card_id " +
  "where i.intent_id = $1 and lower(c.owner_address) = lower($2)";

const INTENT_PAYMENTS_SQL =
  "select " + PAYMENT_COLUMNS + " " +
  "from payment_attempts pa " +
  "join intents i on i.intent_id = pa.intent_id " +
  "join cards c on c.card_id = i.card_id " +
  "where pa.intent_id = $1 and lower(c.owner_address) = lower($2) " +
  "order by pa.updated_at desc limit $3";

const PAYMENT_EVENT_SQL =
  "select id from chain_events where chain_id = $1 and tx_hash = $2 and event_type = 'PaymentSettled' limit 1";

const PAYMENT_EVENTS_SQL =
  "select event_type, tx_hash, block_number, log_index, contract_address, payload " +
  "from chain_events where chain_id = $1 and tx_hash = $2 order by log_index";

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function requiredString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The three-state policy-version answer. A projection placeholder is NEVER
 * reported as verified: without a chain observation the row is `unknown`, and a
 * card event newer than the observation makes it `stale`. Both states are
 * self-healing — the reconciler re-reads the controller on the next tick.
 */
export function policyVersionStatus(input: {
  source: unknown;
  observedBlock: unknown;
  latestEventBlock: unknown;
}): PolicyVersionStatus {
  const source = requiredString(input.source);
  const observedBlock = Number(input.observedBlock);
  if (source !== "CHAIN" || !Number.isInteger(observedBlock) || observedBlock <= 0) return "unknown";
  const latestEventBlock = input.latestEventBlock;
  if (latestEventBlock === null || latestEventBlock === undefined) return "verified";
  const newestEvent = Number(latestEventBlock);
  if (Number.isInteger(newestEvent) && observedBlock < newestEvent) return "stale";
  return "verified";
}

function toCard(row: Record<string, unknown>): CardReadModel {
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
    policyVersionSource: requiredString(row["policy_version_source"]),
    policyVersionBlock: Number(row["policy_version_block"]),
    policyVersionStatus: policyVersionStatus({
      source: row["policy_version_source"],
      observedBlock: row["policy_version_block"],
      latestEventBlock: row["policy_version_event_block"],
    }),
    sourceBlock: Number(row["source_block"]),
    updatedAt: requiredString(row["updated_at"]),
  };
}

function toIntent(row: Record<string, unknown>): IntentReadModel {
  return {
    intentId: requiredString(row["intent_id"]),
    cardId: requiredString(row["card_id"]),
    agentId: requiredString(row["agent_id"]),
    merchantId: requiredString(row["merchant_id"]),
    amountBaseUnits: requiredString(row["amount_base_units"]),
    asset: requiredString(row["asset"]),
    chainId: Number(row["chain_id"]),
    status: requiredString(row["status"]),
    policyVersion: Number(row["policy_version"]),
    intentHash: requiredString(row["intent_hash"]),
    requestId: requiredString(row["request_id"]),
    createdAt: requiredString(row["created_at"]),
    expiresAt: requiredString(row["expires_at"]),
  };
}

function toPayment(row: Record<string, unknown>): PaymentAttemptRow {
  const txHash = optionalString(row["tx_hash"]);
  const attemptCreatedAt = optionalString(row["created_at"]);
  const attemptUpdatedAt = optionalString(row["updated_at"]);
  const intentCreatedAt = optionalString(row["intent_created_at"]);
  const intentExpiresAt = optionalString(row["intent_expires_at"]);
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
    ...(attemptCreatedAt === undefined ? {} : { attemptCreatedAt }),
    ...(attemptUpdatedAt === undefined ? {} : { attemptUpdatedAt }),
    ...(intentCreatedAt === undefined ? {} : { intentCreatedAt }),
    ...(intentExpiresAt === undefined ? {} : { intentExpiresAt }),
  };
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
      return toCard(row);
    },

    async listCards(ownerWallet: string): Promise<CardReadModel[]> {
      const result = await query(CARDS_SQL, [ownerWallet]);
      return result.rows.map(toCard);
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
      return toPayment(row);
    },

    async listPayments(
      chainId: number,
      cardId: string,
      ownerWallet: string,
      limit: number,
    ): Promise<PaymentAttemptRow[]> {
      const result = await query(CARD_PAYMENTS_SQL, [cardId, chainId, ownerWallet, limit]);
      return result.rows.map(toPayment);
    },

    async getIntent(intentId: string, ownerWallet: string): Promise<IntentReadModel | null> {
      const result = await query(INTENT_SQL, [intentId, ownerWallet]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return toIntent(row);
    },

    async listIntentPayments(
      intentId: string,
      ownerWallet: string,
      limit: number,
    ): Promise<PaymentAttemptRow[]> {
      const result = await query(INTENT_PAYMENTS_SQL, [intentId, ownerWallet, limit]);
      return result.rows.map(toPayment);
    },

    async hasIndexedPaymentEvent(chainId: number, txHash: string): Promise<boolean> {
      const result = await query(PAYMENT_EVENT_SQL, [chainId, txHash.toLowerCase()]);
      return result.rows.length > 0;
    },

    async paymentEvents(chainId: number, txHash: string): Promise<IndexedEventRow[]> {
      const result = await query(PAYMENT_EVENTS_SQL, [chainId, txHash.toLowerCase()]);
      return result.rows.map((row) => ({
        eventType: requiredString(row["event_type"]),
        txHash: requiredString(row["tx_hash"]),
        blockNumber: Number(row["block_number"]),
        logIndex: Number(row["log_index"]),
        contractAddress: requiredString(row["contract_address"]),
        payload: (row["payload"] ?? {}) as Record<string, unknown>,
      }));
    },
  };
}
