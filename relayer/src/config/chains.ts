import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji, arbitrumSepolia, baseSepolia } from "viem/chains";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "contracts/.env") });
dotenv.config();

interface DeploymentsJson {
  networks: {
    avalancheFuji: { contracts: { PactEscrow: Address; MockUSDC: Address } };
    arbitrumSepolia: { contracts: { MockUSDC: Address; PactBatchDispatcher?: Address } };
    baseSepolia: { contracts: { MockUSDC: Address; PactBatchDispatcher?: Address } };
  };
}

function loadDeployments(): DeploymentsJson {
  const filePath = path.join(rootDir, "shared", "deployments.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as DeploymentsJson;
}

const deployments = loadDeployments();

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_PK = "0x0000000000000000000000000000000000000000000000000000000000000000";

function pickAddress(envVal: string | undefined, fallbackVal: Address): Address {
  if (envVal && envVal !== ZERO_ADDRESS && /^0x[a-fA-F0-9]{40}$/.test(envVal)) {
    return envVal as Address;
  }
  return fallbackVal;
}

export const CONTRACTS = {
  avalancheFuji: {
    chainId: 43113 as const,
    pactEscrow: pickAddress(
      process.env.PACT_ESCROW_FUJI,
      deployments.networks.avalancheFuji.contracts.PactEscrow
    ),
    mockUsdc: pickAddress(
      process.env.MOCK_USDC_FUJI,
      deployments.networks.avalancheFuji.contracts.MockUSDC
    ),
  },
  arbitrumSepolia: {
    chainId: 421614 as const,
    mockUsdc: pickAddress(
      process.env.MOCK_USDC_ARB_SEPOLIA,
      deployments.networks.arbitrumSepolia.contracts.MockUSDC
    ),
    batchDispatcher: pickAddress(
      process.env.PACT_BATCH_DISPATCHER_ARB_SEPOLIA,
      deployments.networks.arbitrumSepolia.contracts.PactBatchDispatcher ?? ZERO_ADDRESS
    ),
  },
  baseSepolia: {
    chainId: 84532 as const,
    mockUsdc: pickAddress(
      process.env.MOCK_USDC_BASE_SEPOLIA,
      deployments.networks.baseSepolia.contracts.MockUSDC
    ),
    batchDispatcher: pickAddress(
      process.env.PACT_BATCH_DISPATCHER_BASE_SEPOLIA,
      deployments.networks.baseSepolia.contracts.PactBatchDispatcher ?? ZERO_ADDRESS
    ),
  },
} as const;

function resolveRelayerPrivateKey(): Hex {
  const candidates = [process.env.PRIVATE_KEY, process.env.RELAYER_PRIVATE_KEY];
  for (const raw of candidates) {
    if (!raw) continue;
    const formatted = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    if (formatted !== ZERO_PK && /^0x[a-fA-F0-9]{64}$/.test(formatted)) {
      return formatted;
    }
  }
  throw new Error(
    "Missing RELAYER_PRIVATE_KEY or PRIVATE_KEY in .env. Please configure a funded testnet private key."
  );
}

export const relayerAccount = privateKeyToAccount(resolveRelayerPrivateKey());

/**
 * Multi-RPC Fallback Transport Configuration (NFR-03: >=2 public endpoints per chain)
 */
export const RPC_ENDPOINTS = {
  avalancheFuji: [
    process.env.AVALANCHE_FUJI_RPC_PRIMARY || "https://api.avax-test.network/ext/bc/C/rpc",
    process.env.AVALANCHE_FUJI_RPC_FALLBACK || "https://avalanche-fuji-c-chain-rpc.publicnode.com",
  ],
  arbitrumSepolia: [
    process.env.ARBITRUM_SEPOLIA_RPC_PRIMARY || "https://sepolia-rollup.arbitrum.io/rpc",
    process.env.ARBITRUM_SEPOLIA_RPC_FALLBACK || "https://arbitrum-sepolia-rpc.publicnode.com",
  ],
  baseSepolia: [
    process.env.BASE_SEPOLIA_RPC_PRIMARY || "https://sepolia.base.org",
    process.env.BASE_SEPOLIA_RPC_FALLBACK || "https://base-sepolia-rpc.publicnode.com",
  ],
} as const;

function buildFallbackTransport(urls: readonly string[]) {
  return fallback(
    urls.map((url) =>
      http(url, {
        timeout: 10_000,
        retryCount: 2,
        retryDelay: 250,
      })
    ),
    { rank: false, retryCount: 2 }
  );
}

export const fujiPublicClient = createPublicClient({
  chain: avalancheFuji,
  pollingInterval: Number(process.env.POLLING_INTERVAL_MS || 400),
  transport: buildFallbackTransport(RPC_ENDPOINTS.avalancheFuji),
});

export const arbSepoliaPublicClient = createPublicClient({
  chain: arbitrumSepolia,
  pollingInterval: 300,
  transport: buildFallbackTransport(RPC_ENDPOINTS.arbitrumSepolia),
});

export const baseSepoliaPublicClient = createPublicClient({
  chain: baseSepolia,
  pollingInterval: 300,
  transport: buildFallbackTransport(RPC_ENDPOINTS.baseSepolia),
});

export const fujiWalletClient = createWalletClient({
  account: relayerAccount,
  chain: avalancheFuji,
  transport: buildFallbackTransport(RPC_ENDPOINTS.avalancheFuji),
});

export const arbSepoliaWalletClient = createWalletClient({
  account: relayerAccount,
  chain: arbitrumSepolia,
  transport: buildFallbackTransport(RPC_ENDPOINTS.arbitrumSepolia),
});

export const baseSepoliaWalletClient = createWalletClient({
  account: relayerAccount,
  chain: baseSepolia,
  transport: buildFallbackTransport(RPC_ENDPOINTS.baseSepolia),
});

export function getDestinationClients(targetChainId: number) {
  if (targetChainId === 421614) {
    return {
      chainName: "Arbitrum Sepolia",
      publicClient: arbSepoliaPublicClient,
      walletClient: arbSepoliaWalletClient,
      mockUsdcAddress: CONTRACTS.arbitrumSepolia.mockUsdc,
      batchDispatcherAddress: CONTRACTS.arbitrumSepolia.batchDispatcher,
    };
  }
  if (targetChainId === 84532) {
    return {
      chainName: "Base Sepolia",
      publicClient: baseSepoliaPublicClient,
      walletClient: baseSepoliaWalletClient,
      mockUsdcAddress: CONTRACTS.baseSepolia.mockUsdc,
      batchDispatcherAddress: CONTRACTS.baseSepolia.batchDispatcher,
    };
  }
  throw new Error(`Unsupported targetChainId: ${targetChainId}`);
}

const chainQueues = new Map<number, Promise<unknown>>();

/**
 * Shared per-chain transaction mutex so Solver and ERC-4337 Bundler/Paymaster
 * never collide on nonces when using the same signer account.
 */
export async function withChainLock<T>(chainId: number, task: () => Promise<T>): Promise<T> {
  const prev = chainQueues.get(chainId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  chainQueues.set(
    chainId,
    prev.then(() => next).catch(() => next)
  );

  await prev.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
  }
}
