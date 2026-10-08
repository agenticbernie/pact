import { describe, expect, it } from "vitest";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { createReadApiHandler, type ReadApiDeps } from "../index.ts";
import type { CardReadModel, PaymentAttemptRow, ReadStore } from "../read-store.ts";

const SECRET = "phase05-test-session-secret";
const WALLET = "0x83bc000000000000000000000000000000000001";
const TX_HASH = "0x" + "cd".repeat(32);
const TOKEN = issueSessionToken({ sessionId: "s1", wallet: WALLET, role: "user" }, SECRET);

const CARD: CardReadModel = {
  cardId: "2",
  controllerAddress: "0x7a474c005433def5fc496d2016f6ae794edfc423",
  ownerAddress: WALLET,
  agentId: "0x1111111111111111111111111111111111111111",
  asset: "arc-testnet-usdc",
  status: "ACTIVE",
  ownerConfiguredCap: "1000000",
  perTransactionLimit: "100000",
  verifiedCredit: "5000",
  spent: "5",
  expiresAt: "2026-12-01T00:00:00.000Z",
  policyVersion: 1,
  sourceBlock: 66170000,
  updatedAt: "2026-10-08T00:00:00.000Z",
};

const ATTEMPT: PaymentAttemptRow = {
  paymentId: "intent-req-card2-pay-1",
  intentId: "intent-req-card2-pay-1",
  cardId: "2",
  merchantId: "0x" + "11".repeat(32),
  amountBaseUnits: "5",
  asset: "arc-testnet-usdc",
  chainId: 5042002,
  intentHash: "0x" + "22".repeat(32),
  nonce: "7",
  status: "settled",
  txHash: TX_HASH,
};

function baseStore(overrides: Partial<ReadStore> = {}): ReadStore {
  return {
    async latestIndexedBlock() {
      return 66170486;
    },
    async getCard() {
      return CARD;
    },
    async listActivity() {
      return [];
    },
    async getPayment() {
      return ATTEMPT;
    },
    async hasIndexedPaymentEvent() {
      return false;
    },
    ...overrides,
  };
}

function makeHandler(
  storeOverrides: Partial<ReadStore> = {},
  depsOverrides: Partial<ReadApiDeps> = {},
): (request: Request) => Promise<Response> {
  return createReadApiHandler({
    store: baseStore(storeOverrides),
    chainId: 5042002,
    controller: "0x7a474c005433def5fc496d2016f6ae794edfc423",
    pool: "0x5e1771de29bd1a084900d032fd4db2ac7c7528b",
    merchant: "0xac030ddaa1fc29c1738332c3b9524ecfd0b4174f",
    explorerUrl: "https://explorer.testnet.arc.io",
    sessionSecret: SECRET,
    ...depsOverrides,
  });
}

function get(path: string, token?: string): Request {
  const headers: Record<string, string> = { "x-request-id": "req-test" };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  return new Request(`http://localhost${path}`, { method: "GET", headers });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("Phase 05 read API", () => {
  it("serves GET /v1/config publicly", async () => {
    const response = await makeHandler()(get("/v1/config"));
    expect(response.status).toBe(200);
    const payload = await body(response);
    expect(payload["chainId"]).toBe(5042002);
    expect(payload["latestIndexedBlock"]).toBe(66170486);
    expect(payload["explorerUrl"]).toBe("https://explorer.testnet.arc.io");
  });

  it("requires a wallet-bound session for card reads", async () => {
    const response = await makeHandler()(get("/v1/cards/2"));
    expect(response.status).toBe(401);
    expect((await body(response))["code"]).toBe("AUTH_REQUIRED");
  });

  it("returns the owned card projection with freshness metadata", async () => {
    const response = await makeHandler()(get("/v1/cards/2", TOKEN));
    expect(response.status).toBe(200);
    const payload = await body(response);
    const card = payload["card"] as Record<string, unknown>;
    expect(card["cardId"]).toBe("2");
    expect(payload["latestIndexedBlock"]).toBe(66170486);
    expect(payload["stale"]).toBe(false);
  });

  it("returns 404 for a card the session does not own", async () => {
    const response = await makeHandler({ async getCard() { return null; } })(get("/v1/cards/2", TOKEN));
    expect(response.status).toBe(404);
  });

  it("reports settled only with receipt AND indexed event", async () => {
    const handler = makeHandler(
      { async hasIndexedPaymentEvent() { return true; } },
      { receiptLookup: async () => ({ status: 1 as const }) },
    );
    const response = await handler(get(`/v1/payments/${ATTEMPT.paymentId}`, TOKEN));
    expect(response.status).toBe(200);
    const payload = await body(response);
    expect(payload["status"]).toBe("settled");
    expect(payload["receiptConfirmed"]).toBe(true);
    expect(payload["indexedPaymentEvent"]).toBe(true);
    expect(payload["explorerUrl"]).toBe(`https://explorer.testnet.arc.io/tx/${TX_HASH}`);
  });

  it("never settles a receipt without the indexed event", async () => {
    const handler = makeHandler({}, { receiptLookup: async () => ({ status: 1 as const }) });
    const payload = await body(await handler(get(`/v1/payments/${ATTEMPT.paymentId}`, TOKEN)));
    expect(payload["status"]).toBe("uncertain");
    expect(payload["reasonCode"]).toBe("PAYMENT_EVENT_NOT_INDEXED");
  });

  it("never settles an indexed event without a receipt", async () => {
    const handler = makeHandler({ async hasIndexedPaymentEvent() { return true; } });
    const payload = await body(await handler(get(`/v1/payments/${ATTEMPT.paymentId}`, TOKEN)));
    expect(payload["status"]).toBe("uncertain");
    expect(payload["reasonCode"]).toBe("RECEIPT_UNCONFIRMED");
  });

  it("surfaces a declined attempt as declined", async () => {
    const handler = makeHandler({
      async getPayment() {
        return { ...ATTEMPT, status: "declined", txHash: undefined };
      },
    });
    const payload = await body(await handler(get(`/v1/payments/${ATTEMPT.paymentId}`, TOKEN)));
    expect(payload["status"]).toBe("declined");
    expect(payload["reasonCode"]).toBe("PREFLIGHT_DECLINED");
  });

  it("rejects non-GET reads and unknown routes", async () => {
    const handler = makeHandler();
    const post = await handler(new Request("http://localhost/v1/config", { method: "POST" }));
    expect(post.status).toBe(400);
    const missing = await handler(get("/v1/unknown"));
    expect(missing.status).toBe(404);
  });
});
