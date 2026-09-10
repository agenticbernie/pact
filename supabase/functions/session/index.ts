/**
 * Hybrid wallet session routes (C3): EIP-191 one-time challenge + HMAC-signed
 * short-lived wallet-bound token.
 *
 * C-SESSION pins (verbatim, mirrored in migration + tests):
 * - challenge TTL 5 min (expires_at = now()+5min)
 * - session TTL 30 min (HMAC exp, expires_at = now()+30min)
 * - sha256-hex-only nonce_hash/token_hash (64-hex CHECK + indexes,
 *   NO plaintext token/signature/bearer columns)
 * - atomic consume WHERE nonce_hash=$1 AND consumed_at IS NULL
 *   (second verify -> AUTH_INVALID, no session)
 * - function-only SESSION_HMAC_SECRET with versioned rotation
 *   (verify-accept-old-for-one-session-TTL overlap then destroy; rotation
 *   statement reserved for report)
 *
 * Routes: POST /v1/session/challenge, POST /v1/session/verify,
 * POST /v1/session/revoke. Demo authorization uses a separate explicitly
 * configured demo token and cannot access secrets.
 */
import { randomBytes } from "node:crypto";
import { verifyMessage } from "ethers";
import {
  CHALLENGE_TTL_MS,
  SESSION_TTL_MS,
  SESSION_HMAC_SECRET_NAME,
  buildChallengeMessage,
  hashNonce,
  hashToken,
  issueSessionToken,
  verifySessionToken,
} from "../_shared/session-token.ts";

export { CHALLENGE_TTL_MS, SESSION_TTL_MS, SESSION_HMAC_SECRET_NAME };

/** Canonical consume predicate (mirrors the migration's atomic UPDATE). */
export const CONSUME_PREDICATE = "WHERE nonce_hash=$1 AND consumed_at IS NULL";

export type ChallengeRecord = {
  nonceHash: string;
  wallet: string;
  message: string;
  expiresAtMs: number;
  consumedAtMs: number | null;
};

export type SessionRecord = {
  id: string;
  tokenHash: string;
  wallet: string;
  role: "user";
  issuedAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
};

export type SessionStore = {
  challenges: Map<string, ChallengeRecord>;
  sessions: Map<string, SessionRecord>;
};

export function createSessionStore(): SessionStore {
  return { challenges: new Map(), sessions: new Map() };
}

export function requestChallenge(
  store: SessionStore,
  input: { wallet: string; domain: string; chainLabel: string; nowMs?: number },
): { nonce: string; message: string; expiresAt: string } {
  const now = input.nowMs ?? Date.now();
  const nonce = randomBytes(32).toString("hex");
  const expiresAt = new Date(now + CHALLENGE_TTL_MS).toISOString();
  const issuedAt = new Date(now).toISOString();
  const message = buildChallengeMessage({
    domain: input.domain,
    chainLabel: input.chainLabel,
    wallet: input.wallet.toLowerCase(),
    nonce,
    issuedAt,
    expiresAt,
  });
  const nonceHash = hashNonce(nonce);
  store.challenges.set(nonceHash, {
    nonceHash,
    wallet: input.wallet.toLowerCase(),
    message,
    expiresAtMs: now + CHALLENGE_TTL_MS,
    consumedAtMs: null,
  });
  return { nonce, message, expiresAt };
}

export type VerifyFn = (message: string, signature: string) => string;

/** Live EIP-191 verifier (ethers `verifyMessage`). Tests inject a fake; no live calls locally. */
export const ethersVerify: VerifyFn = (message, signature) => verifyMessage(message, signature);

export function sessionError(code: "AUTH_REQUIRED" | "AUTH_INVALID" | "AUTH_EXPIRED"): Error & {
  code: string;
} {
  const messages = {
    AUTH_REQUIRED: "Authentication is required.",
    AUTH_INVALID: "Authentication is invalid.",
    AUTH_EXPIRED: "Authentication has expired.",
  } as const;
  return Object.assign(new Error(messages[code]), { code });
}

export function verifyChallenge(
  store: SessionStore,
  input: { nonce: string; signature: string; secret: string; nowMs?: number },
  verifyFn: VerifyFn = ethersVerify,
): { token: string; sessionId: string } {
  const now = input.nowMs ?? Date.now();
  const nonceHash = hashNonce(input.nonce);
  const record = store.challenges.get(nonceHash) ?? null;
  // Atomic consume: WHERE nonce_hash=$1 AND consumed_at IS NULL.
  if (record === null || record.consumedAtMs !== null) {
    throw sessionError("AUTH_INVALID");
  }
  if (record.expiresAtMs <= now) {
    throw sessionError("AUTH_EXPIRED");
  }
  let recovered: string;
  try {
    recovered = verifyFn(record.message, input.signature).toLowerCase();
  } catch {
    throw sessionError("AUTH_INVALID");
  }
  if (recovered !== record.wallet) {
    throw sessionError("AUTH_INVALID");
  }
  record.consumedAtMs = now;
  const sessionId = randomBytes(16).toString("hex");
  const token = issueSessionToken(
    { sessionId, wallet: record.wallet, role: "user" },
    input.secret,
    now,
  );
  store.sessions.set(sessionId, {
    id: sessionId,
    tokenHash: hashToken(token),
    wallet: record.wallet,
    role: "user",
    issuedAtMs: now,
    expiresAtMs: now + SESSION_TTL_MS,
    revokedAtMs: null,
  });
  return { token, sessionId };
}

export function revokeSession(
  store: SessionStore,
  input: { token: string; secret: string; nowMs?: number },
): { revoked: boolean } {
  const now = input.nowMs ?? Date.now();
  let wallet = "";
  try {
    wallet = verifySessionToken(input.token, input.secret, now).wallet;
  } catch {
    throw sessionError("AUTH_INVALID");
  }
  const tokenHash = hashToken(input.token);
  for (const session of store.sessions.values()) {
    if (session.tokenHash === tokenHash && session.wallet === wallet) {
      session.revokedAtMs = now;
      return { revoked: true };
    }
  }
  return { revoked: true };
}
