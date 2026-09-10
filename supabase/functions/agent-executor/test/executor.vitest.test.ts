import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createExecutorStore,
  handleExecute,
  handlePreflight,
  type ExecutorDeps,
  type StoredIntent,
} from "../index.ts";
import type { PaymentClient } from "../chain-client.ts";

const AGENT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const NOW = Date.parse("2026-09-09T00:00:00Z");

function intent(overrides: Partial<StoredIntent> = {}): StoredIntent {
  return {
    intentId: "intent-req-1",
    agent: AGENT,
    cardId: "7",
    merchantId: "coffee-demo",
    amountBaseUnits: "250",
    policyVersion: 1,
    expiresAtMs: NOW + 15 * 60 * 1000,
    ...overrides,
  };
}

function fakeClient(overrides: Partial<PaymentClient> = {}): PaymentClient & {
  calls: { send: number; order: string[] };
} {
  const order: string[] = [];
  const calls = { send: 0, order };
  return {
    calls,
    readCard: () =>
      Promise.resolve({ cardId: "7", agent: AGENT, policyVersion: 1, chainId: 102031 }),
    preflight: () => Promise.resolve({ ok: true }),
    sendPayment: (input: { intentId: string }) => {
      calls.send += 1;
      calls.order.push("send");
      return Promise.resolve({ txHash: `0xhash-${input.intentId}` });
    },
    waitForReceipt: (txHash: string) => {
      calls.order.push("wait");
      return Promise.resolve({ status: 1 as const, txHash });
    },
    findByNonce: () => Promise.resolve(null),
    ...overrides,
  };
}

function deps(client: PaymentClient, extra: Partial<ExecutorDeps> = {}): ExecutorDeps {
  return {
    store: createExecutorStore(),
    client,
    intents: new Map([["intent-req-1", intent()]]),
    expectedChainId: 102031,
    signerChainId: 102031,
    nowMs: NOW,
    ...extra,
  };
}

describe("executor fail-closed + reconcile (C-DDL)", () => {
  it("rejects owner/session mismatch with zero sends", async () => {
    const client = fakeClient();
    const res = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "idem-1", sessionWallet: OTHER, requestId: "req-x" },
      deps(client),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("AUTH_INVALID");
    }
    expect(client.calls.send).toBe(0);
  });

  it("rejects missing/expired intents, card-changed, preflight decline, chain mismatch", async () => {
    const cases: Array<{ name: string; build: () => Promise<unknown>; code: string }> = [
      {
        name: "missing",
        build: () =>
          handleExecute(
            { intentId: "nope", idempotencyKey: "i", sessionWallet: AGENT, requestId: "r" },
            deps(fakeClient()),
          ),
        code: "INPUT_INVALID",
      },
      {
        name: "expired",
        build: () =>
          handleExecute(
            { intentId: "intent-req-1", idempotencyKey: "i", sessionWallet: AGENT, requestId: "r" },
            deps(fakeClient(), { intents: new Map([["intent-req-1", intent({ expiresAtMs: NOW - 1 })]]) }),
          ),
        code: "PREFLIGHT_DECLINED",
      },
      {
        name: "card-changed",
        build: () =>
          handleExecute(
            { intentId: "intent-req-1", idempotencyKey: "i", sessionWallet: AGENT, requestId: "r" },
            deps(
              fakeClient({
                readCard: () =>
                  Promise.resolve({ cardId: "7", agent: AGENT, policyVersion: 2, chainId: 102031 }),
              }),
            ),
          ),
        code: "CARD_NOT_ELIGIBLE",
      },
      {
        name: "preflight-decline",
        build: () =>
          handleExecute(
            { intentId: "intent-req-1", idempotencyKey: "i", sessionWallet: AGENT, requestId: "r" },
            deps(fakeClient({ preflight: () => Promise.resolve({ ok: false, reasonCode: "policy" }) })),
          ),
        code: "PREFLIGHT_DECLINED",
      },
      {
        name: "chain-mismatch",
        build: () =>
          handleExecute(
            { intentId: "intent-req-1", idempotencyKey: "i", sessionWallet: AGENT, requestId: "r" },
            deps(fakeClient(), { signerChainId: 1 }),
          ),
        code: "NETWORK_CONFIG_INVALID",
      },
    ];
    for (const c of cases) {
      const res = (await c.build()) as { ok: boolean; error?: { code: string } };
      expect(res.ok, c.name).toBe(false);
      expect(res.error?.code, c.name).toBe(c.code);
    }
  });

  it("duplicate idempotency → one send; store-before-wait ordering holds", async () => {
    const store = createExecutorStore();
    let storedBeforeWait: boolean | null = null;
    const client = fakeClient({
      waitForReceipt: (txHash: string) => {
        // Ordering proof: the attempt row must already hold txHash when wait starts.
        storedBeforeWait = store.get("intent-req-1|idem-dup")?.txHash === txHash;
        return Promise.resolve({ status: 1 as const, txHash });
      },
    });
    const d = deps(client, { store });
    const first = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "idem-dup", sessionWallet: AGENT, requestId: "r1" },
      d,
    );
    expect(first.ok).toBe(true);
    const second = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "idem-dup", sessionWallet: AGENT, requestId: "r2" },
      d,
    );
    expect(second.ok).toBe(true);
    expect(client.calls.send).toBe(1);
    // store-txHash-before-wait: the attempt row holds txHash and wait ran after.
    const attempt = d.store.get("intent-req-1|idem-dup");
    expect(attempt?.txHash).toMatch(/^0xhash-/);
    expect(storedBeforeWait).toBe(true);
  });

  it("receipt status 0 never settles; timeout reconciles without resubmit", async () => {
    const reverted = fakeClient({
      waitForReceipt: (txHash: string) => Promise.resolve({ status: 0 as const, txHash }),
    });
    const r1 = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "i-rev", sessionWallet: AGENT, requestId: "r" },
      deps(reverted),
    );
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.status).toBe("failed");
    }
    const timingOut = fakeClient({
      waitForReceipt: () => Promise.reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })),
      findByNonce: () => Promise.resolve(null),
    });
    const r2 = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "i-to", sessionWallet: AGENT, requestId: "r" },
      deps(timingOut),
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe("PAYMENT_RECONCILIATION_REQUIRED");
    }
    expect(timingOut.calls.send).toBe(1);
  });

  it("settles only on receipt.status==1 and leaks no signer/key material", async () => {
    const client = fakeClient();
    const res = await handleExecute(
      { intentId: "intent-req-1", idempotencyKey: "i-ok", sessionWallet: AGENT, requestId: "r" },
      deps(client),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("settled");
    }
    const serialized = JSON.stringify(res);
    expect(serialized).not.toMatch(/privateKey/i);
    expect(serialized).not.toMatch(/mnemonic/i);
    const pre = await handlePreflight({ intentId: "intent-req-1", requestId: "r" }, deps(fakeClient()));
    expect(pre.decision).toBe("would_settle");
    for (const file of ["../index.ts", "../chain-client.ts", "../payment-reconciler.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).not.toMatch(/privateKey\s*[:=]\s*["']?0x[0-9a-fA-F]{64}/);
    }
    const gatewayIndex = readFileSync(new URL("../../ai-gateway/index.ts", import.meta.url), "utf8");
    expect(gatewayIndex).not.toMatch(/chain-client/);
    expect(gatewayIndex).not.toMatch(/sendPayment/);
  });
});
