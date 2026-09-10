import { describe, expect, it } from "vitest";
import {
  CHALLENGE_TTL_MS,
  SESSION_TTL_MS,
  SESSION_HMAC_SECRET_NAME,
  hashToken,
  is64Hex,
  issueSessionToken,
  verifySessionToken,
} from "../src/session-token.js";

describe("session token HMAC logic (C-SESSION)", () => {
  it("pins challenge TTL 5 min and session TTL 30 min", () => {
    expect(CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    expect(SESSION_TTL_MS).toBe(30 * 60 * 1000);
    expect(SESSION_HMAC_SECRET_NAME).toBe("SESSION_HMAC_SECRET");
  });

  it("round-trips a wallet-bound token", () => {
    const now = Date.now();
    const token = issueSessionToken(
      { sessionId: "sess-1", wallet: "0x1111111111111111111111111111111111111111", role: "user" },
      "test-secret-value",
      now,
    );
    expect(is64Hex(hashToken(token))).toBe(true);
    const payload = verifySessionToken(token, "test-secret-value", now + 1000);
    expect(payload.wallet).toBe("0x1111111111111111111111111111111111111111");
    expect(payload.exp - payload.iat).toBe(Math.floor(SESSION_TTL_MS / 1000));
  });

  it("rejects expired and tampered tokens", () => {
    const now = Date.now();
    const token = issueSessionToken(
      { sessionId: "sess-2", wallet: "0x1111111111111111111111111111111111111111", role: "user" },
      "test-secret-value",
      now,
    );
    expect(() => verifySessionToken(token, "test-secret-value", now + SESSION_TTL_MS + 1000)).toThrow();
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(() => verifySessionToken(tampered, "test-secret-value", now + 1000)).toThrow();
  });

  it("rejects wrong-wallet binding and wrong secret", () => {
    const now = Date.now();
    const token = issueSessionToken(
      { sessionId: "sess-3", wallet: "0x1111111111111111111111111111111111111111", role: "user" },
      "test-secret-value",
      now,
    );
    expect(() =>
      verifySessionToken(token, "test-secret-value", now + 1000, "0x2222222222222222222222222222222222222222"),
    ).toThrow();
    expect(() => verifySessionToken(token, "other-secret", now + 1000)).toThrow();
  });
});
