export const EXIT_READY: number;
export const EXIT_USAGE: number;
export const EXIT_NOT_READY: number;
export const EXIT_TRANSPORT: number;

export class PreflightError extends Error {
  code: string;
  reason: string;
  details: Record<string, unknown>;
  constructor(reason: string, details?: Record<string, unknown>);
}

export interface AscAddresses {
  verifierPrecompile: string;
  evmV1DecoderLibrary: string;
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

export interface ChainObservation {
  rpcChainId: number;
  verifierHasBytecode: boolean;
  decoderHasBytecode: boolean;
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
  asc: AscAddresses;
  verified: boolean;
}

export function parsePreflightConfig(input: unknown): PreflightConfig;

export function fetchChainObservation(
  rpcUrl: string,
  asc: AscAddresses,
  transport: RpcTransport,
): Promise<ChainObservation>;

export function runPreflight(
  config: PreflightConfig,
  observation: ChainObservation,
): { ok: true; chainId: number; label: string; verified: boolean };

export function main(
  argv: string[],
  deps?: { fetch?: RpcTransport["fetch"] },
): Promise<{ exitCode: number; output: unknown }>;
