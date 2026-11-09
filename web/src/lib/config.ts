import { type Address } from "viem";

export const PACT_CONFIG = {
  relayerApiUrl: process.env.NEXT_PUBLIC_RELAYER_API_URL || "http://localhost:4000",
  fuji: {
    chainId: 43113,
    name: "Avalanche Fuji",
    rpc: "https://avalanche-fuji-c-chain-rpc.publicnode.com",
    pactEscrow: (process.env.NEXT_PUBLIC_PACT_ESCROW_FUJI ||
      "0xAeC6Ee71648dAe7469Ae591709D9b023147e2ba5") as Address,
    mockUsdc: (process.env.NEXT_PUBLIC_MOCK_USDC_FUJI ||
      "0x937408C5194bb6885fB51ab4607575c52524933E") as Address,
    batchDispatcher: "0x708351ff8967b47470c53af7CF593923c9B1E350" as Address,
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    mockUsdc: (process.env.NEXT_PUBLIC_MOCK_USDC_ARB_SEPOLIA ||
      "0xEFf5284031D5bA06AA2E5b77e27F97934dC12708") as Address,
    batchDispatcher: "0x2d29dAc762d43B036eDe889d3D18fF1fBA553878" as Address,
  },
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    mockUsdc: (process.env.NEXT_PUBLIC_MOCK_USDC_BASE_SEPOLIA ||
      "0xEFf5284031D5bA06AA2E5b77e27F97934dC12708") as Address,
    batchDispatcher: "0x937408C5194bb6885fB51ab4607575c52524933E" as Address,
  },
} as const;

export function getChainName(chainId: number): string {
  if (chainId === 421614) return "Arbitrum Sepolia";
  if (chainId === 84532) return "Base Sepolia";
  if (chainId === 43113) return "Avalanche Fuji";
  return `Chain ${chainId}`;
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  if (chainId === 43113) return `https://testnet.snowtrace.io/tx/${txHash}`;
  if (chainId === 421614) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  return `https://testnet.snowtrace.io/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  if (chainId === 43113) return `https://testnet.snowtrace.io/address/${address}`;
  if (chainId === 421614) return `https://sepolia.arbiscan.io/address/${address}`;
  if (chainId === 84532) return `https://sepolia.basescan.org/address/${address}`;
  return `https://testnet.snowtrace.io/address/${address}`;
}
