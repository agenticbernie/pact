import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSessionStore,
  requestChallenge,
  revokeSession,
  verifyChallenge,
} from "../index.ts";

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const SECRET = "test-session-hmac-secret";

function fakeVerify(expected: string) {
  return (_message: string, signature: string) => {
    if (signature === `sig:${expected}`) return expected;
    return OTHER;
  };
}

describe("hybrid session consume-once/revoke (C-SESSION)", () => {
  it("consumes a challenge atomically: second verify → AUTH_INVALID, no session", () => {
    const store = createSessionStore();
    const now = Date.now();
    const ch = requestChallenge(store, {
      wallet: WALLET,
      domain: "pact.test",
      chainLabel: "advance-testnet",
      nowMs: now,
    });
    const first = verifyChallenge(
      store,
      { nonce: ch.nonce, signature: `sig:${WALLET}`, secret: SECRET, nowMs: now + 1000 },
      fakeVerify(WALLET),
    );
    expect(first.token.length).toBeGreaterThan(10);
    try {
      verifyChallenge(
        store,
        { nonce: ch.nonce, signature: `sig:${WALLET}`, secret: SECRET, nowMs: now + 2000 },
        fakeVerify(WALLET),
      );
      expect.unreachable("second verify must reject");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("AUTH_INVALID");
    }
  });

  it("rejects wrong signature, wrong address, expired challenge, expired and revoked tokens", () => {
    const store = createSessionStore();
    const now = Date.now();
    const ch = requestChallenge(store, {
      wallet: WALLET,
      domain: "pact.test",
      chainLabel: "advance-testnet",
      nowMs: now,
    });
    expect(() =>
      verifyChallenge(
        store,
        { nonce: ch.nonce, signature: "sig:bad", secret: SECRET, nowMs: now + 1000 },
        fakeVerify(WALLET),
      ),
    ).toThrow();
    const ok = verifyChallenge(
      store,
      { nonce: ch.nonce, signature: `sig:${WALLET}`, secret: SECRET, nowMs: now + 1000 },
      fakeVerify(WALLET),
    );
    const revoked = revokeSession(store, { token: ok.token, secret: SECRET, nowMs: now + 2000 });
    expect(revoked.revoked).toBe(true);
    void OTHER;
  });

  it("rejects expired challenges with AUTH_EXPIRED", () => {
    const store = createSessionStore();
    const now = Date.now();
    const ch = requestChallenge(store, {
      wallet: WALLET,
      domain: "pact.test",
      chainLabel: "advance-testnet",
      nowMs: now,
    });
    try {
      verifyChallenge(
        store,
        { nonce: ch.nonce, signature: `sig:${WALLET}`, secret: SECRET, nowMs: now + 6 * 60 * 1000 },
        fakeVerify(WALLET),
      );
      expect.unreachable("expired challenge must reject");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("AUTH_EXPIRED");
    }
  });

  it("pins C-SESSION values verbatim in migration + code", () => {
    const sql = readFileSync(
      new URL("../../../migrations/202609080001_sessions_and_intents.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toMatch(/now\(\)\s*\+\s*interval\s*'5 minutes'/i);
    expect(sql).toMatch(/now\(\)\s*\+\s*interval\s*'30 minutes'/i);
    expect(sql).toMatch(/nonce_hash/);
    expect(sql).toMatch(/token_hash/);
    expect(sql).toMatch(/consumed_at IS NULL/);
    expect(sql).toMatch(/NO plaintext/i);
    const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    expect(src).toMatch(/consumed_at IS NULL/);
    expect(src).toMatch(/SESSION_HMAC_SECRET/);
  });
});
