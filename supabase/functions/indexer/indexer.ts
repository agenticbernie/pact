/**
 * Phase 05 indexer tick.
 *
 * One tick = scan the next confirmed block range, decode known events, upsert
 * them idempotently (and, when a `projector` is supplied, apply the derived
 * card projection), and ONLY THEN advance the cursor. Guarantees:
 *
 * - confirms before indexing: never scans past `latestBlock - confirmations`.
 * - idempotent replay: uniqueness is (chainId, txHash, logIndex); a replayed
 *   range reports `duplicate` and writes nothing.
 * - crash/RPC-outage safe: any reader or store failure propagates and the
 *   cursor is left untouched, so the next tick reprocesses the same range.
 * - reorg aware: if the parent of `nextBlock` no longer matches the stored
 *   hash, the cursor rewinds by the configured window and the tick does not
 *   advance (reprocessing is safe because upserts dedupe).
 */
import type { CardProjector } from "./card-projection.ts";
import type {
  ChainReader,
  CursorStore,
  IndexerCursor,
  IndexerTickResult,
  PactEventDecoder,
} from "./types.ts";

export const DEFAULT_CONFIRMATIONS = 1;
export const DEFAULT_MAX_RANGE = 2000;
export const DEFAULT_REORG_WINDOW = 12;

export type IndexerTickInput = {
  chainId: number;
  reader: ChainReader;
  store: CursorStore;
  decoder: PactEventDecoder;
  /**
   * Optional card projection: applied for every decoded event (idempotent and
   * monotonic), so a crash between the ledger write and the projection self-heals
   * on the next replay instead of losing the card row forever.
   */
  projector?: CardProjector;
  confirmations?: number;
  maxRange?: number;
  reorgWindow?: number;
};

export async function runIndexerTick(input: IndexerTickInput): Promise<IndexerTickResult> {
  const confirmations = input.confirmations ?? DEFAULT_CONFIRMATIONS;
  const maxRange = BigInt(input.maxRange ?? DEFAULT_MAX_RANGE);
  const reorgWindow = BigInt(input.reorgWindow ?? DEFAULT_REORG_WINDOW);

  const latest = await input.reader.latestBlock();
  const behind = latest - BigInt(confirmations);
  const confirmed = behind < 0n ? 0n : behind;

  const existing = await input.store.load(input.chainId);
  const cursor: IndexerCursor = existing ?? {
    chainId: input.chainId,
    nextBlock: confirmed,
    latestConfirmedBlock: confirmed,
  };

  // Reorg check: the parent of nextBlock must still match what we recorded.
  const startBlock = cursor.nextBlock;
  if (cursor.latestBlockHash !== undefined && startBlock > 0n) {
    const observed = await input.reader.getBlockHash(startBlock - 1n);
    if (observed !== null && observed.toLowerCase() !== cursor.latestBlockHash.toLowerCase()) {
      const rewound = startBlock - reorgWindow;
      const rewoundTo = rewound < 0n ? 0n : rewound;
      await input.store.save({
        chainId: input.chainId,
        nextBlock: rewoundTo,
        latestConfirmedBlock: confirmed,
      });
      return {
        advanced: false,
        nextBlock: rewoundTo,
        latestConfirmedBlock: confirmed,
        inserted: 0,
        duplicates: 0,
        ignored: 0,
        reorgRewind: true,
      };
    }
  }

  if (startBlock > confirmed) {
    await input.store.save({ ...cursor, latestConfirmedBlock: confirmed });
    return {
      advanced: false,
      nextBlock: startBlock,
      latestConfirmedBlock: confirmed,
      inserted: 0,
      duplicates: 0,
      ignored: 0,
      reorgRewind: false,
    };
  }

  const upper = startBlock + maxRange - 1n;
  const toBlock = upper < confirmed ? upper : confirmed;

  const logs = await input.reader.getLogs(startBlock, toBlock);

  let inserted = 0;
  let duplicates = 0;
  let ignored = 0;
  for (const log of logs) {
    const decoded = input.decoder.decode(log);
    if (decoded === null) {
      ignored += 1;
      continue;
    }
    const result = await input.store.upsertEvent(decoded);
    if (result === "inserted") inserted += 1;
    else duplicates += 1;
    if (input.projector !== undefined) await input.projector.project(decoded);
  }

  const blockHash = await input.reader.getBlockHash(toBlock);
  const nextBlock = toBlock + 1n;
  await input.store.save({
    chainId: input.chainId,
    nextBlock,
    latestConfirmedBlock: confirmed,
    ...(blockHash === null ? {} : { latestBlockHash: blockHash }),
  });

  return {
    advanced: true,
    nextBlock,
    latestConfirmedBlock: confirmed,
    inserted,
    duplicates,
    ignored,
    reorgRewind: false,
  };
}
