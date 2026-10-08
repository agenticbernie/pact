/**
 * Phase 05 cursor + event store.
 *
 * Two implementations over one interface:
 * - `createSqlCursorStore` — Postgres (Neon adapter / local compose db). Every
 *   user value travels in `params` ($1 placeholders); query text is static.
 *   Upsert is `ON CONFLICT DO NOTHING RETURNING id`, so a replayed log reports
 *   `duplicate` and writes nothing (AC-15).
 * - `createMemoryCursorStore` — in-process store for tests and one-shot runs.
 *
 * The cursor and the events live in the same store so a tick can persist a
 * whole range and only then advance `next_block`.
 */
import type { CursorStore, DecodedPactEvent, IndexerCursor, UpsertResult } from "./types.ts";

export type IndexerQueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

export type IndexerQueryFn = (text: string, params: unknown[]) => Promise<IndexerQueryResult>;

const LOAD_SQL =
  "select chain_id, next_block, latest_confirmed_block, latest_block_hash from indexer_state where chain_id = $1";

const SAVE_SQL =
  "insert into indexer_state (chain_id, next_block, latest_confirmed_block, latest_block_hash, updated_at) " +
  "values ($1, $2, $3, $4, now()) " +
  "on conflict (chain_id) do update set " +
  "next_block = excluded.next_block, " +
  "latest_confirmed_block = excluded.latest_confirmed_block, " +
  "latest_block_hash = excluded.latest_block_hash, " +
  "updated_at = now()";

const UPSERT_EVENT_SQL =
  "insert into chain_events " +
  "(chain_id, tx_hash, log_index, block_number, block_hash, contract_address, event_type, payload, payload_hash) " +
  "values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9) " +
  "on conflict (chain_id, tx_hash, log_index) do nothing returning id";

export function createSqlCursorStore(query: IndexerQueryFn): CursorStore {
  return {
    async load(chainId: number): Promise<IndexerCursor | null> {
      const result = await query(LOAD_SQL, [chainId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      const hash = row["latest_block_hash"];
      return {
        chainId,
        nextBlock: BigInt(String(row["next_block"])),
        latestConfirmedBlock: BigInt(String(row["latest_confirmed_block"])),
        ...(hash === null || hash === undefined ? {} : { latestBlockHash: String(hash) }),
      };
    },

    async save(cursor: IndexerCursor): Promise<void> {
      await query(SAVE_SQL, [
        cursor.chainId,
        cursor.nextBlock.toString(),
        cursor.latestConfirmedBlock.toString(),
        cursor.latestBlockHash ?? null,
      ]);
    },

    async upsertEvent(event: DecodedPactEvent): Promise<UpsertResult> {
      const result = await query(UPSERT_EVENT_SQL, [
        event.chainId,
        event.txHash,
        event.logIndex,
        event.blockNumber.toString(),
        event.blockHash,
        event.contractAddress,
        event.eventType,
        JSON.stringify(event.payload),
        event.payloadHash,
      ]);
      return result.rows.length > 0 ? "inserted" : "duplicate";
    },
  };
}

export type MemoryCursorStore = CursorStore & {
  events(): readonly DecodedPactEvent[];
};

export function createMemoryCursorStore(seed?: IndexerCursor): MemoryCursorStore {
  let cursor: IndexerCursor | null = seed ?? null;
  const eventMap = new Map<string, DecodedPactEvent>();
  const keyOf = (event: DecodedPactEvent): string =>
    `${event.chainId}:${event.txHash}:${event.logIndex}`;

  return {
    async load(): Promise<IndexerCursor | null> {
      return cursor;
    },
    async save(next: IndexerCursor): Promise<void> {
      cursor = next;
    },
    async upsertEvent(event: DecodedPactEvent): Promise<UpsertResult> {
      const key = keyOf(event);
      if (eventMap.has(key)) return "duplicate";
      eventMap.set(key, event);
      return "inserted";
    },
    events(): readonly DecodedPactEvent[] {
      return [...eventMap.values()];
    },
  };
}
