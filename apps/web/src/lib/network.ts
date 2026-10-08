/**
 * Arc testnet constants the console needs to talk to a wallet.
 *
 * Chain id, contract addresses and the explorer come from the live read API
 * (`/v1/config`); the two values here are the wallet-facing ones the config does
 * not carry, mirrored from the committed network manifest
 * (`config/networks/arc-testnet.json`, `rpcUrl`) so no value is invented at
 * runtime. Change them only when that manifest changes.
 */

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.io";
export const ARC_TESTNET_NAME = "Arc Testnet";

/** EIP-1193 / EIP-3085 want the chain id as a 0x-prefixed hex quantity. */
export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}
