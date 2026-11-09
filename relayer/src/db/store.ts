/**
 * Pact Protocol — Persistent SQLite Intent & Quote State Store (NFR-03)
 * Lifecycle: CREATED ──► DISPATCHED ──► SETTLED ──► CLAIMED (or REFUNDED)
 */
import path from "node:path";
import { createRequire } from "node:module";
import {
  Priority,
  computeHashLock,
  FALLBACK_DEMO_SECRET,
  type IntentLifecycleState,
  type StoredIntentRecord,
  type StoredQuoteRecord,
} from "../types/pact.js";

const require = createRequire(import.meta.url);

interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

export class RelayerStore {
  private db: SqliteDatabase;

  constructor(dbFilePath?: string) {
    const resolvedPath =
      dbFilePath ||
      process.env.RELAYER_DB_PATH ||
      path.resolve(process.cwd(), "pact_relayer.db");
    this.db = new DatabaseSync(resolvedPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS quotes (
        hash_lock TEXT PRIMARY KEY,
        secret TEXT NOT NULL,
        order_id TEXT,
        merchant TEXT,
        target_chain_id INTEGER,
        amount_atomic TEXT,
        lightning_fee_atomic TEXT NOT NULL,
        economy_fee_atomic TEXT NOT NULL,
        deadline INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON quotes(order_id);

      CREATE TABLE IF NOT EXISTS intents (
        intent_id TEXT PRIMARY KEY,
        order_id TEXT,
        sender TEXT NOT NULL,
        token_in TEXT NOT NULL,
        amount_in TEXT NOT NULL,
        fee_paid TEXT NOT NULL,
        target_chain_id INTEGER NOT NULL,
        receiver TEXT NOT NULL,
        token_out TEXT NOT NULL,
        priority INTEGER NOT NULL,
        hash_lock TEXT NOT NULL,
        secret TEXT,
        deadline INTEGER NOT NULL,
        state TEXT NOT NULL,
        source_tx_hash TEXT,
        source_block_number INTEGER,
        dest_tx_hash TEXT,
        claim_tx_hash TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_intents_state ON intents(state);
      CREATE INDEX IF NOT EXISTS idx_intents_order_id ON intents(order_id);
      CREATE INDEX IF NOT EXISTS idx_intents_hash_lock ON intents(hash_lock);

      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS passkeys (
        authenticator_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        rp_id TEXT NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    // Seed deterministic fallback secret for standalone CLI/Foundry tests (phase0_spec_lock.md §3.2)
    const fallbackSecret = process.env.PACT_FALLBACK_SECRET || FALLBACK_DEMO_SECRET;
    const fallbackHashLock = computeHashLock(fallbackSecret).toLowerCase();
    const nowSec = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO quotes (
          hash_lock, secret, order_id, merchant, target_chain_id,
          amount_atomic, lightning_fee_atomic, economy_fee_atomic, deadline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fallbackHashLock,
        fallbackSecret,
        "demo-fallback",
        null,
        null,
        null,
        "10500",
        "5000",
        nowSec + 86400 * 365,
        nowSec
      );
  }

  public saveQuote(quote: {
    hashLock: `0x${string}`;
    secret: string;
    orderId?: string | null;
    merchant?: string | null;
    targetChainId?: number | null;
    amountAtomic?: string | null;
    lightningFeeAtomic: string;
    economyFeeAtomic: string;
    deadline: number;
  }): StoredQuoteRecord {
    const createdAt = Math.floor(Date.now() / 1000);
    const normalizedHashLock = quote.hashLock.toLowerCase() as `0x${string}`;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO quotes (
          hash_lock, secret, order_id, merchant, target_chain_id,
          amount_atomic, lightning_fee_atomic, economy_fee_atomic, deadline, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        normalizedHashLock,
        quote.secret,
        quote.orderId ?? null,
        quote.merchant ?? null,
        quote.targetChainId ?? null,
        quote.amountAtomic ?? null,
        quote.lightningFeeAtomic,
        quote.economyFeeAtomic,
        quote.deadline,
        createdAt
      );

    return {
      hash_lock: normalizedHashLock,
      secret: quote.secret,
      order_id: quote.orderId ?? null,
      merchant: quote.merchant ?? null,
      target_chain_id: quote.targetChainId ?? null,
      amount_atomic: quote.amountAtomic ?? null,
      lightning_fee_atomic: quote.lightningFeeAtomic,
      economy_fee_atomic: quote.economyFeeAtomic,
      deadline: quote.deadline,
      created_at: createdAt,
    };
  }

  public getQuoteByHashLock(hashLock: string): StoredQuoteRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM quotes WHERE hash_lock = ?`)
      .get(hashLock.toLowerCase()) as StoredQuoteRecord | undefined;
    return row ?? null;
  }

  public resolveSecretForHashLock(hashLock: string): { secret: string | null; orderId: string | null } {
    const quote = this.getQuoteByHashLock(hashLock);
    if (quote) {
      return { secret: quote.secret, orderId: quote.order_id };
    }
    const fallbackSecret = process.env.PACT_FALLBACK_SECRET || FALLBACK_DEMO_SECRET;
    if (computeHashLock(fallbackSecret).toLowerCase() === hashLock.toLowerCase()) {
      return { secret: fallbackSecret, orderId: null };
    }
    return { secret: null, orderId: null };
  }

  public upsertIntentFromEvent(params: {
    intentId: `0x${string}`;
    sender: `0x${string}`;
    tokenIn: `0x${string}`;
    amountIn: bigint;
    feePaid: bigint;
    targetChainId: number;
    receiver: `0x${string}`;
    tokenOut: `0x${string}`;
    priority: Priority;
    hashLock: `0x${string}`;
    deadline: number;
    sourceTxHash?: `0x${string}` | null;
    sourceBlockNumber?: number | null;
  }): { record: StoredIntentRecord; isNew: boolean } {
    const normalizedId = params.intentId.toLowerCase() as `0x${string}`;
    const existing = this.getIntentById(normalizedId);
    if (existing) {
      return { record: existing, isNew: false };
    }

    const nowMs = Date.now();
    const normalizedHashLock = params.hashLock.toLowerCase() as `0x${string}`;
    const { secret, orderId } = this.resolveSecretForHashLock(normalizedHashLock);

    this.db
      .prepare(
        `INSERT INTO intents (
          intent_id, order_id, sender, token_in, amount_in, fee_paid,
          target_chain_id, receiver, token_out, priority, hash_lock, secret,
          deadline, state, source_tx_hash, source_block_number,
          dest_tx_hash, claim_tx_hash, error_message, retry_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, NULL, NULL, NULL, 0, ?, ?)`
      )
      .run(
        normalizedId,
        orderId,
        params.sender,
        params.tokenIn,
        params.amountIn.toString(),
        params.feePaid.toString(),
        params.targetChainId,
        params.receiver,
        params.tokenOut,
        params.priority,
        normalizedHashLock,
        secret,
        params.deadline,
        params.sourceTxHash ?? null,
        params.sourceBlockNumber ?? null,
        nowMs,
        nowMs
      );

    return { record: this.getIntentById(normalizedId)!, isNew: true };
  }

  public updateIntentState(
    intentId: string,
    state: IntentLifecycleState,
    fields?: {
      destTxHash?: `0x${string}` | null;
      claimTxHash?: `0x${string}` | null;
      secret?: string | null;
      errorMessage?: string | null;
      incrementRetry?: boolean;
    }
  ): StoredIntentRecord | null {
    const normalizedId = intentId.toLowerCase();
    const existing = this.getIntentById(normalizedId);
    if (!existing) return null;

    const updatedAt = Date.now();
    const destTxHash = fields?.destTxHash !== undefined ? fields.destTxHash : existing.dest_tx_hash;
    const claimTxHash = fields?.claimTxHash !== undefined ? fields.claimTxHash : existing.claim_tx_hash;
    const secret = fields?.secret !== undefined ? fields.secret : existing.secret;
    const errorMessage = fields?.errorMessage !== undefined ? fields.errorMessage : existing.error_message;
    const retryCount = fields?.incrementRetry ? existing.retry_count + 1 : existing.retry_count;

    this.db
      .prepare(
        `UPDATE intents
         SET state = ?, dest_tx_hash = ?, claim_tx_hash = ?, secret = ?,
             error_message = ?, retry_count = ?, updated_at = ?
         WHERE intent_id = ?`
      )
      .run(state, destTxHash, claimTxHash, secret, errorMessage, retryCount, updatedAt, normalizedId);

    return this.getIntentById(normalizedId);
  }

  public getIntentById(intentId: string): StoredIntentRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM intents WHERE intent_id = ?`)
      .get(intentId.toLowerCase()) as StoredIntentRecord | undefined;
    return row ?? null;
  }

  public getIntentByOrderId(orderId: string): StoredIntentRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM intents WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(orderId) as StoredIntentRecord | undefined;
    return row ?? null;
  }

  public getRecoverableIntents(): StoredIntentRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM intents
         WHERE state IN ('CREATED', 'DISPATCHED', 'SETTLED')
         ORDER BY created_at ASC`
      )
      .all() as StoredIntentRecord[];
  }

  /** Economy (COST) intents still waiting for their batch window, oldest first. */
  public getQueuedEconomyIntents(): StoredIntentRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM intents
         WHERE state = 'CREATED' AND priority = 1
         ORDER BY created_at ASC`
      )
      .all() as StoredIntentRecord[];
  }

  public listRecentIntents(limit = 25): StoredIntentRecord[] {
    return this.db
      .prepare(`SELECT * FROM intents ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as StoredIntentRecord[];
  }

  public getStateCounts(): Record<IntentLifecycleState, number> {
    const rows = this.db
      .prepare(`SELECT state, COUNT(*) as count FROM intents GROUP BY state`)
      .all() as Array<{ state: IntentLifecycleState; count: number }>;

    const counts: Record<IntentLifecycleState, number> = {
      CREATED: 0,
      DISPATCHED: 0,
      SETTLED: 0,
      CLAIMED: 0,
      REFUNDED: 0,
    };
    for (const r of rows) {
      if (r.state in counts) {
        counts[r.state] = Number(r.count);
      }
    }
    return counts;
  }

  public getLastIndexedBlock(): bigint | null {
    const row = this.db
      .prepare(`SELECT value FROM sync_state WHERE key = 'last_indexed_fuji_block'`)
      .get() as { value: string } | undefined;
    return row ? BigInt(row.value) : null;
  }

  public setLastIndexedBlock(blockNumber: bigint): void {
    this.db
      .prepare(`INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_indexed_fuji_block', ?)`)
      .run(blockNumber.toString());
  }

  public savePasskey(params: {
    authenticatorId: string;
    userId: string;
    username: string;
    rpId: string;
    pubkey: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO passkeys (
          authenticator_id, user_id, username, rp_id, pubkey, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.authenticatorId,
        params.userId,
        params.username,
        params.rpId,
        params.pubkey,
        Math.floor(Date.now() / 1000)
      );
  }

  public getPasskeyByAuthenticatorId(authenticatorId: string): {
    authenticator_id: string;
    user_id: string;
    username: string;
    rp_id: string;
    pubkey: string;
  } | null {
    const row = this.db
      .prepare(`SELECT * FROM passkeys WHERE authenticator_id = ?`)
      .get(authenticatorId) as
      | {
          authenticator_id: string;
          user_id: string;
          username: string;
          rp_id: string;
          pubkey: string;
        }
      | undefined;
    return row ?? null;
  }

  public close(): void {
    this.db.close();
  }
}
