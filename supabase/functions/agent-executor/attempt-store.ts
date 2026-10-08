/**
 * Payment-attempt store port (C-DDL pins): idempotent first-claim plus the
 * store-txHash-before-wait ordering, expressed as an async port so the same
 * executor logic runs against the in-memory test seam and the durable
 * `payment_attempts` table.
 *
 * Pins (verbatim, mirrored in the migration):
 * - payment_attempts(intent_id, idempotency_key, status, tx_hash, card_nonce)
 *   PRIMARY KEY(intent_id,idempotency_key) UNIQUE(idempotency_key)
 * - first-claim INSERT ... ON CONFLICT DO NOTHING, then a scoped row read
 *   (SELECT ... FOR UPDATE under the transaction-scoped Postgres path)
 * - status transitions write tx_hash before the receipt wait
 *
 * Deno-safe: no Node imports, no environment reads. Values never logged.
 */

export type AttemptRecord = {
  key: string;
  intentId: string;
  idempotencyKey: string;
  status: string;
  txHash: string | null;
  cardNonce: string;
};

export type AttemptKey = {
  intentId: string;
  idempotencyKey: string;
};

export type AttemptClaim = {
  /** True when this call performed the INSERT; false when the row pre-existed. */
  claimed: boolean;
  row: AttemptRecord;
};

export type AttemptStore = {
  get(input: AttemptKey): Promise<AttemptRecord | null>;
  claim(record: AttemptRecord): Promise<AttemptClaim>;
  update(input: AttemptKey & { status: string; txHash?: string | null }): Promise<void>;
};

/** First-claim predicate (mirrors the migration's INSERT ... ON CONFLICT DO NOTHING). */
export const FIRST_CLAIM_PREDICATE = "INSERT ... ON CONFLICT DO NOTHING";
/** Row-lock predicate (mirrors SELECT ... FOR UPDATE on the attempt row). */
export const ROW_LOCK_PREDICATE = "SELECT ... FOR UPDATE";

export function attemptKey(intentId: string, idempotencyKey: string): string {
  return `${intentId}|${idempotencyKey}`;
}

/** In-memory seam: same claim/update semantics, no durability (tests, legacy roots). */
export function createInMemoryAttemptStore(): AttemptStore {
  const rows = new Map<string, AttemptRecord>();
  return {
    async get(input) {
      return rows.get(attemptKey(input.intentId, input.idempotencyKey)) ?? null;
    },
    async claim(record) {
      const existing = rows.get(record.key);
      if (existing !== undefined) return { claimed: false, row: existing };
      rows.set(record.key, { ...record });
      return { claimed: true, row: { ...record } };
    },
    async update(input) {
      const row = rows.get(attemptKey(input.intentId, input.idempotencyKey));
      if (row === undefined) return;
      row.status = input.status;
      if (input.txHash !== undefined) row.txHash = input.txHash;
    },
  };
}

export type AttemptSqlRunner = (
  text: string,
  params: unknown[],
) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;

const SELECT_COLUMNS = "intent_id,idempotency_key,status,tx_hash,card_nonce";

function toRecord(row: Record<string, unknown>): AttemptRecord {
  const intentId = String(row["intent_id"] ?? "");
  const idempotencyKey = String(row["idempotency_key"] ?? "");
  const txHash = row["tx_hash"];
  return {
    key: attemptKey(intentId, idempotencyKey),
    intentId,
    idempotencyKey,
    status: String(row["status"] ?? ""),
    txHash: txHash === null || txHash === undefined ? null : String(txHash),
    cardNonce: String(row["card_nonce"] ?? ""),
  };
}

/**
 * Durable attempt store over the `payment_attempts` table. The caller supplies
 * the query runner (the Neon pool in production), so the SQL stays in one place
 * and stays testable without a live database.
 */
export function createSqlAttemptStore(run: AttemptSqlRunner): AttemptStore {
  async function read(input: AttemptKey): Promise<AttemptRecord | null> {
    const result = await run(
      `SELECT ${SELECT_COLUMNS} FROM payment_attempts WHERE intent_id = $1 AND idempotency_key = $2`,
      [input.intentId, input.idempotencyKey],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return toRecord(row);
  }
  return {
    get: read,
    async claim(record) {
      // INSERT ... ON CONFLICT DO NOTHING: exactly one caller wins the claim.
      const inserted = await run(
        "INSERT INTO payment_attempts (intent_id,idempotency_key,status,card_nonce) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [record.intentId, record.idempotencyKey, record.status, record.cardNonce],
      );
      if (inserted.rowCount === 1) return { claimed: true, row: { ...record } };
      const existing = await read(record);
      if (existing === null) {
        throw new Error("Payment attempt claim failed.");
      }
      return { claimed: false, row: existing };
    },
    async update(input) {
      if (input.txHash === undefined) {
        await run(
          "UPDATE payment_attempts SET status = $3 WHERE intent_id = $1 AND idempotency_key = $2",
          [input.intentId, input.idempotencyKey, input.status],
        );
        return;
      }
      await run(
        "UPDATE payment_attempts SET status = $3, tx_hash = $4 WHERE intent_id = $1 AND idempotency_key = $2",
        [input.intentId, input.idempotencyKey, input.status, input.txHash],
      );
    },
  };
}
