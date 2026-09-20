import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createReadOnlyRpcPaymentClient } from "../../agent-executor/chain-client.ts";
import { createExecutorCompositionRoot } from "../../agent-executor/index.ts";

const AGENT = "0x1111111111111111111111111111111111111111";

describe("G28 executor read-only composition", () => {
  it("uses only eth_chainId and static eth_call with persisted agent as from", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const client = createReadOnlyRpcPaymentClient({
      rpcUrl: "http://local-rpc.invalid",
      expectedChainId: 102031,
      agent: AGENT,
      transport: async (method, params) => {
        calls.push({ method, params });
        return method === "eth_chainId"
          ? "0x18e8f"
          : { cardId: "7", agent: AGENT, policyVersion: 1, chainId: 102031, ok: true };
      },
    });
    await client.readCard("7");
    await client.preflight({ intentId: "intent-1", idempotencyKey: "preflight", cardId: "7", nonce: "7:1" });
    expect(calls.map((call) => call.method)).toEqual(["eth_chainId", "eth_call", "eth_chainId", "eth_call"]);
    expect(JSON.stringify(calls)).toContain(AGENT);
    expect(JSON.stringify(calls)).not.toMatch(/eth_sendTransaction|sendRawTransaction|gas|privateKey|Wallet/i);
  });

  it("does not allow an incomplete production root to use a client-provided authority value", async () => {
    const readCard = vi.fn(async () => ({ cardId: "7", agent: AGENT, policyVersion: 1, chainId: 102031 }));
    const preflight = vi.fn(async () => ({ ok: true }));
    const handler = createExecutorCompositionRoot({
      env: {
        PACT_EXPECTED_REGION: "ap-southeast-1",
        SB_REGION: "ap-southeast-1",
        CREDITCOIN_RPC_URL: "http://local-rpc.invalid",
        SESSION_HMAC_SECRET: "local-session-test",
      },
      transport: async (method) => method === "eth_chainId" ? "0x18e8f" : { ok: true },
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      body: JSON.stringify({ intentId: "intent-1", cardId: "client-card", nonce: "client-nonce" }),
    }));
    expect(response.status).not.toBe(200);
    expect(readCard).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
  });

  it("keeps signer and send authority out of the read-only source graph", () => {
    const source = [
      readFileSync(new URL("../../agent-executor/index.ts", import.meta.url), "utf8"),
      readFileSync(new URL("../../agent-executor/chain-client.ts", import.meta.url), "utf8"),
    ].join("\n");
    // Arc migration: production read-only RPC resolves from the lane env
    // name (ARC_RPC_URL); the legacy name survives only in the domain lane
    // module (covered by arc-lane.test.ts), never as a second default here.
    expect(source).toMatch(/ARC_RPC_URL/);
    expect(source).toMatch(/lane-config/);
    expect(source).toMatch(/eth_chainId/);
    expect(source).toMatch(/eth_call/);
    expect(source).not.toMatch(/new Wallet|AGENT_SIGNER_PRIVATE_KEY\s*[:=]\s*Deno/);
    expect(source).not.toMatch(/eth_sendTransaction|sendRawTransaction|estimateGas/);
  });
});
