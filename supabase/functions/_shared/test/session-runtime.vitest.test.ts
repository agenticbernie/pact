import { describe, expect, it } from "vitest";
import {
  startSessionServer,
  type SessionPersistence,
  type ChallengeRecord,
  type SessionRecord,
} from "../../session/index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const SECRET = "local-only-session-secret";

describe("G14 session runtime persistence boundary", () => {
  it("uses the production composition root passed to Deno.serve", async () => {
    let served: ((request: Request) => Response | Promise<Response>) | undefined;
    startSessionServer({
      serve: (handler) => { served = handler; },
      env: { PACT_EXPECTED_REGION: "ap-southeast-1", SB_REGION: "ap-southeast-1", SESSION_HMAC_SECRET: SECRET },
      persistence: {
        insertChallenge: async () => undefined,
        consumeChallenge: async () => null,
        insertSession: async () => undefined,
        findSession: async () => null,
        revokeSession: async () => false,
      },
    });
    expect(served).toBeDefined();
    const response = await served!(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      body: JSON.stringify({ wallet: WALLET, domain: "pact.test", chainLabel: "advance-testnet" }),
    }));
    expect(response.status).toBe(200);
  });

  it("uses the injected PostgREST-shaped port for atomic consume, hash-only writes, TTLs, and revoke", async () => {
    const { createSessionRuntime, createSessionEntrypointHandler } = await import("../../session/index.ts");
    const rows = new Map<string, ChallengeRecord | SessionRecord>();
    const persistence: SessionPersistence = {
      insertChallenge: async (row) => { rows.set(`challenge:${row.nonceHash}`, row); },
      consumeChallenge: async (nonceHash: string) => {
        const row = rows.get(`challenge:${nonceHash}`);
        if (row === undefined || !("nonceHash" in row) || row.consumedAtMs !== null) return null;
        row.consumedAtMs = Date.now();
        return row;
      },
      insertSession: async (row) => { rows.set(`session:${row.id}`, row); },
      findSession: async () => null,
      revokeSession: async () => true,
    };
    const runtime = createSessionRuntime({ persistence, secret: SECRET });
    const handler = createSessionEntrypointHandler({
      runtime,
       configuredRegion: "ap-southeast-1",
       expectedRegion: "ap-southeast-1",
       actualRegion: "ap-southeast-1",
      options: { nowMs: 1_000, verifyFn: (_message, signature) => signature.slice(4) },
    });
    const challengeResponse = await handler(new Request("https://regional.invalid/v1/session/challenge", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-session" },
      body: JSON.stringify({ wallet: WALLET, domain: "pact.test", chainLabel: "advance-testnet" }),
    }));
    expect(challengeResponse.status).toBe(200);
    const challenge = await challengeResponse.json() as { nonce: string; message: string; expiresAt: string };

    const firstResponse = await handler(new Request("https://regional.invalid/v1/session/verify", {
      method: "POST",
      body: JSON.stringify({ nonce: challenge.nonce, signature: `sig:${WALLET}` }),
    }));
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as { token: string };
    const replayResponse = await handler(new Request("https://regional.invalid/v1/session/verify", {
      method: "POST",
      body: JSON.stringify({ nonce: challenge.nonce, signature: `sig:${WALLET}` }),
    }));
    expect(replayResponse.status).toBe(401);
    await expect(replayResponse.json()).resolves.toMatchObject({ code: "AUTH_INVALID" });
    const revokeResponse = await handler(new Request("https://regional.invalid/v1/session/revoke", {
      method: "POST",
      headers: { authorization: `Bearer ${first.token}` },
    }));
    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toEqual(expect.objectContaining({ revoked: true }));

    expect([...rows.values()].length).toBeGreaterThan(1);
    expect([...rows.values()].every((row) => !("nonce" in row) && !("token" in row) && !("signature" in row))).toBe(true);
    const challengeRow = [...rows.values()].find((row) => "nonceHash" in row);
    expect(challengeRow?.nonceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(challengeRow?.expiresAtMs).toBe(301_000);
  });
});
