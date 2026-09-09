import { describe, expect, it } from "vitest";
import { scanNewEvents } from "../src/source-scanner.js";

function stubProvider(logsByRange: Array<{ from: number; to: number; logs: unknown[] }>, failRanges: number[] = []) {
  const calls: Array<{ from: number; to: number }> = [];
  return {
    calls,
    getBlockNumber: () => Promise.resolve(120),
    getLogs: (from: number, to: number) => {
      calls.push({ from, to });
      if (failRanges.includes(from)) {
        return Promise.reject(new Error("range too large"));
      }
      const found = logsByRange.find((entry) => entry.from === from && entry.to === to);
      return Promise.resolve(found ? found.logs : []);
    },
  };
}

describe("source scanner", () => {
  it("scans in bounded 50-block chunks", async () => {
    const provider = stubProvider([]);
    const cursor = await scanNewEvents(provider, { fromBlock: 21, maxRange: 50, onEvent: () => {} });
    expect(cursor).toBe(121);
    for (const call of provider.calls) {
      expect(call.to - call.from + 1 <= 50).toBe(true);
    }
    expect(provider.calls[0]).toEqual({ from: 21, to: 70 });
  });

  it("halves the range on provider error and continues", async () => {
    const provider = stubProvider([], [21]);
    const cursor = await scanNewEvents(provider, { fromBlock: 21, maxRange: 50, onEvent: () => {} });
    expect(cursor).toBe(121);
    expect(provider.calls).toContainEqual({ from: 21, to: 45 });
  });

  it("delivers decoded events to the handler", async () => {
    const seen: unknown[] = [];
    const provider = stubProvider([{ from: 21, to: 70, logs: [{ tx: "0xabc" }] }]);
    await scanNewEvents(provider, {
      fromBlock: 21,
      maxRange: 50,
      onEvent: (event) => {
        seen.push(event);
      },
    });
    expect(seen).toEqual([{ tx: "0xabc" }]);
  });
});
