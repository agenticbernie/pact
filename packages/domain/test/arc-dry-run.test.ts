import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = new URL("../../../", import.meta.url);
const DRY_RUN_SCRIPT = fileURLToPath(new URL("../../../scripts/dry-run-arc-deploy.mjs", import.meta.url));
const FOUNDRY_TOML = fileURLToPath(new URL("../../../contracts/foundry.toml", import.meta.url));
const ARC_CONFIG = fileURLToPath(
  new URL("../../../config/networks/arc-testnet.json", import.meta.url),
);

function runDryRun(env: Record<string, string>): { status: number; output: string } {
  const result = spawnSync(process.execPath, [DRY_RUN_SCRIPT, "--config", ARC_CONFIG], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    encoding: "utf8",
  });
  return { status: result.status ?? -1, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("Arc Osaka profile boundary (A1)", () => {
  it("declares an explicit arc profile without touching the default", () => {
    const toml = readFileSync(FOUNDRY_TOML, "utf8");
    expect(toml).toContain("[profile.arc]");
    expect(toml).toMatch(/\[profile\.arc\][\s\S]*?evm_version\s*=\s*"osaka"/);
    expect(toml).toMatch(/\[profile\.default\][\s\S]*?evm_version\s*=\s*"shanghai"/);
  });
});

describe("Arc deploy dry-run boundary (A1)", () => {
  it("fails closed with missing prerequisites and names them", () => {
    const { status, output } = runDryRun({});
    expect(status).not.toBe(0);
    expect(output).toContain("ARC_RPC_URL");
    expect(output).toContain("DEPLOYER_PRIVATE_KEY");
    expect(output).toMatch(/missing prerequisites/i);
  });

  it("never broadcasts, sends, funds, or touches the faucet", () => {
    const source = readFileSync(DRY_RUN_SCRIPT, "utf8");
    expect(source).not.toMatch(/startBroadcast|sendTransaction|eth_sendTransaction|cast\s+send/i);
    expect(source).not.toMatch(/fundPool|requestFaucet|faucetClaim/i);
    const { status, output } = runDryRun({});
    expect(status).not.toBe(0);
    expect(output).toMatch(/no broadcast, no deploy, no faucet call/i);
    expect(output).not.toMatch(/DRY_RUN_READY/);
  });

  it("prints the intended plan: deploy set, exclusions, and fee policy", () => {
    const { output } = runDryRun({});
    expect(output).toContain("PactCardController");
    expect(output).toContain("PactCreditPool");
    expect(output).toContain("MerchantSimulator");
    expect(output).toMatch(/excluded from the Arc MVP lane/i);
    expect(output).toContain("PactCreditASC");
    expect(output).toContain("20");
  });

  it("documents itself via node --check worthy syntax", () => {
    execFileSync(process.execPath, ["--check", DRY_RUN_SCRIPT], { stdio: "ignore" });
  });

  void REPO_ROOT;
});
