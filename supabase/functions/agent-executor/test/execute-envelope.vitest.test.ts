import { describe, expect, it } from "vitest";
import {
  createExecutorEntrypointHandler,
  createInMemoryAttemptStore,
  createInMemoryIntentResolver,
  type ExecutorDeps,
  type StoredIntent,
} from "../index.ts";
import type { PaymentClient } from "../chain-client.ts";

/**
 * HTTP envelope of `POST /v1/payments/execute`.
 *
 * A refused settlement (`{ ok: false, error }`) must leave the entrypoint as an
 * error response: the ApiError envelope (`code`/`message`) at a non-2xx status.
 * Spreading the raw union at HTTP 200 let a client read a decline as a
 * settlement result and render an undefined `status`/`paymentId` — the console
 * showed a settled-looking banner titled "Settlement undefined".
 */

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

function client(): PaymentClient {
  return {
    readCard: () =>
      Promise.resolve({ cardId: "7", agent: AGENT, policyVersion: 1, chainId: 102031 }),
    preflight: () => Promise.resolve({ ok: true }),
    sendPayment: () => Promise.resolve({ txHash: "0xhash-1" }),
    waitForReceipt: (txHash: string) => Promise.resolve({ status: 1 as const, txHash }),
    findByNonce: () => Promise.resolve(null),
  };
}

function handler(): (request: Request) => Promise<Response> {
  const deps: ExecutorDeps = {
    store: createInMemoryAttemptStore(),
    client: client(),
    signerAddress: AGENT,
    resolveIntent: createInMemoryIntentResolver(new Map([["intent-req-1", intent()]])),
    expectedChainId: 102031,
    signerChainId: 102031,
    nowMs: NOW,
  };
  return createExecutorEntrypointHandler({
    expectedRegion: "us-east-1",
    actualRegion: "us-east-1",
    deps,
  });
}

function executeRequest(sessionWallet: string): Request {
  return new Request("https://executor.invalid/v1/payments/execute", {
    method: "POST",
    headers: { "x-request-id": "req-envelope-1", "content-type": "application/json" },
    body: JSON.stringify({
      intentId: "intent-req-1",
      idempotencyKey: "key-1",
      sessionWallet,
    }),
  });
}

describe("POST /v1/payments/execute envelope", () => {
  it("answers a refused settlement with the ApiError body and a non-2xx status", async () => {
    const response = await handler()(executeRequest(OTHER));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body["code"]).toBe("AUTH_INVALID");
    expect(body["requestId"]).toBe("req-envelope-1");
    // The raw result union must never leak: no `ok`/`error` wrapper, and no
    // settlement fields a client could mistake for a settlement.
    expect(body).not.toHaveProperty("ok");
    expect(body).not.toHaveProperty("error");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("paymentId");
  });

  it("still answers a settled attempt with 200 and the settlement fields", async () => {
    const response = await handler()(executeRequest(AGENT));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body["status"]).toBe("settled");
    expect(body["paymentId"]).toBe("intent-req-1|key-1");
  });
});
