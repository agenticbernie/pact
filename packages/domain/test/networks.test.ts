import { describe, expect, it } from "vitest";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_SOURCE,
  getNetworkByChainId,
  parseChainNetworkConfig,
  requireVerifiedNetwork,
} from "../src/networks.js";
import { DomainError } from "../src/errors.js";

describe("network registry (Arc migration boundary)", () => {
  it("pins the officially documented Arc Testnet chain ID with its source", () => {
    expect(ARC_TESTNET_CHAIN_ID).toBe(5042002);
    expect(ARC_TESTNET_SOURCE).toContain("docs.arc.io");
  });

  it("resolves the registered Arc entry by chain ID", () => {
    const entry = getNetworkByChainId(ARC_TESTNET_CHAIN_ID);
    expect(entry.id).toBe("arc-testnet");
    expect(entry.explorerUrl).toContain("explorer.testnet.arc.io");
  });

  it("keeps the Creditcoin Advance entry resolvable alongside Arc", () => {
    const entry = getNetworkByChainId(102031);
    expect(entry.id).toBe("creditcoin-advance-testnet");
  });

  it("rejects unknown chain IDs fail-closed", () => {
    expect(() => getNetworkByChainId(1)).toThrow(DomainError);
  });

  it("refuses unverified networks on the deployment path", () => {
    const entry = getNetworkByChainId(ARC_TESTNET_CHAIN_ID);
    expect(entry.verified).toBe(false);
    expect(() => requireVerifiedNetwork(entry)).toThrow(DomainError);
  });

  it("accepts explicitly verified configs without changing them", () => {
    const raw = {
      id: "arc-testnet",
      protocol: "arc-evm",
      label: "arc-testnet",
      rpcUrl: "https://rpc.testnet.arc.io",
      chainId: 5042002,
      explorerUrl: "https://testnet.arcscan.app",
      nativeAsset: {
        id: "arc-testnet-usdc",
        evmAddress: "0x0000000000000000000000000000000000000000",
        symbol: "USDC",
        decimals: 18,
      },
      evmProfile: "osaka",
      feePolicy: { minBaseFeeGwei: "20", confirmations: 1 },
      rejectsZeroAddressValue: true,
      deploymentStatus: "not-deployed",
      deployedContracts: [],
      supportedFeatures: ["native-settlement"],
      unsupportedFeatures: ["verified-credit"],
      faucetUrl: "https://faucet.circle.com",
      faucetSource: "https://docs.arc.io/arc/references/rpc-endpoints",
      verified: true,
      source: ARC_TESTNET_SOURCE,
    };
    const parsed = parseChainNetworkConfig(raw);
    expect(requireVerifiedNetwork(parsed).chainId).toBe(5042002);
  });

  it("rejects malformed network configs", () => {
    expect(() =>
      parseChainNetworkConfig({ id: "arc-testnet", chainId: "not-a-number" }),
    ).toThrow(DomainError);
  });
});
