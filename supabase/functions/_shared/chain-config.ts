/**
 * Regional chain configuration (target chain ID for local tests).
 * Provider live access is separately gated; this file holds routing/chain
 * identity only, never secrets.
 */

export const TARGET_CHAIN_ID = 102031;

export const TARGET_CHAIN_LABEL = "advance-testnet";

export function assertChainId(chainId: number): void {
  if (chainId !== TARGET_CHAIN_ID) {
    throw new Error(`chain mismatch: expected ${TARGET_CHAIN_ID}`);
  }
}
