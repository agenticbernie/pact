import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../../../scripts/verify-arc-deployment.mjs", import.meta.url), "utf8");

describe("Arc deployment verifier", () => {
  it("uses read-only provider calls and never creates a signer or mutation", () => {
    expect(script).toContain("JsonRpcProvider");
    expect(script).not.toMatch(/Wallet|Signer|sendTransaction|eth_send|startBroadcast|fundPool|registerMerchant/);
  });

  it("pins the approved Arc deployment identity and state expectations", () => {
    expect(script).toContain("5042002");
    expect(script).toContain("62906924");
    expect(script).toContain("1000000000000000000n");
    expect(script).toContain("020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70");
  });
});
