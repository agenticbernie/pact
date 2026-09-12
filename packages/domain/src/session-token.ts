import { createHash, createHmac } from "node:crypto";
import { DomainError } from "./errors.ts";
/**
 * Hybrid session token logic (C-SESSION, pure / Vitest-testable).
 *
 * Pins (verbatim, also encoded in the migration + session E2 tests):
 * - challenge TTL 5 min
 * - session TTL 30 min (HMAC `exp`, `expires_at = now()+30min`)
 * - sha256-hex-only `nonce_hash` / `token_hash` (64-hex, indexed, no plaintext)
 * - atomic consume `WHERE nonce_hash=$1 AND consumed_at IS NULL`
 * - function-only `SESSION_HMAC_SECRET` with versioned rotation
 *   (verify-accept-old-for-one-session-TTL overlap then destroy).
 */

/** Challenge TTL 5 min. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Session TTL 30 min. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Function-only HMAC secret name (never committed, never bundled to edge/browser). */
export const SESSION_HMAC_SECRET_NAME = "SESSION_HMAC_SECRET";

export type SessionRole = "user";

export type SessionTokenPayload = {
  sessionId: string;
  wallet: string;
  role: SessionRole;
  iat: number;
  exp: number;
};

const HEX64 = /^[0-9a-f]{64}$/;

export function is64Hex(value: string): boolean {
  return HEX64.test(value);
}

/** sha256 hex of a nonce or token (hash-only storage; no plaintext columns). */
export function hashNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

/** sha256 hex of a session token (hash-only storage; no plaintext columns). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP = new Map<string, number>([...B64_CHARS].map((c, i) => [c, i]));

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64_CHARS[(n >> 18) & 63];
    out += B64_CHARS[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64_CHARS[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? B64_CHARS[n & 63] : "=";
  }
  return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const full = remainder === 0 ? padded : padded + "=".repeat(4 - remainder);
  const bytes: number[] = [];
  for (let i = 0; i < full.length; i += 4) {
    const n =
      ((B64_LOOKUP.get(full[i] ?? "=") ?? 0) << 18) |
      ((B64_LOOKUP.get(full[i + 1] ?? "=") ?? 0) << 12) |
      ((B64_LOOKUP.get(full[i + 2] ?? "=") ?? 0) << 6) |
      (B64_LOOKUP.get(full[i + 3] ?? "=") ?? 0);
    bytes.push((n >> 16) & 255);
    if (full[i + 2] !== "=") {
      bytes.push((n >> 8) & 255);
    }
    if (full[i + 3] !== "=") {
      bytes.push(n & 255);
    }
  }
  return new Uint8Array(bytes);
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

function base64UrlEncode(input: string): string {
  return bytesToBase64Url(new TextEncoder().encode(input));
}

function base64UrlDecode(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

function normalizeWallet(wallet: string): string {
  return wallet.toLowerCase();
}

/**
 * Issue an HMAC-signed wallet-bound token carrying session ID, wallet, role,
 * issued-at, and expiry (30 min). Format: base64url(payload).base64url(sig).
 */
export function issueSessionToken(
  input: { sessionId: string; wallet: string; role: SessionRole },
  secret: string,
  nowMs: number = Date.now(),
): string {
  if (secret.length === 0) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Session secret is not configured.", {});
  }
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.floor(SESSION_TTL_MS / 1000);
  const payload: SessionTokenPayload = {
    sessionId: input.sessionId,
    wallet: normalizeWallet(input.wallet),
    role: input.role,
    iat,
    exp,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${sig}`;}

/**
 * Verify with the current secret, optionally accepting the previous secret
 * during the versioned-rotation overlap window (one session TTL, then the old
 * secret is destroyed — rotation statement reserved for the Phase 04 report).
 */
export function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
  expectedWallet?: string,
  previousSecret?: string,
): SessionTokenPayload {
  const payload = verifyWithSecret(token, secret, nowMs, expectedWallet);
  if (payload !== null) {
    return payload;
  }
  if (previousSecret !== undefined && previousSecret.length > 0) {
    const rotated = verifyWithSecret(token, previousSecret, nowMs, expectedWallet);
    if (rotated !== null) {
      return rotated;
    }
  }
  throw new DomainError("INTENT_SCHEMA_INVALID", "Session token is invalid.", {});
}

function verifyWithSecret(
  token: string,
  secret: string,
  nowMs: number,
  expectedWallet?: string,
): SessionTokenPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) {
    return null;
  }
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  } catch {
    return null;
  }
  if (!constantTimeEqual(expected, sig)) {
    return null;
  }
  let payload: SessionTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as SessionTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.sessionId !== "string" ||
    typeof payload.wallet !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  const nowSec = Math.floor(nowMs / 1000);
  if (payload.exp <= nowSec || payload.iat > nowSec) {
    return null;
  }
  if (expectedWallet !== undefined && normalizeWallet(payload.wallet) !== normalizeWallet(expectedWallet)) {
    return null;
  }
  return payload;
}

/** EIP-191 challenge message shape (domain, chain label, wallet, nonce, issued-at, expiry). */
export function buildChallengeMessage(input: {
  domain: string;
  chainLabel: string;
  wallet: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}): string {
  return [
    `${input.domain} wants you to sign in with your EVM account:`,
    input.wallet,
    "",
    `Chain: ${input.chainLabel}`,
    `Nonce: ${input.nonce}`,
    `Issued at: ${input.issuedAt}`,
    `Expires at: ${input.expiresAt}`,
  ].join("\n");
}
