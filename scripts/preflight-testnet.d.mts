export const EXIT_READY: number;
export const EXIT_USAGE: number;
export const EXIT_NOT_READY: number;
export const EXIT_TRANSPORT: number;

export const VERIFIER_PRECOMPILE_ADDRESS: string;
export const CREDITCOIN_CHAIN_IDS: number[];

export class PreflightError extends Error {
  code: string;
  reason: string;
  details: Record<string, unknown>;
  constructor(reason: string, details?: Record<string, unknown>);
}

export interface RpcTransportResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

export interface RpcTransport {
  fetch: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => Promise<RpcTransportResponse>;
  timeoutMs?: number;
}

export interface ObservedExternalContract {
  label: string;
  address: string;
  hasBytecode: boolean;
}

export interface ChainObservation {
  rpcChainId: number;
  verifierAddress: string;
  externalContracts: ObservedExternalContract[];
}

export interface PreflightConfig {
  protocol: "creditcoin-evm";
  label: string;
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  nativeAsset: {
    id: string;
    evmAddress: string;
    symbol: string;
    decimals: number;
  };
  asc: {
    verifierPrecompile: string;
    evmV1DecoderLibrary: string;
  };
  verified: boolean;
}

export function parsePreflightConfig(input: unknown): PreflightConfig;

export function fetchChainObservation(
  rpcUrl: string,
  transport: RpcTransport,
): Promise<{ rpcChainId: number }>;

export function runPreflight(
  config: PreflightConfig,
  observation: ChainObservation,
): { ok: true; chainId: number; label: string; verified: boolean };

export function main(
  argv: string[],
  deps?: { fetch?: RpcTransport["fetch"] },
): Promise<{ exitCode: number; output: unknown }>;
