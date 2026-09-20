import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DomainError } from "./errors.ts";
import { CREDITCOIN_CHAIN_IDS } from "./schemas.ts";

/**
 * Multi-network registry boundary (Arc migration foundation).
 *
 * Additive only: existing `AdvanceTestnetConfig` / `assertDeploymentReady` in
 * `schemas.ts` are untouched. This registry lets Arc be addressed without
 * redefining the Creditcoin config.
 *
 * Arc values below are DOCUMENTED placeholders transcribed from the official
 * Arc docs (https://docs.arc.io/arc/references/connect-to-arc and
 * /arc/references/rpc-endpoints, verified 2026-09-19). They are NOT live
 * facts: every entry defaults to `verified: false` and the deployment path
 * (`requireVerifiedNetwork`) rejects unverified entries fail-closed. Flip to
 * `verified: true` only after the live preflight lane (Track A).
 */

/** Official Arc Testnet chain ID (docs.arc.io, 2026-09-19). */
export const ARC_TESTNET_CHAIN_ID = 5042002;

/** Source attribution for the Arc Testnet parameters. */
export const ARC_TESTNET_SOURCE = "https://docs.arc.io/arc/references/connect-to-arc";

const nativeAssetSchema = z
  .object({
    id: z.string().min(1).max(64),
    evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "EVM address"),
    symbol: z.string().min(1).max(16),
    decimals: z.number().int().min(0).max(36),
  })
  .strict();

const chainNetworkConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    protocol: z.string().min(1).max(64),
    label: z.string().min(1).max(64),
    rpcUrl: z.string().url(),
    chainId: z.number().int().positive(),
    explorerUrl: z.string().url(),
    nativeAsset: nativeAssetSchema,
    /** EVM hardfork the deployment targets. Legacy stays shanghai; Arc uses osaka. */
    evmProfile: z.enum(["shanghai", "osaka"]),
    /** Fee/finality policy. Null only when the values are unknown (never assumed). */
    feePolicy: z
      .object({
        minBaseFeeGwei: z.string().regex(/^(0|[1-9][0-9]*)$/, "canonical decimal gwei"),
        confirmations: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    /** True when value-bearing transfers to address(0) revert on this chain. */
    rejectsZeroAddressValue: z.boolean(),
    deploymentStatus: z.enum(["not-deployed", "dry-run-only", "deployed"]),
    /** On-chain contract addresses. Empty until a verified deployment exists — never faked. */
    deployedContracts: z
      .array(z.string().regex(/^0x[0-9a-fA-F]{40}$/, "EVM address"))
      .default([]),
    supportedFeatures: z.array(z.string().min(1).max(64)).default([]),
    unsupportedFeatures: z.array(z.string().min(1).max(64)).default([]),
    /** Faucet URL only with an official source. Null means unknown — never guessed. */
    faucetUrl: z.string().url().nullable(),
    faucetSource: z.string().min(1).max(256),
    verified: z.boolean().default(false),
    source: z.string().min(1).max(256),
  })
  .strict();

export type ChainNetworkConfig = z.infer<typeof chainNetworkConfigSchema>;

function toNetworkError(details: Record<string, string>): DomainError {
  return new DomainError("NETWORK_CONFIG_INVALID", "Chain network config invalid.", details);
}

export function parseChainNetworkConfig(input: unknown): ChainNetworkConfig {
  const parsed = chainNetworkConfigSchema.safeParse(input);
  if (!parsed.success) {
    throw toNetworkError({ issues: parsed.error.issues.map((i) => i.path.join(".")).join(",") });
  }
  return parsed.data;
}

const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";

const NETWORK_REGISTRY: readonly ChainNetworkConfig[] = [
  {
    id: "creditcoin-advance-testnet",
    protocol: "creditcoin-evm",
    label: "advance-testnet",
    rpcUrl: "https://advance-testnet.example.invalid",
    chainId: 102031,
    explorerUrl: "https://explorer.example.invalid",
    nativeAsset: {
      id: "native-testnet-ctc",
      evmAddress: ZERO_EVM_ADDRESS,
      symbol: "CTC",
      decimals: 18,
    },
    evmProfile: "shanghai",
    feePolicy: null,
    rejectsZeroAddressValue: false,
    deploymentStatus: "not-deployed",
    deployedContracts: [],
    supportedFeatures: ["native-settlement", "verified-credit"],
    unsupportedFeatures: [],
    faucetUrl: null,
    faucetSource: "unknown — do not guess",
    verified: false,
    source: "config/networks/advance-testnet.json (sanitized, verified:false)",
  },
  {
    id: "arc-testnet",
    protocol: "arc-evm",
    label: "arc-testnet",
    rpcUrl: "https://rpc.testnet.arc.io",
    chainId: ARC_TESTNET_CHAIN_ID,
    explorerUrl: "https://explorer.testnet.arc.io",
    nativeAsset: {
      id: "arc-testnet-usdc",
      evmAddress: ZERO_EVM_ADDRESS,
      symbol: "USDC",
      decimals: 18,
    },
    evmProfile: "osaka",
    feePolicy: { minBaseFeeGwei: "20", confirmations: 1 },
    rejectsZeroAddressValue: true,
    deploymentStatus: "not-deployed",
    deployedContracts: [],
    supportedFeatures: ["native-settlement", "on-chain-policy"],
    unsupportedFeatures: ["verified-credit", "erc20-settlement"],
    faucetUrl: "https://faucet.circle.com",
    faucetSource: "https://docs.arc.io/arc/references/rpc-endpoints (documented, flow unverified)",
    verified: false,
    source: ARC_TESTNET_SOURCE,
  },
];

export function getNetworkByChainId(chainId: number): ChainNetworkConfig {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw toNetworkError({ chainId: String(chainId) });
  }
  if (CREDITCOIN_CHAIN_IDS.includes(chainId)) {
    const entry = NETWORK_REGISTRY.find((n) => n.id === "creditcoin-advance-testnet");
    if (entry !== undefined) return entry;
  }
  const entry = NETWORK_REGISTRY.find((n) => n.chainId === chainId);
  if (entry === undefined) {
    throw toNetworkError({ chainId: String(chainId) });
  }
  return entry;
}

/** Deployment path: rejects unverified networks fail-closed. */
export function requireVerifiedNetwork(config: ChainNetworkConfig): ChainNetworkConfig {
  if (config.verified !== true) {
    throw toNetworkError({ network: config.id, verified: String(config.verified) });
  }
  return config;
}

function readJsonInput(input: unknown): unknown {
  if (typeof input === "string" || input instanceof URL) {
    const path = typeof input === "string" ? input : fileURLToPath(input);
    try {
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      throw new DomainError("NETWORK_CONFIG_INVALID", "Network config is not readable JSON.", {
        reason: "unreadable-config",
      });
    }
  }
  return input;
}

/** Static Arc config parsing only. `verified: true` still needs a live lane. */
export function parseArcTestnetConfig(input: unknown): ChainNetworkConfig {
  const config = parseChainNetworkConfig(input);
  if (config.id !== "arc-testnet" || config.chainId !== ARC_TESTNET_CHAIN_ID) {
    throw toNetworkError({ reason: "not-arc-testnet" });
  }
  return config;
}

export function loadArcTestnetConfig(input: string | URL | unknown): ChainNetworkConfig {
  return parseArcTestnetConfig(readJsonInput(input));
}

/**
 * Read-only chain-identity assertion for the Arc lane. The caller supplies the
 * observed chain ID (from an approved read-only RPC probe or a manifest);
 * this function never touches the network itself.
 */
export function assertArcChainIdentity(config: ChainNetworkConfig, observedChainId: number): true {
  if (observedChainId !== ARC_TESTNET_CHAIN_ID || config.chainId !== ARC_TESTNET_CHAIN_ID) {
    throw toNetworkError({
      reason: "chain-mismatch",
      expectedChainId: String(ARC_TESTNET_CHAIN_ID),
      observedChainId: String(observedChainId),
    });
  }
  return true;
}
