/**
 * Thin re-export of session token logic (no fork) + wallet-bound middleware.
 * Source of truth: `packages/domain/src/session-token.ts`.
 */
export {
  CHALLENGE_TTL_MS,
  SESSION_HMAC_SECRET_NAME,
  SESSION_TTL_MS,
  buildChallengeMessage,
  hashNonce,
  hashToken,
  is64Hex,
  issueSessionToken,
  verifySessionToken,
} from "../../../packages/domain/src/session-token.ts";

import { verifySessionToken } from "../../../packages/domain/src/session-token.ts";

export type SessionContext = {
  sessionId: string;
  wallet: string;
  role: string;
};

/**
 * Wallet-bound session middleware for intent/preflight/execute.
 * Requires a valid wallet-bound token; demo authorization uses a separate
 * explicitly configured demo token and cannot access secrets.
 */
export function requireSession(input: {
  authorization?: string;
  secret: string;
  nowMs?: number;
}): SessionContext {
  const header = input.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix) || header.length <= prefix.length) {
    throw Object.assign(new Error("Authentication is required."), { code: "AUTH_REQUIRED" });
  }
  const token = header.slice(prefix.length);
  const now = input.nowMs ?? Date.now();
  try {
    const payload = verifySessionToken(token, input.secret, now);
    return { sessionId: payload.sessionId, wallet: payload.wallet, role: payload.role };
  } catch {
    throw Object.assign(new Error("Authentication is invalid."), { code: "AUTH_INVALID" });
  }
}
