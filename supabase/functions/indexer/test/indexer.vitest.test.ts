import { describe, expect, it } from "vitest";
import { Interface } from "ethers";
import { PACT_ABI } from "../../../../packages/pact-sdk/src/abi.ts";
import { createPactEventDecoder } from "../event-decoder.ts";
import { createMemoryCursorStore } from "../cursor-store.ts";
import { runIndexerTick } from "../indexer.ts";
import type { ChainLog, ChainReader, DecodedPactEvent } from "../types.ts";

const CHAIN_ID = 5042002;
const CONTROLLER = "0x7a474c005433def5fc496d2016f6ae794edfc423";
const POOL = "0x5e1771de29bd1a084900d032fd4db2ac7c7528b";
const MERCHANT = "0xac030ddaa1fc29c1738332c3b9524ecfd0b4174f";

const decoder = createPactEventDecoder({
  chainId: CHAIN_ID,
  addresses: { controller: CONTROLLER, pool: POOL, merchant: MERCHANT },
});

function paymentSettledLog(): ChainLog {
  const iface = new Interface(PACT_ABI.controller);
  const fragment = iface.getEvent("PaymentSettled");
  if (fragment === null) throw new Error("missing PaymentSettled");
  const encoded = iface.encodeEventLog(fragment, [
    1n,
    "0x" + "11".repeat(32),
    5n,
    7n,
    "0x" + "22".repeat(32),
  ]);
  return {
    address: CONTROLLER,
    topics: encoded.topics,
    data: encoded.data,
    blockNumber: 90n,
    blockHash: "0x" + "ab".repeat(32),
    transactionHash: "0x" + "cd".repeat(32),
    logIndex: 0,
  };
}

function unknownLog(): ChainLog {
  return {
    address: CONTROLLER,
    topics: ["0x" + "ff".repeat(32)],
    data: "0x",
    blockNumber: 90n,
    blockHash: "0x" + "ab".repeat(32),
    transactionHash: "0x" + "ee".repeat(32),
    logIndex: 1,
  };
}

function reader(input: {
  latest: bigint;
  logs?: readonly ChainLog[];
  hashes?: Record<string, string>;
  failLogs?: boolean;
}): ChainReader {
  return {
    async latestBlock() {
      return input.latest;
    },
    async getLogs() {
      if (input.failLogs === true) throw new Error("rpc down");
      return input.logs ?? [];
    },
    async getBlockHash(blockNumber: bigint) {
      return input.hashes?.[blockNumber.toString()] ?? null;
    },
    async getReceipt() {
      return null;
    },
  };
}

const HASH_99 = "0x" + "ab".repeat(32);

describe("Phase 05 indexer tick", () => {
  it("indexes a confirmed event and advances the cursor", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 90n,
      latestConfirmedBlock: 90n,
    });
    const result = await runIndexerTick({
      chainId: CHAIN_ID,
      reader: reader({ latest: 100n, logs: [paymentSettledLog()], hashes: { "99": HASH_99 } }),
      store,
      decoder,
      confirmations: 1,
      maxRange: 5000,
    });
    expect(result.advanced).toBe(true);
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.nextBlock).toBe(100n);
    const cursor = await store.load(CHAIN_ID);
    expect(cursor?.nextBlock).toBe(100n);
    expect(cursor?.latestBlockHash).toBe(HASH_99);
    expect(store.events()).toHaveLength(1);
  });

  it("replays the same range with zero duplicates (AC-15)", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 90n,
      latestConfirmedBlock: 90n,
    });
    const tickInput = {
      chainId: CHAIN_ID,
      reader: reader({ latest: 100n, logs: [paymentSettledLog()], hashes: { "99": HASH_99 } }),
      store,
      decoder,
      confirmations: 1,
      maxRange: 5000,
    };
    const first = await runIndexerTick(tickInput);
    expect(first.inserted).toBe(1);

    // Re-point the cursor at the same range: a replay must dedupe.
    await store.save({ chainId: CHAIN_ID, nextBlock: 90n, latestConfirmedBlock: 99n });
    const second = await runIndexerTick(tickInput);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(store.events()).toHaveLength(1);
  });

  it("does not advance the cursor when the RPC fails mid-range", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 90n,
      latestConfirmedBlock: 90n,
    });
    await expect(
      runIndexerTick({
        chainId: CHAIN_ID,
        reader: reader({ latest: 100n, failLogs: true }),
        store,
        decoder,
        confirmations: 1,
        maxRange: 5000,
      }),
    ).rejects.toThrow("rpc down");
    const cursor = await store.load(CHAIN_ID);
    expect(cursor?.nextBlock).toBe(90n);
  });

  it("rewinds on a block-hash mismatch without advancing", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 100n,
      latestConfirmedBlock: 100n,
      latestBlockHash: "0x" + "aa".repeat(32),
    });
    const result = await runIndexerTick({
      chainId: CHAIN_ID,
      reader: reader({ latest: 120n, hashes: { "99": HASH_99 } }),
      store,
      decoder,
      confirmations: 1,
      maxRange: 5000,
      reorgWindow: 12,
    });
    expect(result.reorgRewind).toBe(true);
    expect(result.advanced).toBe(false);
    expect(result.nextBlock).toBe(88n);
  });

  it("projects every decoded event, including a replay", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 90n,
      latestConfirmedBlock: 90n,
    });
    const projected: string[] = [];
    const projector = {
      async project(event: DecodedPactEvent): Promise<void> {
        projected.push(event.eventType);
      },
    };
    const tickInput = {
      chainId: CHAIN_ID,
      reader: reader({ latest: 100n, logs: [paymentSettledLog()], hashes: { "99": HASH_99 } }),
      store,
      decoder,
      projector,
      confirmations: 1,
      maxRange: 5000,
    };
    await runIndexerTick(tickInput);
    // Re-point the cursor and replay: projection is idempotent, so it re-runs.
    await store.save({ chainId: CHAIN_ID, nextBlock: 90n, latestConfirmedBlock: 99n });
    await runIndexerTick(tickInput);
    expect(projected).toEqual(["PaymentSettled", "PaymentSettled"]);
  });

  it("ignores unknown events in the range", async () => {
    const store = createMemoryCursorStore({
      chainId: CHAIN_ID,
      nextBlock: 90n,
      latestConfirmedBlock: 90n,
    });
    const result = await runIndexerTick({
      chainId: CHAIN_ID,
      reader: reader({ latest: 100n, logs: [unknownLog()], hashes: { "99": HASH_99 } }),
      store,
      decoder,
      confirmations: 1,
      maxRange: 5000,
    });
    expect(result.ignored).toBe(1);
    expect(result.inserted).toBe(0);
    expect(store.events()).toHaveLength(0);
  });
});
