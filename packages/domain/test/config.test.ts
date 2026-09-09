import { describe, expect, it, afterEach } from "vitest";
import {
  assertDeploymentReady,
  loadAdvanceTestnetConfig,
  loadOpenAIConfig,
  resolveOpenAIModel,
} from "../src/schemas.js";
import { DomainError } from "../src/errors.js";
import type { AdvanceTestnetConfig } from "../src/types.js";

const CONFIG_PATH = new URL(
  "../../../config/networks/advance-testnet.json",
  import.meta.url,
);
const OPENAI_PATH = new URL("../../../config/ai/openai.json", import.meta.url);

function baseConfig(): AdvanceTestnetConfig {
  return {
    protocol: "creditcoin-evm",
    label: "advance-testnet",
    rpcUrl: "https://advance-testnet.example.invalid",
    chainId: 0,
    explorerUrl: "https://explorer.example.invalid",
    nativeAsset: {
      id: "native-testnet-ctc",
      evmAddress: "0x0000000000000000000000000000000000000000",
      symbol: "CTC",
      decimals: 18,
    },
    asc: {
      verifierPrecompile: "0x0000000000000000000000000000000000000000",
      evmV1DecoderLibrary: "0x0000000000000000000000000000000000000000",
    },
    verified: false,
  };
}

function readyConfig(): AdvanceTestnetConfig {
  return {
    ...baseConfig(),
    chainId: 102031,
    rpcUrl: "https://rpc.advance-testnet.example.invalid",
    asc: {
      verifierPrecompile: "0x00000000000000000000000000000000000000FD",
      evmV1DecoderLibrary: "0x1111111111111111111111111111111111111111",
    },
    verified: true,
  };
}

describe("loadAdvanceTestnetConfig", () => {
  it("loads the canonical static config as unverified", () => {
    const config = loadAdvanceTestnetConfig(CONFIG_PATH);
    expect(config.protocol).toBe("creditcoin-evm");
    expect(config.label).toBe("advance-testnet");
    expect(config.verified).toBe(false);
  });

  it("rejects missing or invalid chain IDs", () => {
    const { chainId: _chainId, ...missing } = baseConfig();
    void _chainId;
    expect(() => loadAdvanceTestnetConfig(missing)).toThrowError(DomainError);
    expect(() => loadAdvanceTestnetConfig({ ...baseConfig(), chainId: -1 })).toThrowError(
      DomainError,
    );
    expect(() => loadAdvanceTestnetConfig({ ...baseConfig(), chainId: "abc" })).toThrowError(
      DomainError,
    );
  });

  it("rejects unsafe mainnet chain IDs", () => {
    for (const chainId of [1, 10, 56, 137, 42161, 8453]) {
      try {
        loadAdvanceTestnetConfig({ ...baseConfig(), chainId });
        expect.unreachable(`chain ${chainId} must be rejected`);
      } catch (error) {
        expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
      }
    }
  });

  it("rejects non-HTTPS RPC and explorer URLs", () => {
    expect(() =>
      loadAdvanceTestnetConfig({ ...baseConfig(), rpcUrl: "http://rpc.example.invalid" }),
    ).toThrowError(DomainError);
    expect(() =>
      loadAdvanceTestnetConfig({ ...baseConfig(), explorerUrl: "not-a-url" }),
    ).toThrowError(DomainError);
    expect(() =>
      loadAdvanceTestnetConfig({ ...baseConfig(), explorerUrl: "" }),
    ).toThrowError(DomainError);
  });

  it("rejects an empty native asset descriptor", () => {
    expect(() =>
      loadAdvanceTestnetConfig({
        ...baseConfig(),
        nativeAsset: { ...baseConfig().nativeAsset, symbol: "" },
      }),
    ).toThrowError(DomainError);
    expect(() =>
      loadAdvanceTestnetConfig({
        ...baseConfig(),
        nativeAsset: { ...baseConfig().nativeAsset, id: "eth" },
      }),
    ).toThrowError(DomainError);
  });

  it("rejects malformed verifier addresses", () => {
    expect(() =>
      loadAdvanceTestnetConfig({
        ...baseConfig(),
        asc: { ...baseConfig().asc, verifierPrecompile: "0xFD2" },
      }),
    ).toThrowError(DomainError);
  });
});

describe("assertDeploymentReady", () => {
  it("accepts a verified config with a matching live observation", () => {
    expect(() =>
      assertDeploymentReady(readyConfig(), {
        rpcChainId: 102031,
        verifierHasBytecode: true,
        decoderHasBytecode: true,
      }),
    ).not.toThrow();
  });

  it("rejects an unverified config even with a matching observation", () => {
    expect(() =>
      assertDeploymentReady(baseConfig(), {
        rpcChainId: 0,
        verifierHasBytecode: true,
        decoderHasBytecode: true,
      }),
    ).toThrowError(DomainError);
  });

  it("rejects a statically verified config without live bytecode", () => {
    const attempted = { ...readyConfig(), asc: { ...baseConfig().asc } };
    expect(() =>
      assertDeploymentReady(attempted, {
        rpcChainId: 102031,
        verifierHasBytecode: false,
        decoderHasBytecode: false,
      }),
    ).toThrowError(DomainError);
  });

  it("rejects chain mismatches with redacted details", () => {
    try {
      assertDeploymentReady(readyConfig(), {
        rpcChainId: 999999,
        verifierHasBytecode: true,
        decoderHasBytecode: true,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("https://rpc.advance-testnet.example.invalid");
      expect(serialized).not.toContain("0x1111111111111111111111111111111111111111");
    }
  });
});

describe("openai config", () => {
  const saved = process.env["OPENAI_MODEL"];

  afterEach(() => {
    if (saved === undefined) {
      delete process.env["OPENAI_MODEL"];
    } else {
      process.env["OPENAI_MODEL"] = saved;
    }
  });

  it("loads the pinned provider config", () => {
    const config = loadOpenAIConfig(OPENAI_PATH);
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-5.6-luna");
    expect(config.allowFallback).toBe(false);
  });

  it("rejects a substituted provider", () => {
    expect(() =>
      loadOpenAIConfig({
        provider: "anthropic",
        model: "gpt-5.6-luna",
        region: "us-east-1",
        allowFallback: false,
      }),
    ).toThrowError(DomainError);
  });

  it("rejects a silent model substitution from the environment", () => {
    process.env["OPENAI_MODEL"] = "gpt-4o";
    expect(() => resolveOpenAIModel(loadOpenAIConfig(OPENAI_PATH))).toThrowError(DomainError);
  });

  it("resolves the pinned model when the environment is unset", () => {
    delete process.env["OPENAI_MODEL"];
    expect(resolveOpenAIModel(loadOpenAIConfig(OPENAI_PATH))).toBe("gpt-5.6-luna");
  });
});
