import { describe, expect, it, afterEach } from "vitest";
import {
  assertDeploymentReady,
  loadAdvanceTestnetConfig,
  loadOpenAIConfig,
  resolveOpenAIModel,
  VERIFIER_PRECOMPILE_ADDRESS,
} from "../src/schemas.js";
import { DomainError } from "../src/errors.js";
import type { AdvanceTestnetConfig, NetworkObservation } from "../src/types.js";

const CONFIG_PATH = new URL(
  "../../../config/networks/advance-testnet.json",
  import.meta.url,
);
const OPENAI_PATH = new URL("../../../config/ai/openai.json", import.meta.url);

const VERIFIER = VERIFIER_PRECOMPILE_ADDRESS;
const DECODER_LABEL = "example-external-oracle";

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
      verifierPrecompile: VERIFIER,
      evmV1DecoderLibrary: "0x0000000000000000000000000000000000000000",
    },
    verified: true,
  };
}

function observation(overrides: Partial<NetworkObservation> = {}): NetworkObservation {
  return {
    rpcChainId: 102031,
    verifierAddress: VERIFIER,
    externalContracts: [],
    ...overrides,
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
  it("accepts the canonical precompile with no bytecode concept", () => {
    expect(() => assertDeploymentReady(readyConfig(), observation())).not.toThrow();
  });

  it("rejects an unverified config even with a matching observation", () => {
    expect(() => assertDeploymentReady(baseConfig(), observation({ rpcChainId: 0 }))).toThrowError(
      DomainError,
    );
  });

  it("rejects a non-allowlisted chain even when IDs match", () => {
    const local = {
      ...readyConfig(),
      chainId: 31337,
    };
    try {
      assertDeploymentReady(local, observation({ rpcChainId: 31337 }));
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
    }
  });

  it("rejects chain mismatches with redacted details", () => {
    try {
      assertDeploymentReady(readyConfig(), observation({ rpcChainId: 102030 }));
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("https://rpc.advance-testnet.example.invalid");
    }
  });

  it("rejects a verifier identity mismatch", () => {
    try {
      assertDeploymentReady(
        readyConfig(),
        observation({ verifierAddress: "0x0000000000000000000000000000000000000000" }),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
    }
  });

  it("rejects a non-canonical configured verifier", () => {
    const config = {
      ...readyConfig(),
      asc: { ...readyConfig().asc, verifierPrecompile: "0x1111111111111111111111111111111111111111" },
    };
    expect(() => assertDeploymentReady(config, observation())).toThrowError(DomainError);
  });

  it("rejects a non-zero decoder address (decoder is compile-time)", () => {
    const config = {
      ...readyConfig(),
      asc: {
        ...readyConfig().asc,
        evmV1DecoderLibrary: "0x04B9ae8562D8Cc5bbbBbBB759080dDC30B56D18B",
      },
    };
    try {
      assertDeploymentReady(config, observation());
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
    }
  });

  it("rejects an external dependency without bytecode", () => {
    const obs = observation({
      externalContracts: [
        {
          label: DECODER_LABEL,
          address: "0x2222222222222222222222222222222222222222",
          hasBytecode: false,
        },
      ],
    });
    try {
      assertDeploymentReady(readyConfig(), obs);
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("NETWORK_CONFIG_INVALID");
      expect(JSON.stringify(error)).toContain(DECODER_LABEL);
      expect(JSON.stringify(error)).not.toContain("0x2222222222222222222222222222222222222222");
    }
  });

  it("accepts an external dependency with bytecode", () => {
    const obs = observation({
      externalContracts: [
        {
          label: DECODER_LABEL,
          address: "0x2222222222222222222222222222222222222222",
          hasBytecode: true,
        },
      ],
    });
    expect(() => assertDeploymentReady(readyConfig(), obs)).not.toThrow();
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
