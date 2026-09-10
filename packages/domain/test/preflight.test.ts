import { describe, expect, it } from "vitest";
import {
  PreflightError,
  fetchChainObservation,
  runPreflight,
} from "../../../scripts/preflight-testnet.mjs";
import type { RpcTransport } from "../../../scripts/preflight-testnet.mjs";
import { parseAdvanceTestnetConfig } from "../src/schemas.js";
import { VERIFIER_PRECOMPILE_ADDRESS } from "../src/schemas.js";

const RPC_URL = "https://rpc.advance-testnet.example.invalid";
const ZERO = "0x0000000000000000000000000000000000000000";

function baseConfig(overrides: Record<string, unknown> = {}) {
  return parseAdvanceTestnetConfig({
    protocol: "creditcoin-evm",
    label: "advance-testnet",
    rpcUrl: RPC_URL,
    chainId: 102031,
    explorerUrl: "https://explorer.example.invalid",
    nativeAsset: {
      id: "native-testnet-ctc",
      evmAddress: ZERO,
      symbol: "CTC",
      decimals: 18,
    },
    asc: {
      verifierPrecompile: VERIFIER_PRECOMPILE_ADDRESS,
      evmV1DecoderLibrary: ZERO,
    },
    verified: true,
    ...overrides,
  });
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    rpcChainId: 102031,
    verifierAddress: VERIFIER_PRECOMPILE_ADDRESS,
    externalContracts: [],
    ...overrides,
  };
}

function jsonResponse(body: unknown, { status = 200 }: { status?: number } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(typeof body === "string" ? (JSON.parse(body) as unknown) : body),
  };
}

type RpcBody = { method: string; params: string[] };
type StubHandler = (_url: string, body: RpcBody) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

function stubTransport(handler: StubHandler): RpcTransport {
  return {
    timeoutMs: 500,
    fetch: (url: string, options: { body: string }) =>
      handler(url, JSON.parse(options.body) as RpcBody),
  };
}

function chainIdHandler(chainHex: string): StubHandler {
  return (_url: string, body: RpcBody) => {
    if (body.method === "eth_chainId") {
      return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: 1, result: chainHex }));
    }
    return Promise.resolve(jsonResponse({ error: "unknown" }, { status: 500 }));
  };
}

describe("preflight transport", () => {
  it("reads chain identity without bytecode probes", async () => {
    const observed = await fetchChainObservation(RPC_URL, stubTransport(chainIdHandler("0x18e8f")));
    expect(observed).toEqual({ rpcChainId: 102031 });
  });

  it("rejects a chain mismatch before trusting anything else", async () => {
    const observed = await fetchChainObservation(RPC_URL, stubTransport(chainIdHandler("0x1")));
    expect(() => runPreflight(baseConfig(), { ...observation(), ...observed })).toThrowError(
      PreflightError,
    );
  });

  it("rejects malformed JSON-RPC bodies", async () => {
    const transport = stubTransport(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    await expect(fetchChainObservation(RPC_URL, transport)).rejects.toThrowError(PreflightError);
  });

  it("rejects JSON-RPC error envelopes", async () => {
    const transport = stubTransport(() =>
      Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32602 } })),
    );
    await expect(fetchChainObservation(RPC_URL, transport)).rejects.toThrowError(PreflightError);
  });

  it("times out instead of hanging", async () => {
    const transport: RpcTransport = {
      timeoutMs: 20,
      fetch: () =>
        new Promise<{
          ok: boolean;
          status: number;
          json: () => Promise<unknown>;
        }>(() => {}),
    };
    await expect(fetchChainObservation(RPC_URL, transport)).rejects.toThrowError(PreflightError);
  });

  it("rejects HTTP failures", async () => {
    const transport = stubTransport(() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );
    await expect(fetchChainObservation(RPC_URL, transport)).rejects.toThrowError(PreflightError);
  });

  it("rejects missing values at the config boundary", () => {
    expect(() => baseConfig({ rpcUrl: "" })).toThrow();
  });

  it("accepts the canonical precompile with no bytecode concept", () => {
    const result = runPreflight(baseConfig(), observation());
    expect(result.ok).toBe(true);
    expect(result.chainId).toBe(102031);
  });

  it("accepts a compile-time decoder with no address", () => {
    const config = baseConfig();
    expect(config.asc.evmV1DecoderLibrary).toBe(ZERO);
    expect(() => runPreflight(config, observation())).not.toThrow();
  });

  it("rejects a non-zero decoder address", () => {
    const config = baseConfig({
      asc: {
        verifierPrecompile: VERIFIER_PRECOMPILE_ADDRESS,
        evmV1DecoderLibrary: "0x04B9ae8562D8Cc5bbbBbBB759080dDC30B56D18B",
      },
    });
    expect(() => runPreflight(config, observation())).toThrowError(PreflightError);
  });

  it("rejects a verifier identity mismatch", () => {
    expect(() =>
      runPreflight(baseConfig(), observation({ verifierAddress: ZERO })),
    ).toThrowError(PreflightError);
  });

  it("rejects a non-allowlisted chain", () => {
    const config = baseConfig({ chainId: 31337 });
    expect(() => runPreflight(config, observation({ rpcChainId: 31337 }))).toThrowError(
      PreflightError,
    );
  });

  it("rejects an external dependency without bytecode", () => {
    const obs = observation({
      externalContracts: [
        { label: "oracle", address: "0x2222222222222222222222222222222222222222", hasBytecode: false },
      ],
    });
    expect(() => runPreflight(baseConfig(), obs)).toThrowError(PreflightError);
  });

  it("rejects a statically verified config without a live chain match", () => {
    expect(() => runPreflight(baseConfig(), observation({ rpcChainId: 999999 }))).toThrowError(
      PreflightError,
    );
  });

  it("redacts URLs and addresses from failure output", () => {
    try {
      runPreflight(baseConfig(), observation({ rpcChainId: 999999 }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PreflightError);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(RPC_URL);
      expect(serialized).not.toContain("0x2222222222222222222222222222222222222222");
    }
  });
});
