import { describe, expect, it } from "vitest";
import {
  ARC_TESTNET_CHAIN_ID,
  assertArcChainIdentity,
  getNetworkByChainId,
  loadArcTestnetConfig,
  parseChainNetworkConfig,
  requireVerifiedNetwork,
} from "../src/networks.js";
import { DomainError } from "../src/errors.js";

const ARC_CONFIG_PATH = new URL("../../../config/networks/arc-testnet.json", import.meta.url);

describe("Arc Testnet configuration boundary (A1)", () => {
  it("loads arc-testnet.json with the documented chain ID", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.chainId).toBe(5042002);
    expect(config.chainId).toBe(ARC_TESTNET_CHAIN_ID);
  });

  it("uses the Osaka EVM profile for Arc", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.evmProfile).toBe("osaka");
  });

  it("encodes the documented fee and finality policy", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.feePolicy).toEqual({ minBaseFeeGwei: "20", confirmations: 1 });
  });

  it("enables the zero-address value rejection policy", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.rejectsZeroAddressValue).toBe(true);
  });

  it("ships no fake contract addresses", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.deployedContracts).toEqual([]);
    expect(config.deploymentStatus).toBe("not-deployed");
  });

  it("defaults live-dependent values to verified:false", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(config.verified).toBe(false);
    expect(() => requireVerifiedNetwork(config)).toThrow(DomainError);
  });

  it("does not require verified-credit/ASC fields for the Arc MVP", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect("asc" in config).toBe(false);
    expect(config.unsupportedFeatures).toContain("verified-credit");
  });

  it("keeps the Creditcoin entry intact alongside Arc", () => {
    const creditcoin = getNetworkByChainId(102031);
    expect(creditcoin.id).toBe("creditcoin-advance-testnet");
    expect(creditcoin.protocol).toBe("creditcoin-evm");
    expect(creditcoin.evmProfile).toBe("shanghai");
    expect(creditcoin.nativeAsset.id).toBe("native-testnet-ctc");
  });

  it("asserts Arc chain identity fail-closed", () => {
    const config = loadArcTestnetConfig(ARC_CONFIG_PATH);
    expect(assertArcChainIdentity(config, 5042002)).toBe(true);
    expect(() => assertArcChainIdentity(config, 102031)).toThrow(DomainError);
    expect(() => assertArcChainIdentity(config, 0)).toThrow(DomainError);
  });

  it("rejects malformed Arc configs", () => {
    expect(() => parseChainNetworkConfig({ id: "arc-testnet" })).toThrow(DomainError);
  });
});
