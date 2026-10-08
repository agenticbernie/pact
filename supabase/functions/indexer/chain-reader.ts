/**
 * Phase 05 chain reader (ethers v6 over JSON-RPC).
 *
 * Read-only: `getLogs`, `getBlockHash`, `getReceipt`, block height. No signer,
 * no broadcast, no transaction path — the indexer can never move value.
 *
 * `getLogs` is address-filtered to the allowlisted Pact/ASC contracts, so the
 * node does the coarse filtering and the decoder does the authoritative
 * allowlist check on top.
 */
import { JsonRpcProvider } from "ethers";
import type { ChainLog, ChainReader } from "./types.ts";

export type EthersChainReaderInput = {
  rpcUrl: string;
  chainId: number;
  addresses: readonly string[];
};

export function createEthersChainReader(input: EthersChainReaderInput): ChainReader {
  if (input.rpcUrl.trim().length === 0) {
    throw new Error("RPC URL is required to build a chain reader.");
  }
  const provider = new JsonRpcProvider(input.rpcUrl, input.chainId, { staticNetwork: true });
  const addresses = input.addresses.map((address) => address.toLowerCase());

  return {
    async latestBlock(): Promise<bigint> {
      return BigInt(await provider.getBlockNumber());
    },

    async getLogs(fromBlock: bigint, toBlock: bigint): Promise<readonly ChainLog[]> {
      const logs = await provider.getLogs({
        address: [...addresses],
        fromBlock: Number(fromBlock),
        toBlock: Number(toBlock),
      });
      return logs.map((log) => ({
        address: log.address.toLowerCase(),
        topics: [...log.topics],
        data: log.data,
        blockNumber: BigInt(log.blockNumber),
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        logIndex: log.index,
        removed: false,
      }));
    },

    async getBlockHash(blockNumber: bigint): Promise<string | null> {
      const block = await provider.getBlock(Number(blockNumber));
      return block === null ? null : block.hash;
    },

    async getReceipt(txHash: string): Promise<{ status: 0 | 1; blockNumber?: number } | null> {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt === null) return null;
      return {
        status: receipt.status === 1 ? 1 : 0,
        blockNumber: receipt.blockNumber,
      };
    },
  };
}
