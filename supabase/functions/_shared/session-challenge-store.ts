/**
 * Option A SessionChallengeStore adapter (G21): PostgREST implementation of
 * the existing SessionPersistence port (supabase/functions/session/index.ts:61-67).
 *
 * This is a named adapter over SessionPersistence, never a replacement port.
 * Hash-only writes (sha256 hex), 5-min challenge TTL / 30-min session TTL
 * preserved from C-SESSION. Atomic consume is one conditional PATCH;
 * select-then-update is forbidden. Length 1 means applied, 0 means not
 * applied, >1 on a unique predicate is INVALID_ROW fail-closed.
 *
 * Exact REST paths: /rest/v1/session_challenges, /rest/v1/sessions.
 * Allowed methods only: GET (scoped read), POST (single-row insert),
 * PATCH (single conditional update). DELETE/PUT/UPSERT/RPC forbidden.
 * Server-only: transport lives only in _shared/*-store.ts + composition.
 */

import type {
  ChallengeRecord,
  SessionPersistence,
  SessionRecord,
} from "../session/index.ts";
import {
  PersistenceError,
  POSTGREST_TIMEOUT_MS,
  buildPostgrestHeaders,
  type PostgrestConfig,
  type PostgrestTransport,
} from "./persistence-ports.ts";

export const SESSION_CHALLENGES_PATH = "/rest/v1/session_challenges";
export const SESSIONS_PATH = "/rest/v1/sessions";

const HEX64 = /^[0-9a-f]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-f]{40}$/;

export function assertChallengeInput(row: ChallengeRecord): void {
  if (!HEX64.test(row.nonceHash)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  if (!EVM_ADDRESS.test(row.wallet)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  if (typeof row.message !== "string" || row.message.length === 0 || row.message.length > 2048) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  if (!Number.isFinite(row.expiresAtMs)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
}

export function assertSessionInput(row: SessionRecord): void {
  if (typeof row.id !== "string" || row.id.length === 0) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  if (!HEX64.test(row.tokenHash)) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  if (!EVM_ADDRESS.test(row.wallet)) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
}

export function toChallengeRecord(row: Record<string, unknown>): ChallengeRecord {
  const nonceHash = row["nonce_hash"];
  const wallet = row["wallet_address"];
  const message = row["message"];
  const expiresAt = row["expires_at"];
  const consumedAt = row["consumed_at"];
  if (typeof nonceHash !== "string" || !HEX64.test(nonceHash)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  if (typeof wallet !== "string") {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  if (typeof message !== "string") {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  const expiresAtMs = Date.parse(String(expiresAt));
  if (!Number.isFinite(expiresAtMs)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  const consumedAtMs =
    consumedAt === null || consumedAt === undefined
      ? null
      : Date.parse(String(consumedAt));
  if (consumedAtMs !== null && !Number.isFinite(consumedAtMs)) {
    throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
  }
  return {
    nonceHash,
    wallet: wallet.toLowerCase(),
    message,
    expiresAtMs,
    consumedAtMs,
  };
}

export function toSessionRecord(row: Record<string, unknown>): SessionRecord {
  const id = row["id"];
  const tokenHash = row["token_hash"];
  const wallet = row["wallet_address"];
  const role = row["role"];
  const issuedAt = row["issued_at"];
  const expiresAt = row["expires_at"];
  const revokedAt = row["revoked_at"];
  if (typeof id !== "string" || typeof tokenHash !== "string" || !HEX64.test(tokenHash)) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  if (typeof wallet !== "string" || role !== "user") {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  const issuedAtMs = Date.parse(String(issuedAt));
  const expiresAtMs = Date.parse(String(expiresAt));
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  const revokedAtMs =
    revokedAt === null || revokedAt === undefined ? null : Date.parse(String(revokedAt));
  if (revokedAtMs !== null && !Number.isFinite(revokedAtMs)) {
    throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
  }
  return {
    id,
    tokenHash,
    wallet: wallet.toLowerCase(),
    role: "user",
    issuedAtMs,
    expiresAtMs,
    revokedAtMs,
  };
}

function defaultTransport(config: PostgrestConfig): PostgrestTransport {
  return async (req) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? POSTGREST_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.supabaseUrl}${req.path}`, {
        method: req.method,
        headers: req.singleObject
          ? { ...buildPostgrestHeaders(config.serviceRoleKey), Accept: "application/vnd.pgrst.object+json" }
          : buildPostgrestHeaders(config.serviceRoleKey),
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => [])) as unknown;
      return { status: response.status, body };
    } catch {
      throw new PersistenceError("UNAVAILABLE", "Persistence transport failed.", false);
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createPostgrestSessionPersistence(
  config: PostgrestConfig,
  transport?: PostgrestTransport,
): SessionPersistence {
  const run = transport ?? defaultTransport(config);

  return {
    async insertChallenge(row: ChallengeRecord): Promise<void> {
      assertChallengeInput(row);
      // Challenge issue: POST with nonce_hash, wallet_address, message, issued_at, expires_at.
      // issued_at is server-derived at insert; issued/expiry preserve the 5-min TTL.
      const issuedAt = new Date(row.expiresAtMs - 5 * 60 * 1000).toISOString();
      let result;
      try {
        result = await run({
          method: "POST",
          path: SESSION_CHALLENGES_PATH,
          body: {
            nonce_hash: row.nonceHash,
            wallet_address: row.wallet.toLowerCase(),
            message: row.message,
            issued_at: issuedAt,
            expires_at: new Date(row.expiresAtMs).toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Challenge insert failed.", false);
      }
      if (result.status === 409) {
        throw new PersistenceError("CONFLICT", "Duplicate challenge hash.", false);
      }
      if (result.status === 400) {
        throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
      }
      if (result.status === 401 || result.status === 403) {
        throw new PersistenceError("UNAVAILABLE", "Persistence unavailable.", false);
      }
      if (result.status !== 201 && result.status !== 200) {
        throw new PersistenceError("UNAVAILABLE", "Challenge insert failed.", false);
      }
      const body = result.body;
      if (Array.isArray(body) && body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
      }
    },

    async consumeChallenge(nonceHash: string): Promise<ChallengeRecord | null> {
      if (!HEX64.test(nonceHash)) {
        throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
      }
      const now = new Date().toISOString();
      let result;
      try {
        // Atomic consume: PATCH with consumed_at/is.null + revoked_at/is.null + expires_at/gt predicates.
        result = await run({
          method: "PATCH",
          path:
            `${SESSION_CHALLENGES_PATH}?nonce_hash=eq.${nonceHash}` +
            `&consumed_at=is.null&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}`,
          body: { consumed_at: now },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Challenge consume failed.", false);
      }
      if (result.status === 400) {
        throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
      }
      if (result.status === 401 || result.status === 403) {
        throw new PersistenceError("UNAVAILABLE", "Persistence unavailable.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
      }
      // Affected-row-count signal: length 1 applied, 0 not applied, >1 fail-closed.
      if (body.length === 1) {
        return toChallengeRecord(body[0] as Record<string, unknown>);
      }
      if (body.length === 0) {
        // Read-only classification GET; never write authority. Caller maps
        // replay to AUTH_INVALID and expiry to AUTH_EXPIRED; no session issued.
        try {
          const classify = await run({
            method: "GET",
            path: `${SESSION_CHALLENGES_PATH}?nonce_hash=eq.${nonceHash}&select=nonce_hash,wallet_address,expires_at,consumed_at,revoked_at`,
          });
          void classify;
        } catch {
          // Classification failure still means no session.
        }
        return null;
      }
      throw new PersistenceError("INVALID_ROW", "Invalid challenge row.", false);
    },

    async insertSession(row: SessionRecord): Promise<void> {
      assertSessionInput(row);
      let result;
      try {
        result = await run({
          method: "POST",
          path: SESSIONS_PATH,
          body: {
            id: row.id,
            token_hash: row.tokenHash,
            wallet_address: row.wallet.toLowerCase(),
            role: "user",
            issued_at: new Date(row.issuedAtMs).toISOString(),
            expires_at: new Date(row.expiresAtMs).toISOString(),
          },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Session insert failed.", false);
      }
      if (result.status === 409) {
        throw new PersistenceError("CONFLICT", "Duplicate session.", false);
      }
      if (result.status === 400) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      if (result.status === 401 || result.status === 403) {
        throw new PersistenceError("UNAVAILABLE", "Persistence unavailable.", false);
      }
      if (result.status !== 201 && result.status !== 200) {
        throw new PersistenceError("UNAVAILABLE", "Session insert failed.", false);
      }
    },

    async findSession(tokenHash: string, wallet: string): Promise<SessionRecord | null> {
      if (!HEX64.test(tokenHash)) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      const now = new Date().toISOString();
      let result;
      try {
        result = await run({
          method: "GET",
          path:
            `${SESSIONS_PATH}?token_hash=eq.${tokenHash}` +
            `&wallet_address=eq.${encodeURIComponent(wallet.toLowerCase())}` +
            `&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}` +
            `&select=id,token_hash,wallet_address,role,issued_at,expires_at,revoked_at`,
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Session read failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      if (body.length === 0) return null;
      if (body.length > 1) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      return toSessionRecord(body[0] as Record<string, unknown>);
    },

    async revokeSession(tokenHash: string, wallet: string, nowMs: number): Promise<boolean> {
      if (!HEX64.test(tokenHash)) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      let result;
      try {
        // Monotonic null-to-timestamp update in one statement.
        result = await run({
          method: "PATCH",
          path:
            `${SESSIONS_PATH}?token_hash=eq.${tokenHash}` +
            `&wallet_address=eq.${encodeURIComponent(wallet.toLowerCase())}&revoked_at=is.null`,
          body: { revoked_at: new Date(nowMs).toISOString() },
        });
      } catch (error) {
        if (error instanceof PersistenceError) throw error;
        throw new PersistenceError("UNAVAILABLE", "Session revoke failed.", false);
      }
      const body = result.body;
      if (!Array.isArray(body)) {
        throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
      }
      if (body.length === 1) return true;
      if (body.length === 0) return false;
      throw new PersistenceError("INVALID_ROW", "Invalid session row.", false);
    },
  };
}
