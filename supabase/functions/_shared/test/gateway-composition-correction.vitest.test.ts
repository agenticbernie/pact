import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createGatewayCompositionRoot } from "../../ai-gateway/index.ts";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { hashToken } from "../session-token.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const SECRET = "local-session-test";

function validDeps() {
  const provider = {
    parseIntent: vi.fn(async () => ({
      provider: "openai" as const,
      model: "gpt-5.6-luna",
      merchantId: "coffee-demo",
      amountDecimal: "1",
      purpose: "coffee",
      confidence: 1,
    })),
  };
  const store = { save: vi.fn(async () => undefined) };
  const cardStore = { getById: vi.fn(async () => null) };
  return {
    provider,
    store,
    cardStore,
    card: {
      cardId: "7",
      agent: WALLET,
      asset: "native-testnet-ctc",
      recipient: "0x3333333333333333333333333333333333333333",
      policyVersion: 1,
    },
    merchants: [{ id: "coffee-demo", label: "Coffee" }],
  };
}

describe("G27 gateway protected composition", () => {
  it("requires a configured secret and wallet-bound stored session before protected work", async () => {
    const deps = validDeps();
    const validToken = issueSessionToken({ sessionId: "session-1", wallet: WALLET, role: "user" }, SECRET);
    const sessionPersistence = {
      insertChallenge: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => null),
      insertSession: vi.fn(async () => undefined),
      findSession: vi.fn(async (tokenHash: string, wallet: string) =>
        tokenHash === hashToken(validToken) && wallet === WALLET
          ? {
            id: "session-1",
            tokenHash,
            wallet,
            role: "user" as const,
            issuedAtMs: Date.now() - 1_000,
            expiresAtMs: Date.now() + 60_000,
            revokedAtMs: null,
          }
          : null),
      revokeSession: vi.fn(async () => false),
    };
    const base = {
      env: {
         PACT_EXPECTED_REGION: "ap-southeast-1",
         SB_REGION: "ap-southeast-1",
        SESSION_HMAC_SECRET: SECRET,
        OPENAI_API_KEY: "local-provider-test",
      },
      ...deps,
      sessionPersistence,
    };
    const missingSecret = createGatewayCompositionRoot({
      ...base,
      env: { ...base.env, SESSION_HMAC_SECRET: undefined },
    });
    const missingSecretResponse = await missingSecret(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { "x-request-id": "req-missing-secret" },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(missingSecretResponse.status).toBe(503);
    expect(deps.provider.parseIntent).not.toHaveBeenCalled();
    expect(deps.store.save).not.toHaveBeenCalled();
    expect(sessionPersistence.findSession).not.toHaveBeenCalled();

    const blankSecret = createGatewayCompositionRoot({
      ...base,
      env: { ...base.env, SESSION_HMAC_SECRET: "   " },
    });
    const blankSecretResponse = await blankSecret(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(blankSecretResponse.status).toBe(503);
    expect(deps.cardStore.getById).not.toHaveBeenCalled();

    const missingSessionPersistence = createGatewayCompositionRoot({
      ...base,
      sessionPersistence: undefined,
    });
    const missingSessionResponse = await missingSessionPersistence(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(missingSessionResponse.status).toBe(503);

    const noStoredSession = createGatewayCompositionRoot({
      ...base,
      sessionPersistence: { ...sessionPersistence, findSession: vi.fn(async () => null) },
    });
    const tokenWithoutSession = issueSessionToken({ sessionId: "missing", wallet: WALLET, role: "user" }, SECRET);
    const rejected = await noStoredSession(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenWithoutSession}`, "x-request-id": "req-no-session" },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(rejected.status).toBe(401);
    expect(deps.provider.parseIntent).not.toHaveBeenCalled();
    expect(deps.store.save).not.toHaveBeenCalled();

    for (const [sessionId, session] of [
      ["expired", { revokedAtMs: null, expiresAtMs: Date.now() - 1_000 }],
      ["revoked", { revokedAtMs: Date.now() - 1_000, expiresAtMs: Date.now() + 60_000 }],
    ] as const) {
      const token = issueSessionToken({ sessionId, wallet: WALLET, role: "user" }, SECRET);
      const rejectedSession = createGatewayCompositionRoot({
        ...base,
        sessionPersistence: {
          ...sessionPersistence,
          findSession: vi.fn(async () => ({
            id: sessionId,
            tokenHash: hashToken(token),
            wallet: WALLET,
            role: "user" as const,
            issuedAtMs: Date.now() - 2_000,
            ...session,
          })),
        },
      });
      const response = await rejectedSession(new Request("https://regional.invalid/v1/agent/intents", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
      }));
      expect(response.status).toBe(401);
    }

    const wrongWalletToken = issueSessionToken({
      sessionId: "wrong-wallet",
      wallet: "0x2222222222222222222222222222222222222222",
      role: "user",
    }, SECRET);
    const wrongWallet = createGatewayCompositionRoot({
      ...base,
      sessionPersistence: { ...sessionPersistence, findSession: vi.fn(async () => null) },
    });
    const wrongWalletResponse = await wrongWallet(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { authorization: `Bearer ${wrongWalletToken}` },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(wrongWalletResponse.status).toBe(401);
    expect(deps.cardStore.getById).not.toHaveBeenCalled();

    const handler = createGatewayCompositionRoot(base);
    const missingToken = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(missingToken.status).toBe(401);
    expect(deps.provider.parseIntent).not.toHaveBeenCalled();

    const accepted = await handler(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      headers: { authorization: `Bearer ${validToken}`, "x-request-id": "req-intent" },
      body: JSON.stringify({ prompt: "buy coffee", cardId: "7" }),
    }));
    expect(accepted.status).toBe(200);
    expect(deps.provider.parseIntent).toHaveBeenCalledTimes(1);
    expect(deps.store.save).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical model source and shared persistence/card boundaries", () => {
    const source = readFileSync(new URL("../../ai-gateway/index.ts", import.meta.url), "utf8");
    expect(source).toMatch(/loadModelConfig|parseModelConfigJson/);
    expect(source).toMatch(/createPostgrestPersistenceFromEnv/);
    expect(source).toMatch(/requireSession/);
    expect(source).not.toMatch(/parseModelConfigJson\('\{/);
    expect(source).not.toMatch(/sendPayment|chain-client/);
  });
});
