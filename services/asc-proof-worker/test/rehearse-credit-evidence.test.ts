import { describe, expect, it } from "vitest";
import {
  REQUIRED_PUBLIC,
  REQUIRED_SECRETS,
  MAINNET_BLOCKED,
  TARGET_ALLOWLIST,
  assertChainGuard,
  getDryRunReport,
} from "../../../scripts/asc/rehearse-credit-evidence.mjs";

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

describe("rehearse dry-run 5.2 (env names only, no provider)", () => {
  it("requires exactly the 8 operator inputs", () => {
    expect([...REQUIRED_PUBLIC, ...REQUIRED_SECRETS]).toHaveLength(8);
    expect(REQUIRED_PUBLIC).toContain("CREDITCOIN_RPC_URL");
    expect(REQUIRED_PUBLIC).toContain("SOURCE_CHAIN_RPC_URL");
    expect(REQUIRED_SECRETS).toContain("ASC_RELAYER_PRIVATE_KEY");
    expect(REQUIRED_SECRETS).toContain("DEPLOYER_PRIVATE_KEY");
  });

  it("passes dry-run when all 8 are present", () => {
    const r = getDryRunReport({ ...FULL_ENV });
    expect(r.dryRun).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("blocks dry-run when any one is missing", () => {
    for (const name of [...REQUIRED_PUBLIC, ...REQUIRED_SECRETS]) {
      const env = { ...FULL_ENV };
      delete env[name];
      const r = getDryRunReport(env);
      expect(r.ok, name).toBe(false);
      expect(r.missing, name).toContain(name);
    }
  });

  it("never prints secret values", () => {
    const r = getDryRunReport({ ...FULL_ENV });
    const s = JSON.stringify(r);
    expect(s).not.toContain("test-relayer-key-present");
    expect(s).not.toContain("test-deployer-key-present");
    expect(s).toContain("ASC_RELAYER_PRIVATE_KEY");
  });
});

describe("rehearse chain guard 5.1 (Task 5B lane: 102031-only target)", () => {
  it("accepts Advance target 102031 when config matches 102031", () => {
    expect(() =>
      assertChainGuard({ targetChainId: 102031, configChainId: 102031 }),
    ).not.toThrow();
  });

  it("rejects sibling Creditcoin IDs 102030 and 102032 even when matching config", () => {
    for (const id of [102030, 102032]) {
      expect(() =>
        assertChainGuard({ targetChainId: id, configChainId: id }),
      ).toThrow();
    }
  });

  it("rejects source chain 11155111 as a target (source is for key resolution only)", () => {
    expect(() =>
      assertChainGuard({ targetChainId: 11155111, configChainId: 11155111 }),
    ).toThrow();
    expect(() =>
      assertChainGuard({ targetChainId: 11155111, configChainId: 102031 }),
    ).toThrow();
  });

  it("rejects mainnet chain IDs anywhere", () => {
    for (const id of [1, 10, 56, 137, 42161]) {
      expect(MAINNET_BLOCKED).toContain(id);
      expect(() =>
        assertChainGuard({ targetChainId: id, configChainId: id }),
      ).toThrow();
    }
  });

  it("rejects target !== config (e.g. 102031 vs 102030)", () => {
    expect(() =>
      assertChainGuard({ targetChainId: 102031, configChainId: 102030 }),
    ).toThrow();
    expect(() =>
      assertChainGuard({ targetChainId: 102030, configChainId: 102031 }),
    ).toThrow();
  });

  it("rejects non-allowlisted target even when matching config", () => {
    expect(TARGET_ALLOWLIST).toContain(102031);
    expect(() =>
      assertChainGuard({ targetChainId: 31337, configChainId: 31337 }),
    ).toThrow();
  });
});
