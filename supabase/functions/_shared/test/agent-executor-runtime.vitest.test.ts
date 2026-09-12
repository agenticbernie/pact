import { describe, expect, it } from "vitest";
import { createExecutorCompositionRoot, startExecutorServer } from "../../agent-executor/index.ts";
import { createReadOnlyRpcPaymentClient } from "../../agent-executor/chain-client.ts";

describe("G16 read-only executor runtime boundary", () => {
  it("uses the production composition root passed to Deno.serve", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startExecutorServer({
      serve: (handler) => { served = handler; },
      env: { SUPABASE_FUNCTION_REGION: "us-east-1", CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
      transport: async (method) => method === "eth_chainId" ? "0x18e8f" : { ok: true },
    });
    expect(served).toBeDefined();
    const response = await served!(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      body: JSON.stringify({ intentId: "intent-1", cardId: "7", nonce: "7:1" }),
    }));
    expect(response.status).toBe(200);
  });

  it("uses only chain identity and eth_call with server-bound values", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const client = createReadOnlyRpcPaymentClient({
      rpcUrl: "http://local-rpc.invalid",
      expectedChainId: 102031,
      transport: async (method, params) => {
        calls.push({ method, params });
        if (method === "eth_chainId") return "0x18e8f";
        return { cardId: "7", agent: "0x1111111111111111111111111111111111111111", policyVersion: 1, chainId: 102031, ok: true };
      },
    });
    const handler = createExecutorCompositionRoot({
      env: { SUPABASE_FUNCTION_REGION: "us-east-1", CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
      readOnlyClient: client,
    });
    const response = await handler(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-executor" },
      body: JSON.stringify({ intentId: "intent-1", cardId: "7", nonce: "7:1" }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, decision: "would_settle", requestId: "req-executor" });
    expect(calls.map((call) => call.method)).toEqual(["eth_chainId", "eth_call", "eth_chainId", "eth_call"]);
    expect(JSON.stringify(calls)).not.toMatch(/privateKey|sendRawTransaction|eth_sendTransaction/);
  });
});
