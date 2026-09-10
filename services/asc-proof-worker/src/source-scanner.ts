export interface LogProvider {
  getBlockNumber(): Promise<number>;
  getLogs(fromBlock: number, toBlock: number): Promise<unknown[]>;
}

export interface ScanOptions {
  fromBlock: number;
  maxRange?: number;
  onEvent: (event: unknown) => void | Promise<void>;
}

/**
 * Bounded source-chain scan. Ranges never exceed `maxRange` blocks (hosted
 * Sepolia RPCs cap `eth_getLogs`); a failing range halves until it passes,
 * and a single bad block is skipped rather than retried forever.
 * Returns the next cursor (last scanned block + 1).
 */
export async function scanNewEvents(
  provider: LogProvider,
  options: ScanOptions,
): Promise<number> {
  const maxRange = options.maxRange ?? 50;
  const current = await provider.getBlockNumber();
  if (current < options.fromBlock) {
    return options.fromBlock;
  }
  let start = options.fromBlock;
  let size = maxRange;
  while (start <= current) {
    const end = Math.min(start + size - 1, current);
    try {
      const logs = await provider.getLogs(start, end);
      for (const log of logs) {
        await options.onEvent(log);
      }
      start = end + 1;
      size = maxRange;
    } catch {
      if (size > 1) {
        size = Math.max(1, Math.floor(size / 2));
      } else {
        start = end + 1;
        size = maxRange;
      }
    }
  }
  return current + 1;
}
