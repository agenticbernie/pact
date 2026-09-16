import { describe, expect, it, vi } from "vitest";
import { startSessionServer } from "../../session/index.ts";
import { startGatewayServer } from "../../ai-gateway/index.ts";
import { startExecutorServer } from "../../agent-executor/index.ts";
import type { AiProvider } from "../../ai-gateway/provider-port.ts";
import { issueSessionToken } from "../../../../packages/domain/src/session-token.ts";
import { hashToken } from "../session-token.ts";

/**
 * G23 prefix-routing RED-first contract (supplement S3, 10 cases).
 *
 * Subject under test: the same `Deno.serve` handlers used in production
 * composition (`startSessionServer`, `startGatewayServer`,
 * `startExecutorServer`) with fake persistence/provider/store/transport only.
 * No network, no secrets, no live calls.
 *
 * RED definition (genuine, pre-fix): hosted-prefixed valid paths (cases 2-5)
 * return 404 `INPUT_INVALID` while bare equivalents succeed. This file never
 * imports the normalizer, so a RED run cannot fail as a missing-file artifact.
 *
 * GREEN definition (post-fix): the full bare+hosted matrix routes;
 * wrong-slug/duplicate/unknown/encoded/method-mismatch stay 404.
 *
 * URL-normalization notes (verified against Node `Request`/`URL`): `%`-forms
 * (`%76`, `%2E`, `%5C`) and `//` survive in `new URL(request.url).pathname`
 * and are asserted at handler level; raw `..` and raw backslash segments are
 * normalized away by `Request` before the handler sees them, so they are
 * covered here with handler URLs that normalize to unknown routes (still 404
 * before and after) while the normalizer itself fail-closes raw `..`/`\`.
 */

const WALLET = "0x1111111111111111111111111111111111111111";
const SESSION_SECRET = "local-only-session-secret";
const GATEWAY_TOKEN = issueSessionToken({ sessionId: "g23-session", wallet: WALLET, role: "user" }, SESSION_SECRET);

const GATEWAY_CARD = {
  cardId: "7",
  agent: "0x1111111111111111111111111111111111111111",
  asset: "native-testnet-ctc",
  recipient: "0x3333333333333333333333333333333333333333",
  policyVersion: 1,
};
const GATEWAY_MERCHANTS = [{ id: "coffee-demo", label: "Coffee" }];

const gatewayProvider: AiProvider = {
  parseIntent: async () => ({
    provider: "openai",
    model: "gpt-5.6-luna",
    merchantId: "coffee-demo",
    amountDecimal: "1",
    purpose: "coffee",
    confidence: 0.9,
  }),
};

type ServedHandler = (request: Request) => Response | Promise<Response>;

function serveSession(): ServedHandler {
  let served: ServedHandler | undefined;
  startSessionServer({
    serve: (handler) => {
      served = handler;
    },
    env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SESSION_SECRET },
    persistence: {
      insertChallenge: async () => undefined,
      consumeChallenge: async () => null,
      insertSession: async () => undefined,
      findSession: async () => null,
      revokeSession: async () => false,
    },
  });
  if (served === undefined) throw new Error("session server did not serve a handler");
  return served;
}

function serveGateway(): ServedHandler {
  let served: ServedHandler | undefined;
  startGatewayServer({
    serve: (handler) => {
      served = handler;
    },
    env: {
      PACT_EXPECTED_REGION: "ap-southeast-1",
      SB_REGION: "ap-southeast-1",
      SESSION_HMAC_SECRET: SESSION_SECRET,
      OPENAI_API_KEY: "test-only",
    },
    provider: gatewayProvider,
    card: GATEWAY_CARD,
    merchants: GATEWAY_MERCHANTS,
    store: { save: async () => undefined },
    sessionPersistence: {
      insertChallenge: async () => undefined,
      consumeChallenge: async () => null,
      insertSession: async () => undefined,
      findSession: async (tokenHash, wallet) => tokenHash === hashToken(GATEWAY_TOKEN) && wallet === WALLET
        ? {
          id: "g23-session",
          tokenHash,
          wallet,
          role: "user" as const,
          issuedAtMs: Date.now() - 1_000,
          expiresAtMs: Date.now() + 60_000,
          revokedAtMs: null,
        }
        : null,
      revokeSession: async () => false,
    },
  });
  if (served === undefined) throw new Error("gateway server did not serve a handler");
  return served;
}

function serveExecutor(): ServedHandler {
  let served: ServedHandler | undefined;
  startExecutorServer({
    serve: (handler) => {
      served = handler;
    },
    env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", CREDITCOIN_RPC_URL: "http://local-rpc.invalid" },
    transport: async (method) =>
      method === "eth_chainId"
        ? "0x18e8f"
        : { cardId: "7", agent: WALLET, policyVersion: 1, chainId: 102031, ok: true },
  });
  if (served === undefined) throw new Error("executor server did not serve a handler");
  return served;
}

function serveHealth(): ServedHandler {
  let served: ServedHandler | undefined;
  startGatewayServer({
    serve: (handler) => {
      served = handler;
    },
    env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1" },
  });
  if (served === undefined) throw new Error("health server did not serve a handler");
  return served;
}

function post(url: string, body: unknown, requestId: string, extraHeaders: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function rawPost(url: string, body: string, requestId: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body,
  });
}

function get(url: string, requestId: string): Request {
  return new Request(url, { method: "GET", headers: { "x-request-id": requestId } });
}

function gatewayAuthorization(): Record<string, string> {
  return { authorization: `Bearer ${GATEWAY_TOKEN}` };
}

const SESSION_CHALLENGE_BODY = { wallet: WALLET, domain: "pact.test", chainLabel: "advance-testnet" };
const GATEWAY_INTENT_BODY = { prompt: "buy coffee", cardId: "7" };
const EXECUTOR_PREFLIGHT_BODY = { intentId: "intent-1", cardId: "7", nonce: "7:1" };

describe("G23 Supabase prefix routing (RED-first)", () => {
  it("1. bare session challenge POST /v1/session/challenge stays reachable", async () => {
    const handler = serveSession();
    const response = await handler(
      post("https://regional.invalid/v1/session/challenge", SESSION_CHALLENGE_BODY, "req-g23-s1"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestId: "req-g23-s1" });
  });

  it("2. hosted session challenge POST /functions/v1/session/v1/session/challenge routes post-fix", async () => {
    const handler = serveSession();
    const response = await handler(
      post(
        "https://regional.invalid/functions/v1/session/v1/session/challenge",
        SESSION_CHALLENGE_BODY,
        "req-g23-s2",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestId: "req-g23-s2" });
  });

  it("3. hosted gateway intent POST /functions/v1/ai-gateway/v1/agent/intents returns the intent envelope post-fix", async () => {
    const handler = serveGateway();
    const response = await handler(
      post(
        "https://regional.invalid/functions/v1/ai-gateway/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-g2",
        gatewayAuthorization(),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ready", requestId: "req-g23-g2" });
  });

  it("4. hosted executor preflight POST /functions/v1/agent-executor/v1/payments/preflight returns the decision post-fix", async () => {
    const handler = serveExecutor();
    const response = await handler(
      post(
        "https://regional.invalid/functions/v1/agent-executor/v1/payments/preflight",
        EXECUTOR_PREFLIGHT_BODY,
        "req-g23-e1",
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      decision: "would_settle",
      requestId: "req-g23-e1",
    });
  });

  it("5. hosted health GET /functions/v1/ai-gateway/health returns the exact 7-key shape post-fix; bare stays green", async () => {
    const handler = serveHealth();
    const bare = await handler(get("https://regional.invalid/health", "req-g23-h-bare"));
    expect(bare.status).toBe(200);
    const bareBody = (await bare.json()) as Record<string, unknown>;
    expect(bareBody).toEqual({
      requestId: "req-g23-h-bare",
      configuredRegion: "ap-southeast-1",
      expectedRegion: "ap-southeast-1",
      chainId: 102031,
      provider: "openai",
      model: "gpt-5.6-luna",
      modelAvailable: false,
    });
    const hosted = await handler(
      get("https://regional.invalid/functions/v1/ai-gateway/health", "req-g23-h-hosted"),
    );
    expect(hosted.status).toBe(200);
    await expect(hosted.json()).resolves.toEqual({ ...bareBody, requestId: "req-g23-h-hosted" });
  });

  it("6. wrong-slug prefix stays 404 INPUT_INVALID before and after", async () => {
    const gateway = serveGateway();
    const wrongGateway = await gateway(
      post(
        "https://regional.invalid/functions/v1/session/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-w1",
      ),
    );
    expect(wrongGateway.status).toBe(404);
    await expect(wrongGateway.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-w1",
    });
    const session = serveSession();
    const wrongSession = await session(
      post(
        "https://regional.invalid/functions/v1/ai-gateway/v1/session/challenge",
        SESSION_CHALLENGE_BODY,
        "req-g23-w2",
      ),
    );
    expect(wrongSession.status).toBe(404);
    await expect(wrongSession.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-w2",
    });
  });

  it("7. duplicated prefix stays 404 INPUT_INVALID before and after", async () => {
    const handler = serveGateway();
    const response = await handler(
      post(
        "https://regional.invalid/functions/v1/ai-gateway/functions/v1/ai-gateway/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-d1",
      ),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-d1",
    });
  });

  it("8. unknown paths stay 404 INPUT_INVALID bare and hosted (incl. /health on session/executor)", async () => {
    const gateway = serveGateway();
    const bareUnknown = await gateway(post("https://regional.invalid/v1/unknown", {}, "req-g23-u1"));
    expect(bareUnknown.status).toBe(404);
    await expect(bareUnknown.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u1",
    });
    const hostedUnknown = await gateway(
      post("https://regional.invalid/functions/v1/ai-gateway/v1/unknown", {}, "req-g23-u2"),
    );
    expect(hostedUnknown.status).toBe(404);
    await expect(hostedUnknown.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u2",
    });
    const session = serveSession();
    const sessionBareHealth = await session(get("https://regional.invalid/health", "req-g23-u3"));
    expect(sessionBareHealth.status).toBe(404);
    await expect(sessionBareHealth.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u3",
    });
    const sessionHostedHealth = await session(
      get("https://regional.invalid/functions/v1/session/health", "req-g23-u4"),
    );
    expect(sessionHostedHealth.status).toBe(404);
    await expect(sessionHostedHealth.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u4",
    });
    const executor = serveExecutor();
    const executorBareHealth = await executor(get("https://regional.invalid/health", "req-g23-u5"));
    expect(executorBareHealth.status).toBe(404);
    await expect(executorBareHealth.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u5",
    });
    const executorHostedHealth = await executor(
      get("https://regional.invalid/functions/v1/agent-executor/health", "req-g23-u6"),
    );
    expect(executorHostedHealth.status).toBe(404);
    await expect(executorHostedHealth.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-u6",
    });
  });

  it("9. encoded/traversal shapes stay 404 INPUT_INVALID before and after (never decode-and-route)", async () => {
    const handler = serveGateway();
    const cases: Array<{ name: string; url: string; requestId: string; method: "GET" | "POST" }> = [
      {
        name: "percent-encoded path segment",
        url: "https://regional.invalid/functions/v1/ai-gateway/%76%31/agent/intents",
        requestId: "req-g23-x1",
        method: "POST",
      },
      {
        name: "percent-encoded dots",
        url: "https://regional.invalid/functions/v1/ai-gateway/v1/%2E%2E/health",
        requestId: "req-g23-x2",
        method: "POST",
      },
      {
        name: "empty segment in remainder",
        url: "https://regional.invalid/functions/v1/ai-gateway//v1/agent/intents",
        requestId: "req-g23-x3",
        method: "POST",
      },
      {
        name: "percent-encoded backslash",
        url: "https://regional.invalid/functions/v1/ai-gateway/v1%5Cagent%5Cintents",
        requestId: "req-g23-x4",
        method: "POST",
      },
      {
        name: "dot segment normalizing to an unknown route",
        url: "https://regional.invalid/functions/v1/ai-gateway/v1/agent/../intents",
        requestId: "req-g23-x5",
        method: "POST",
      },
      {
        name: "repeated slashes across the prefix",
        url: "https://regional.invalid//functions//v1//ai-gateway//health",
        requestId: "req-g23-x6",
        method: "GET",
      },
    ];
    for (const c of cases) {
      const request =
        c.method === "GET" ? get(c.url, c.requestId) : post(c.url, GATEWAY_INTENT_BODY, c.requestId);
      const response = await handler(request);
      expect(response.status, c.name).toBe(404);
      await expect(response.json(), c.name).resolves.toMatchObject({
        code: "INPUT_INVALID",
        requestId: c.requestId,
      });
    }
  });

  it("11. slug-preserved accept: own /<slug>/<rest> maps to the bare equivalent (true-fix §16)", async () => {
    const session = serveSession();
    const sessionPreserved = await session(
      post(
        "https://regional.invalid/session/v1/session/challenge",
        SESSION_CHALLENGE_BODY,
        "req-g23-t1",
      ),
    );
    expect(sessionPreserved.status).toBe(200);
    await expect(sessionPreserved.json()).resolves.toMatchObject({ requestId: "req-g23-t1" });

    const gateway = serveGateway();
    const gatewayPreserved = await gateway(
      post(
        "https://regional.invalid/ai-gateway/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-t2",
        gatewayAuthorization(),
      ),
    );
    expect(gatewayPreserved.status).toBe(200);
    await expect(gatewayPreserved.json()).resolves.toMatchObject({
      status: "ready",
      requestId: "req-g23-t2",
    });

    const executor = serveExecutor();
    const executorPreserved = await executor(
      post(
        "https://regional.invalid/agent-executor/v1/payments/preflight",
        EXECUTOR_PREFLIGHT_BODY,
        "req-g23-t3",
      ),
    );
    expect(executorPreserved.status).toBe(200);
    await expect(executorPreserved.json()).resolves.toMatchObject({
      decision: "would_settle",
      requestId: "req-g23-t3",
    });

    const health = serveHealth();
    const bareHealth = await health(get("https://regional.invalid/health", "req-g23-t4-bare"));
    expect(bareHealth.status).toBe(200);
    const bareHealthBody = (await bareHealth.json()) as Record<string, unknown>;
    const hostedHealth = await health(
      get("https://regional.invalid/ai-gateway/health", "req-g23-t4"),
    );
    expect(hostedHealth.status).toBe(200);
    await expect(hostedHealth.json()).resolves.toEqual({
      ...bareHealthBody,
      requestId: "req-g23-t4",
    });
  });

  it("12. slug-preserved reject: wrong slug, duplicate, bare slug, and nested prefix stay 404 (true-fix §16)", async () => {
    const gateway = serveGateway();
    const wrongGateway = await gateway(
      post(
        "https://regional.invalid/session/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-t5",
      ),
    );
    expect(wrongGateway.status).toBe(404);
    await expect(wrongGateway.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t5",
    });
    const session = serveSession();
    const wrongSession = await session(
      post(
        "https://regional.invalid/ai-gateway/v1/session/challenge",
        SESSION_CHALLENGE_BODY,
        "req-g23-t6",
      ),
    );
    expect(wrongSession.status).toBe(404);
    await expect(wrongSession.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t6",
    });
    const executor = serveExecutor();
    const wrongExecutor = await executor(
      post(
        "https://regional.invalid/session/v1/payments/preflight",
        EXECUTOR_PREFLIGHT_BODY,
        "req-g23-t7",
      ),
    );
    expect(wrongExecutor.status).toBe(404);
    await expect(wrongExecutor.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t7",
    });

    const duplicate = await gateway(
      post(
        "https://regional.invalid/ai-gateway/ai-gateway/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-t8",
      ),
    );
    expect(duplicate.status).toBe(404);
    await expect(duplicate.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t8",
    });
    const nestedPrefix = await gateway(
      post(
        "https://regional.invalid/ai-gateway/functions/v1/ai-gateway/v1/agent/intents",
        GATEWAY_INTENT_BODY,
        "req-g23-t9",
      ),
    );
    expect(nestedPrefix.status).toBe(404);
    await expect(nestedPrefix.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t9",
    });

    const bareSlugGateway = await gateway(get("https://regional.invalid/ai-gateway", "req-g23-t10"));
    expect(bareSlugGateway.status).toBe(404);
    await expect(bareSlugGateway.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t10",
    });
    const bareSlugSession = await session(get("https://regional.invalid/session", "req-g23-t11"));
    expect(bareSlugSession.status).toBe(404);
    await expect(bareSlugSession.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t11",
    });
    const bareSlugExecutor = await executor(
      get("https://regional.invalid/agent-executor", "req-g23-t12"),
    );
    expect(bareSlugExecutor.status).toBe(404);
    await expect(bareSlugExecutor.json()).resolves.toMatchObject({
      code: "INPUT_INVALID",
      requestId: "req-g23-t12",
    });
  });

  it("13. slug-preserved encoded/traversal remainders stay 404 (never decode-and-route, true-fix §16)", async () => {
    const handler = serveGateway();
    const cases: Array<{ name: string; url: string; requestId: string; method: "GET" | "POST" }> = [
      {
        name: "slug-preserved percent-encoded segment",
        url: "https://regional.invalid/ai-gateway/%76%31/agent/intents",
        requestId: "req-g23-t13",
        method: "POST",
      },
      {
        name: "slug-preserved percent-encoded dots",
        url: "https://regional.invalid/ai-gateway/v1/%2E%2E/health",
        requestId: "req-g23-t14",
        method: "POST",
      },
      {
        name: "slug-preserved empty segment in remainder",
        url: "https://regional.invalid/ai-gateway//v1/agent/intents",
        requestId: "req-g23-t15",
        method: "POST",
      },
      {
        name: "slug-preserved percent-encoded backslash",
        url: "https://regional.invalid/ai-gateway/v1%5Cagent%5Cintents",
        requestId: "req-g23-t16",
        method: "POST",
      },
      {
        name: "slug-preserved dot segment normalizing to an unknown route",
        url: "https://regional.invalid/ai-gateway/v1/agent/../intents",
        requestId: "req-g23-t17",
        method: "POST",
      },
    ];
    for (const c of cases) {
      const request =
        c.method === "GET" ? get(c.url, c.requestId) : post(c.url, GATEWAY_INTENT_BODY, c.requestId);
      const response = await handler(request);
      expect(response.status, c.name).toBe(404);
      await expect(response.json(), c.name).resolves.toMatchObject({
        code: "INPUT_INVALID",
        requestId: c.requestId,
      });
    }
  });

  it("14. own-slug-shaped bare extras are 404 before any protected work", async () => {
    const sessionPersistence = {
      insertChallenge: vi.fn(async () => undefined),
      consumeChallenge: vi.fn(async () => null),
      insertSession: vi.fn(async () => undefined),
      findSession: vi.fn(async () => null),
      revokeSession: vi.fn(async () => false),
    };
    const session = (() => {
      let served: ServedHandler | undefined;
      startSessionServer({
        serve: (handler) => { served = handler; },
        env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SESSION_SECRET },
        persistence: sessionPersistence,
      });
      if (served === undefined) throw new Error("session server did not serve a handler");
      return served;
    })();
    const provider = { parseIntent: vi.fn(async () => gatewayProvider.parseIntent({
      prompt: "buy coffee",
      card: GATEWAY_CARD,
      merchants: GATEWAY_MERCHANTS,
    })) };
    const cardStore = { getById: vi.fn(async () => null) };
    const intentStore = { save: vi.fn(async () => undefined) };
    const gateway = (() => {
      let served: ServedHandler | undefined;
      startGatewayServer({
        serve: (handler) => { served = handler; },
        env: {
          PACT_EXPECTED_REGION: "ap-southeast-1",
          SB_REGION: "ap-southeast-1",
          SESSION_HMAC_SECRET: SESSION_SECRET,
          OPENAI_API_KEY: "test-only",
        },
        provider,
        card: GATEWAY_CARD,
        cardStore,
        merchants: GATEWAY_MERCHANTS,
        store: intentStore,
        sessionPersistence,
      });
      if (served === undefined) throw new Error("gateway server did not serve a handler");
      return served;
    })();
    const transport = vi.fn(async (method: string) => method === "eth_chainId" ? "0x18e8f" : { ok: true });
    const readCard = vi.fn(async () => ({ cardId: "7", agent: WALLET, policyVersion: 1, chainId: 102031 }));
    const preflight = vi.fn(async () => ({ ok: true }));
    const executor = (() => {
      let served: ServedHandler | undefined;
      startExecutorServer({
        serve: (handler) => { served = handler; },
        env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SESSION_SECRET },
        readOnlyClient: { readCard, preflight },
        transport,
      });
      if (served === undefined) throw new Error("executor server did not serve a handler");
      return served;
    })();

    const sessionResponse = await session(
      rawPost("https://regional.invalid/session/v1/session/challenge/extra", "not-json", "req-g33-s"),
    );
    expect(sessionResponse.status).toBe(404);
    await expect(sessionResponse.json()).resolves.toMatchObject({ code: "INPUT_INVALID", requestId: "req-g33-s" });

    const gatewayResponse = await gateway(
      post("https://regional.invalid/ai-gateway/v1/agent/intents/extra", GATEWAY_INTENT_BODY, "req-g33-g"),
    );
    expect(gatewayResponse.status).toBe(404);
    await expect(gatewayResponse.json()).resolves.toMatchObject({ code: "INPUT_INVALID", requestId: "req-g33-g" });

    const executorResponse = await executor(
      post("https://regional.invalid/agent-executor/v1/payments/preflight/extra", EXECUTOR_PREFLIGHT_BODY, "req-g33-e"),
    );
    expect(executorResponse.status).toBe(404);
    await expect(executorResponse.json()).resolves.toMatchObject({ code: "INPUT_INVALID", requestId: "req-g33-e" });

    expect(sessionPersistence.insertChallenge).not.toHaveBeenCalled();
    expect(sessionPersistence.consumeChallenge).not.toHaveBeenCalled();
    expect(sessionPersistence.findSession).not.toHaveBeenCalled();
    expect(sessionPersistence.insertSession).not.toHaveBeenCalled();
    expect(sessionPersistence.revokeSession).not.toHaveBeenCalled();
    expect(provider.parseIntent).not.toHaveBeenCalled();
    expect(cardStore.getById).not.toHaveBeenCalled();
    expect(intentStore.save).not.toHaveBeenCalled();
    expect(readCard).not.toHaveBeenCalled();
    expect(preflight).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });
});
