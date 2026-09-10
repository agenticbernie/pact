import { describe, expect, it } from "vitest";
import { checkStepZero, STEP0_PUBLIC, STEP0_SECRET } from "../../../scripts/asc/print-proof-input.mjs";

const FULL_ENV: Record<string, string> = {
  CREDITCOIN_RPC_URL: "https://rpc.example.invalid",
  SOURCE_CHAIN_RPC_URL: "https://sepolia.example.invalid",
  PROOF_BUILDER_URL: "https://builder.example.invalid",
  AGENT_WALLET_ADDRESS: "0x0000000000000000000000000000000000000001",
  RELAYER_WALLET_ADDRESS: "0x0000000000000000000000000000000000000002",
  DEPLOYER_WALLET_ADDRESS: "0x0000000000000000000000000000000000000003",
  ASC_RELAYER_PRIVATE_KEY: "test-relayer-key-present",
  DEPLOYER_PRIVATE_KEY: "test-deployer-key-present",
};

describe("staged hybrid input gate", () => {
  it("passes Step 0 when all 8 operator inputs are present", () => {
    const result = checkStepZero({ ...FULL_ENV });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("blocks Step 0 when any one of the 8 true operator inputs is missing", () => {
    const all = [...STEP0_PUBLIC, ...STEP0_SECRET];
    expect(all).toHaveLength(8);
    for (const name of all) {
      const env = { ...FULL_ENV };
      delete env[name];
      const result = checkStepZero(env);
      expect(result.ok, name).toBe(false);
      expect(result.missing, name).toContain(name);
    }
  });

  it("does not block on missing derived values", () => {
    const env = { ...FULL_ENV };
    delete env.SOURCE_CHAIN_KEY;
    const result = checkStepZero(env);
    expect(result.ok).toBe(true);
    expect(result.pendingDerived).toContain("SOURCE_CHAIN_KEY");
  });

  it("does not block on missing deployment outputs", () => {
    const env = { ...FULL_ENV };
    delete env.SOURCE_CREDIT_SOURCE_ADDRESS;
    delete env.PACT_CREDIT_ASC_ADDRESS;
    const result = checkStepZero(env);
    expect(result.ok).toBe(true);
    expect(result.pendingDerived).toEqual(
      expect.arrayContaining(["SOURCE_CREDIT_SOURCE_ADDRESS", "PACT_CREDIT_ASC_ADDRESS"]),
    );
  });

  it("never requires the funder private key", () => {
    const withFunder = checkStepZero({ ...FULL_ENV, FUNDER_PRIVATE_KEY: "0xcccc" });
    expect(withFunder.ok).toBe(true);
    const withoutFunder = checkStepZero({ ...FULL_ENV });
    expect(withoutFunder.ok).toBe(true);
    expect(JSON.stringify(withFunder)).not.toContain("0xcccc");
  });

  it("presence-checks secrets without printing values", () => {
    const result = checkStepZero({ ...FULL_ENV });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("test-relayer-key-present");
    expect(serialized).not.toContain("test-deployer-key-present");
    expect(serialized).toContain("ASC_RELAYER_PRIVATE_KEY");
    expect(serialized).toContain("DEPLOYER_PRIVATE_KEY");
  });
});
