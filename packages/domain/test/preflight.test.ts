import { describe, expect, it } from "vitest";
import {
  PreflightError,
  fetchChainObservation,
  runPreflight,
} from "../../../scripts/preflight-testnet.mjs";
import type {
  RpcTransport,
  RpcTransportResponse,
} from "../../../scripts/preflight-testnet.mjs";
import { parseAdvanceTestnetConfig } from "../src/schemas.js";

const RPC_URL = "https://rpc.advance-testnet.example.invalid";

function baseConfig(overrides: Record<string, unknown> = {}) {
  return parseAdvanceTestnetConfig({
    protocol: "creditcoin-evm",
    label: "advance-testnet",
    rpcUrl: RPC_URL,
    chainId: 102031,
    explorerUrl: "https://explorer.example.invalid",
    nativeAsset: {
      id: "native-testnet-ctc",
      evmAddress: "0x0000000000000000000000000000000000000000",
      symbol: "CTC",
      decimals: 18,
    },
    asc: {
      verifierPrecompile: "0x00000000000000000000000000000000000000FD",
      evmV1DecoderLibrary: "0x1111111111111111111111111111111111111111",
    },
    verified: true,
    ...overrides,
  });
}

type RpcBody = { method: string; params: string[] };
type StubHandler = (_url: string, body: RpcBody) => Promise<RpcTransportResponse>;

function jsonResponse(body: unknown, { status = 200 }: { status?: number } = {}): RpcTransportResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(typeof body === "string" ? (JSON.parse(body) as unknown) : body),
  };
}

function stubTransport(handler: StubHandler): RpcTransport {
  return {
    timeoutMs: 500,
    fetch: (url: string, options: { body: string }) =>
      handler(url, JSON.parse(options.body) as RpcBody),
  };
}

function chainHandler(
  chainHex: string,
  verifierCode: string,
  decoderCode: string,
): StubHandler {
  return (_url: string, body: RpcBody) => {
    if (body.method === "eth_chainId") {
      return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: 1, result: chainHex }));
    }
    if (body.method === "eth_getCode") {
      const address = body.params[0].toLowerCase();
      const code = address.endsWith("fd") ? verifierCode : decoderCode;
      return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: 1, result: code }));
    }
    return Promise.resolve(jsonResponse({ error: "unknown" }, { status: 500 }));
  };
}

const FULL_CODE = "0x6080604052";

describe("preflight transport", () => {
  it("builds a valid observation from well-formed RPC responses", async () => {
    const observation = await fetchChainObservation(
      RPC_URL,
      {
        verifierPrecompile: "0x00000000000000000000000000000000000000FD",
        evmV1DecoderLibrary: "0x1111111111111111111111111111111111111111",
      },
      stubTransport(chainHandler("0x18e8f", FULL_CODE, FULL_CODE)),
    );
    expect(observation).toEqual({
      rpcChainId: 102031,
      verifierHasBytecode: true,
      decoderHasBytecode: true,
    });
  });

  it("rejects a chain mismatch before trusting bytecode", async () => {
    const observation = await fetchChainObservation(
      RPC_URL,
      {
        verifierPrecompile: "0x00000000000000000000000000000000000000FD",
        evmV1DecoderLibrary: "0x1111111111111111111111111111111111111111",
      },
      stubTransport(chainHandler("0x1", FULL_CODE, FULL_CODE)),
    );
    expect(() => runPreflight(baseConfig(), observation)).toThrowError(PreflightError);
  });

  it("rejects malformed JSON-RPC bodies", async () => {
    const transport = stubTransport(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("not json")),
      }),
    );
    await expect(
      fetchChainObservation(RPC_URL, baseConfig().asc, transport),
    ).rejects.toThrowError(PreflightError);
  });

  it("rejects JSON-RPC error envelopes", async () => {
    const transport = stubTransport(() =>
      Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: 1, error: { code: -32602 } })),
    );
    await expect(
      fetchChainObservation(RPC_URL, baseConfig().asc, transport),
    ).rejects.toThrowError(PreflightError);
  });

  it("times out instead of hanging", async () => {
    const transport: RpcTransport = {
      timeoutMs: 20,
      fetch: (): Promise<RpcTransportResponse> => new Promise(() => {}),
    };
    await expect(
      fetchChainObservation(RPC_URL, baseConfig().asc, transport),
    ).rejects.toThrowError(PreflightError);
  });

  it("rejects HTTP failures", async () => {
    const transport = stubTransport(() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );
    await expect(
      fetchChainObservation(RPC_URL, baseConfig().asc, transport),
    ).rejects.toThrowError(PreflightError);
  });

  it("reports empty verifier bytecode as not-ready", async () => {
    const observation = await fetchChainObservation(
      RPC_URL,
      baseConfig().asc,
      stubTransport(chainHandler("0x18e8f", "0x", FULL_CODE)),
    );
    expect(observation.verifierHasBytecode).toBe(false);
    expect(() => runPreflight(baseConfig(), observation)).toThrowError(PreflightError);
  });

  it("reports empty decoder bytecode as not-ready", async () => {
    const observation = await fetchChainObservation(
      RPC_URL,
      baseConfig().asc,
      stubTransport(chainHandler("0x18e8f", FULL_CODE, "0x")),
    );
    expect(() => runPreflight(baseConfig(), observation)).toThrowError(PreflightError);
  });

  it("rejects a statically verified config without live bytecode", () => {
    expect(() =>
      runPreflight(baseConfig(), {
        rpcChainId: 102031,
        verifierHasBytecode: false,
        decoderHasBytecode: false,
      }),
    ).toThrowError(PreflightError);
  });

  it("rejects missing values at the config boundary", () => {
    expect(() => baseConfig({ rpcUrl: "" })).toThrow();
  });

  it("redacts URLs and addresses from failure output", () => {
    try {
      runPreflight(baseConfig(), {
        rpcChainId: 999999,
        verifierHasBytecode: true,
        decoderHasBytecode: true,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PreflightError);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(RPC_URL);
      expect(serialized).not.toContain("0x1111111111111111111111111111111111111111");
    }
  });

  it("accepts one concrete valid observation fixture", () => {
    const result = runPreflight(baseConfig(), {
      rpcChainId: 102031,
      verifierHasBytecode: true,
      decoderHasBytecode: true,
    });
    expect(result.ok).toBe(true);
    expect(result.chainId).toBe(102031);
  });
});
