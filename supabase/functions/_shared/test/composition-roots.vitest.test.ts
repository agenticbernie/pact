import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createFakePersistence,
  createPostgrestPersistence,
  requirePostgrestConfig,
} from "../persistence-composition.ts";
import { startSessionServer } from "../../session/index.ts";
import { startGatewayServer } from "../../ai-gateway/index.ts";
import { startExecutorServer } from "../../agent-executor/index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";

describe("G21 composition roots (Option A explicit selection)", () => {
  it("creates deterministic fake persistence for Vitest/local factories only", async () => {
    const fake = createFakePersistence();
    expect(fake.session).toBeDefined();
    expect(fake.intent).toBeDefined();
    expect(fake.card).toBeDefined();
    // Fake session round-trip stays local and hash-only.
    await fake.session.insertChallenge({
      nonceHash: "a".repeat(64),
      wallet: WALLET.toLowerCase(),
      message: "local challenge",
      expiresAtMs: Date.now() + 5 * 60 * 1000,
      consumedAtMs: null,
    });
    const consumed = await fake.session.consumeChallenge("a".repeat(64));
    expect(consumed?.nonceHash).toBe("a".repeat(64));
    const replay = await fake.session.consumeChallenge("a".repeat(64));
    expect(replay).toBeNull();
  });

  it("requires SUPABASE_URL and SERVICE_ROLE for PostgREST with no silent fallback", () => {
    expect(() =>
      requirePostgrestConfig({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }),
    ).toThrow();
    expect(() =>
      requirePostgrestConfig({ SUPABASE_URL: "https://ref.supabase.co", SUPABASE_SERVICE_ROLE_KEY: undefined }),
    ).toThrow();
    const config = requirePostgrestConfig({
      SUPABASE_URL: "https://ref.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role",
    });
    expect(config.supabaseUrl).toBe("https://ref.supabase.co");
    // Explicit selection only: no auto-fallback helper exists.
    const src = readFileSync(new URL("../persistence-composition.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/fallback.*fake|fake.*fallback/i);
    expect(src).not.toMatch(/\?\? createFake/);
    const postgrest = createPostgrestPersistence(config, async () => ({ status: 200, body: [] }));
    expect(postgrest.session).toBeDefined();
    expect(postgrest.intent).toBeDefined();
    expect(postgrest.card).toBeDefined();
  });

  it("wires session startServer on the same path as Deno.serve with fail-closed missing config", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startSessionServer({
      serve: (handler) => {
        served = handler;
      },
      env: { SUPABASE_FUNCTION_REGION: "us-east-1", SESSION_HMAC_SECRET: "local-secret" },
      persistence: createFakePersistence().session,
    });
    expect(served).toBeDefined();
    const ok = await served!(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      body: JSON.stringify({ wallet: WALLET, domain: "pact.test", chainLabel: "advance-testnet" }),
    }));
    expect(ok.status).toBe(200);

    let closed: ((request: Request) => Response | Promise<Response>) | undefined;
    startSessionServer({
      serve: (handler) => {
        closed = handler;
      },
      env: {},
    });
    const denied = await closed!(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      body: JSON.stringify({ wallet: WALLET }),
    }));
    expect(denied.status).toBe(503);
  });

  it("wires gateway and executor startServer with fail-closed missing config and no hardcoded fakes", async () => {
    let gatewayServed: ((request: Request) => Response | Promise<Response>) | undefined;
    startGatewayServer({
      serve: (handler) => {
        gatewayServed = handler;
      },
      env: {},
    });
    const gatewayClosed = await gatewayServed!(new Request("https://regional.invalid/v1/agent/intents", {
      method: "POST",
      body: JSON.stringify({ prompt: "hi", cardId: "7" }),
    }));
    expect([400, 503, 404]).toContain(gatewayClosed.status);

    let executorServed: ((request: Request) => Response | Promise<Response>) | undefined;
    startExecutorServer({
      serve: (handler) => {
        executorServed = handler;
      },
      env: {},
    });
    const executorClosed = await executorServed!(new Request("https://regional.invalid/v1/payments/preflight", {
      method: "POST",
      body: JSON.stringify({ intentId: "x", cardId: "7", nonce: "7:1" }),
    }));
    expect([503, 404]).toContain(executorClosed.status);

    // No hardcoded fakes in production composition paths.
    for (const file of ["../../session/index.ts", "../../ai-gateway/index.ts", "../../agent-executor/index.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).not.toMatch(/createFakePersistence/);
      expect(src).not.toMatch(/hardcoded.*fake/i);
    }
    const gatewaySrc = readFileSync(new URL("../../ai-gateway/index.ts", import.meta.url), "utf8");
    expect(gatewaySrc).not.toMatch(/sendPayment/);
    expect(gatewaySrc).not.toMatch(/chain-client/);
    expect(gatewaySrc).not.toMatch(/PRIVATE_KEY\s*[:=]\s*["']?0x/);
  });

  it("documents Deno.serve parity: all three servers expose start*Server used by Deno.serve", () => {
    for (const file of ["../../session/index.ts", "../../ai-gateway/index.ts", "../../agent-executor/index.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src).toMatch(/Deno\.serve/);
      expect(src).toMatch(/start(Session|Gateway|Executor)Server/);
    }
  });
});
