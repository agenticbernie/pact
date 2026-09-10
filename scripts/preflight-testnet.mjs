#!/usr/bin/env node
// Advance Testnet preflight: read-only chain/config readiness probe.
// Exits 0 only when the static config is verified AND live chain identity,
// the canonical verifier precompile identity, and the compile-time decoder
// acknowledgment all agree.
//
// Design notes (R-E readiness revision):
// - 0xFD2 is a protocol precompile: zero bytecode is valid by design and is
//   never probed. Identity is established by address constant + allowlisted
//   chain ID, mirroring the pinned ASC package.
// - The EVM decoder is compile-time/inlined: no address exists. Readiness
//   requires the config to acknowledge this with the zero address; any other
//   value claims a phantom deployment and fails closed.
// - Real external contract dependencies (none in the MVP) require bytecode
//   evidence; a missing one fails closed.
// Failure output is redacted to reason codes and numeric chain facts — URLs
// and addresses never leave this boundary.
//
// Importing this module has no side effects; the CLI runs only when the file
// is executed directly.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const EXIT_READY = 0;
export const EXIT_USAGE = 1;
export const EXIT_NOT_READY = 2;
export const EXIT_TRANSPORT = 3;

export const VERIFIER_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000FD2";
export const CREDITCOIN_CHAIN_IDS = [102030, 102031, 102032];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export class PreflightError extends Error {
  constructor(reason, details = {}) {
    super(`Advance Testnet preflight not ready: ${reason}.`);
    this.name = "PreflightError";
    this.code = "PREFLIGHT_ERROR";
    this.reason = reason;
    this.details = details;
  }
}

function isHttpsUrl(value) {
  try {
    return typeof value === "string" && new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isEvmAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/** Minimal structural gate for CLI-loaded JSON. Full schema authority lives in @pact/domain. */
export function parsePreflightConfig(input) {
  const ok =
    typeof input === "object" &&
    input !== null &&
    input.protocol === "creditcoin-evm" &&
    input.label === "advance-testnet" &&
    isHttpsUrl(input.rpcUrl) &&
    Number.isInteger(input.chainId) &&
    isHttpsUrl(input.explorerUrl) &&
    typeof input.nativeAsset === "object" &&
    input.nativeAsset !== null &&
    input.nativeAsset.id === "native-testnet-ctc" &&
    typeof input.asc === "object" &&
    input.asc !== null &&
    isEvmAddress(input.asc.verifierPrecompile) &&
    isEvmAddress(input.asc.evmV1DecoderLibrary) &&
    typeof input.verified === "boolean";
  if (!ok) {
    throw new PreflightError("schema-rejected");
  }
  return input;
}

async function rpcCall(transport, url, method, params) {
  const { fetch, timeoutMs = 10000 } = transport;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  let response;
  try {
    response = await Promise.race([
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new PreflightError("timeout")), timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof PreflightError) {
      throw error;
    }
    throw new PreflightError("transport-error");
  }
  if (!response || response.ok !== true) {
    throw new PreflightError("http-error", { status: response?.status ?? 0 });
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new PreflightError("malformed-response");
  }
  if (payload === null || typeof payload !== "object" || payload.error !== undefined) {
    throw new PreflightError("rpc-error");
  }
  if (payload.result === undefined) {
    throw new PreflightError("malformed-response");
  }
  return payload.result;
}

/**
 * Read-only chain observation: chain identity only. No bytecode is probed:
 * the verifier is a precompile (no bytecode by design) and the decoder is
 * compile-time (no address at all).
 */
export async function fetchChainObservation(rpcUrl, transport) {
  const chainHex = await rpcCall(transport, rpcUrl, "eth_chainId", []);
  const rpcChainId = typeof chainHex === "string" ? Number.parseInt(chainHex, 16) : NaN;
  if (!Number.isSafeInteger(rpcChainId)) {
    throw new PreflightError("malformed-response");
  }
  return { rpcChainId };
}

/** Readiness decision over static config plus live observation. Redacted details only. */
export function runPreflight(config, observation) {
  if (config.verified !== true) {
    throw new PreflightError("unverified");
  }
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) {
    throw new PreflightError("chain-unresolved");
  }
  if (observation.rpcChainId !== config.chainId) {
    throw new PreflightError("chain-mismatch", {
      expectedChainId: config.chainId,
      observedChainId: observation.rpcChainId,
    });
  }
  if (!CREDITCOIN_CHAIN_IDS.includes(observation.rpcChainId)) {
    throw new PreflightError("chain-not-allowlisted", {
      observedChainId: observation.rpcChainId,
    });
  }
  if (
    !isEvmAddress(observation.verifierAddress) ||
    observation.verifierAddress.toLowerCase() !== VERIFIER_PRECOMPILE_ADDRESS.toLowerCase()
  ) {
    throw new PreflightError("verifier-identity-mismatch");
  }
  if (
    !isEvmAddress(config.asc.verifierPrecompile) ||
    config.asc.verifierPrecompile.toLowerCase() !== VERIFIER_PRECOMPILE_ADDRESS.toLowerCase()
  ) {
    throw new PreflightError("verifier-not-canonical");
  }
  if (config.asc.evmV1DecoderLibrary.toLowerCase() !== ZERO_ADDRESS) {
    throw new PreflightError("decoder-not-compile-time");
  }
  for (const external of observation.externalContracts ?? []) {
    if (!isEvmAddress(external.address)) {
      throw new PreflightError("external-invalid-address", { contract: external.label });
    }
    if (external.hasBytecode !== true) {
      throw new PreflightError("external-no-bytecode", { contract: external.label });
    }
  }
  return { ok: true, chainId: config.chainId, label: config.label, verified: true };
}

export async function main(argv, deps = {}) {
  const fetch = deps.fetch ?? globalThis.fetch;
  const configIndex = argv.indexOf("--config");
  const configPath = configIndex === -1 ? null : argv[configIndex + 1];
  if (!configPath) {
    return { exitCode: EXIT_USAGE, output: { ok: false, reason: "missing-config-flag" } };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return { exitCode: EXIT_NOT_READY, output: { ok: false, reason: "unreadable-config" } };
  }
  let config;
  try {
    config = parsePreflightConfig(raw);
  } catch (error) {
    return { exitCode: EXIT_NOT_READY, output: { ok: false, reason: error.reason } };
  }
  if (config.verified !== true) {
    return { exitCode: EXIT_NOT_READY, output: { ok: false, reason: "unverified" } };
  }
  let observation;
  try {
    const { rpcChainId } = await fetchChainObservation(config.rpcUrl, {
      fetch,
      timeoutMs: 15000,
    });
    // Verifier identity is protocol-defined (constant), not probed: precompiles
    // carry no bytecode by design. The MVP declares no external dependencies.
    observation = {
      rpcChainId,
      verifierAddress: VERIFIER_PRECOMPILE_ADDRESS,
      externalContracts: [],
    };
  } catch (error) {
    return {
      exitCode: EXIT_TRANSPORT,
      output: { ok: false, reason: error instanceof PreflightError ? error.reason : "transport-error" },
    };
  }
  try {
    return { exitCode: EXIT_READY, output: runPreflight(config, observation) };
  } catch (error) {
    return {
      exitCode: EXIT_NOT_READY,
      output: {
        ok: false,
        reason: error.reason,
        ...(error.details && Object.keys(error.details).length > 0
          ? { details: error.details }
          : {}),
      },
    };
  }
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main(process.argv.slice(2)).then(({ exitCode, output }) => {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = exitCode;
  });
}
