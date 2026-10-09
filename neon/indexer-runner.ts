/**
 * Phase 05 indexer runner.
 *
 * `runIndexerTick` is a pure function over injected reader/store; nothing in the
 * repo called it, so the cursor never advanced and no new CardCreated /
 * CardActivated event ever reached the read model. This runner is that caller:
 * it builds the read-only ethers reader, the SQL cursor store and the card
 * projector over the SAME `DATABASE_URL` the read API reads, then ticks on a
 * fixed interval (with a bounded catch-up loop so a backlog clears in one cycle).
 *
 * It is read-only against the chain and only writes the derived read model.
 * Disable with `PACT_INDEXER_DISABLED=1`.
 */
import { runIndexerTick } from "../supabase/functions/indexer/indexer.ts";
import { createSqlCursorStore, type IndexerQueryFn } from "../supabase/functions/indexer/cursor-store.ts";
import {
  ARC_LANE_CHAIN_ID,
  ARC_LANE_CONTROLLER,
  ARC_LANE_MERCHANT,
  ARC_LANE_POOL,
} from "../supabase/functions/_shared/lane-config.ts";
import { createSqlCardProjector } from "../supabase/functions/indexer/card-projection.ts";
import { createEthersChainReader } from "../supabase/functions/indexer/chain-reader.ts";
import { createPactEventDecoder } from "../supabase/functions/indexer/event-decoder.ts";
import { createNeonPool } from "./adapter/neon-persistence.ts";

export const DEFAULT_INDEXER_INTERVAL_MS = 15_000;
export const DEFAULT_INDEXER_MAX_RANGE = 2000;
/** Ranges scanned per cycle before sleeping, so a long backlog still clears. */
const MAX_TICKS_PER_CYCLE = 60;

export type IndexerRunnerOptions = {
  databaseUrl: string;
  rpcUrl: string;
  chainId?: number;
  controller?: string;
  pool?: string;
  merchant?: string;
  intervalMs?: number;
  maxRange?: number;
  confirmations?: number;
  log?: (message: string) => void;
};

export type IndexerRunner = {
  /** Run ticks until caught up (or the per-cycle budget is spent). */
  runOnce(): Promise<void>;
  /** Immediate catch-up then a fixed interval; returns a stop function. */
  start(): () => void;
};

export function createIndexerRunner(options: IndexerRunnerOptions): IndexerRunner {
  const chainId = options.chainId ?? ARC_LANE_CHAIN_ID;
  const controller = options.controller ?? ARC_LANE_CONTROLLER;
  const poolAddress = options.pool ?? ARC_LANE_POOL;
  const merchant = options.merchant ?? ARC_LANE_MERCHANT;
  const intervalMs = options.intervalMs ?? DEFAULT_INDEXER_INTERVAL_MS;
  const maxRange = options.maxRange ?? DEFAULT_INDEXER_MAX_RANGE;
  const log = options.log ?? ((message: string) => console.log(`[indexer] ${message}`));

  const pool = createNeonPool(options.databaseUrl);
  const query: IndexerQueryFn = (text, params) => pool.query(text, params);
  const store = createSqlCursorStore(query);
  const projector = createSqlCardProjector(query);
  const decoder = createPactEventDecoder({
    chainId,
    addresses: { controller, pool: poolAddress, merchant },
  });
  const reader = createEthersChainReader({
    rpcUrl: options.rpcUrl,
    chainId,
    addresses: [controller, poolAddress, merchant],
  });

  async function runOnce(): Promise<void> {
    for (let i = 0; i < MAX_TICKS_PER_CYCLE; i += 1) {
      const result = await runIndexerTick({
        chainId,
        reader,
        store,
        decoder,
        projector,
        maxRange,
        ...(options.confirmations === undefined ? {} : { confirmations: options.confirmations }),
      });
      if (result.inserted > 0 || result.duplicates > 0) {
        log(
          `block ${result.nextBlock} (+${result.inserted} new, ${result.duplicates} replay, ${result.ignored} ignored)`,
        );
      }
      // Not advanced => at the confirmed head, or waiting on a reorg rewind.
      if (!result.advanced) return;
    }
    log(`catch-up budget (${MAX_TICKS_PER_CYCLE} ranges) exhausted; continuing next cycle`);
  }

  function start(): () => void {
    let stopped = false;
    const cycle = (): void => {
      if (stopped) return;
      runOnce().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "unknown error";
        log(`tick failed: ${message}`);
      });
    };
    cycle();
    const timer = setInterval(cycle, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  return { runOnce, start };
}

/** Start the runner from environment variables; no-op when config is missing. */
export function startIndexerFromEnv(env: Record<string, string | undefined>): (() => void) | null {
  if (env["PACT_INDEXER_DISABLED"] === "1") return null;
  const databaseUrl = env["DATABASE_URL"];
  const rpcUrl = env["ARC_RPC_URL"];
  if (databaseUrl === undefined || databaseUrl.length === 0) return null;
  if (rpcUrl === undefined || rpcUrl.length === 0) return null;
  return createIndexerRunner({ databaseUrl, rpcUrl }).start();
}
