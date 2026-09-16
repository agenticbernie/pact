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
import { normalizeFunctionPath } from "../_shared/path-prefix.ts";
import {
  createPostgrestPersistenceFromEnv,
  type PostgrestPersistence,
} from "../_shared/persistence-composition.ts";
import { regionsMatch, resolveRegionConfig } from "../_shared/region-config.ts";

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

export type SessionPersistence = {
  insertChallenge(row: ChallengeRecord): Promise<void>;
  consumeChallenge(nonceHash: string): Promise<ChallengeRecord | null>;
  insertSession(row: SessionRecord): Promise<void>;
  findSession(tokenHash: string, wallet: string): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string, wallet: string, nowMs: number): Promise<boolean>;
};

export type SessionRuntime = {
  requestChallenge(input: { wallet: string; domain: string; chainLabel: string; nowMs?: number }): Promise<{
    nonce: string;
    message: string;
    expiresAt: string;
  }>;
  verifyChallenge(input: {
    nonce: string;
    signature: string;
    nowMs?: number;
    verifyFn?: VerifyFn;
  }): Promise<{ token: string; sessionId: string }>;
  revokeSession(input: { token: string; nowMs?: number }): Promise<{ revoked: boolean }>;
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

/** Runtime composition for an RLS-safe/PostgREST-shaped persistence port. */
export function createSessionRuntime(input: {
  persistence: SessionPersistence;
  secret: string;
  previousSecret?: string;
}): SessionRuntime {
  return {
    async requestChallenge(challengeInput) {
      const temporary = createSessionStore();
      const result = requestChallenge(temporary, challengeInput);
      const row = temporary.challenges.get(hashNonce(result.nonce));
      if (row === undefined) throw sessionError("AUTH_INVALID");
      await input.persistence.insertChallenge(row);
      return result;
    },
    async verifyChallenge(verifyInput) {
      const now = verifyInput.nowMs ?? Date.now();
      const nonceHash = hashNonce(verifyInput.nonce);
      const row = await input.persistence.consumeChallenge(nonceHash);
      if (row === null) throw sessionError("AUTH_INVALID");
      if (row.expiresAtMs <= now) throw sessionError("AUTH_EXPIRED");
      let wallet: string;
      try {
        wallet = (verifyInput.verifyFn ?? ethersVerify)(row.message, verifyInput.signature).toLowerCase();
      } catch {
        throw sessionError("AUTH_INVALID");
      }
      if (wallet !== row.wallet) throw sessionError("AUTH_INVALID");
      const sessionId = randomBytes(16).toString("hex");
      const token = issueSessionToken({ sessionId, wallet: row.wallet, role: "user" }, input.secret, now);
      await input.persistence.insertSession({
        id: sessionId,
        tokenHash: hashToken(token),
        wallet: row.wallet,
        role: "user",
        issuedAtMs: now,
        expiresAtMs: now + SESSION_TTL_MS,
        revokedAtMs: null,
      });
      return { token, sessionId };
    },
    async revokeSession(revokeInput) {
      const now = revokeInput.nowMs ?? Date.now();
      let payload: ReturnType<typeof verifySessionToken>;
      try {
        payload = verifySessionToken(revokeInput.token, input.secret, now, undefined, input.previousSecret);
      } catch {
        throw sessionError("AUTH_INVALID");
      }
      const revoked = await input.persistence.revokeSession(hashToken(revokeInput.token), payload.wallet, now);
      return { revoked };
    },
  };
}

export function createSessionHttpHandler(runtime: SessionRuntime, options: {
  nowMs?: number;
  verifyFn?: VerifyFn;
} = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const receivedPathname = url.pathname;
    const requestId = request.headers.get("x-request-id") ?? "req-session";
    const normalized = normalizeFunctionPath(receivedPathname, "session");
    if (!normalized.ok) {
      return sessionResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported session route." }, 404);
    }
    const path = normalized.path;
    const sessionRoutes = new Set(["/v1/session/challenge", "/v1/session/verify", "/v1/session/revoke"]);
    if (request.method !== "POST" || !sessionRoutes.has(path)) {
      return sessionResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported session route." }, 404);
    }
    try {
      const body = path.endsWith("/revoke")
        ? {}
        : (await request.json()) as Record<string, unknown>;
      if (path === "/v1/session/challenge") {
        const result = await runtime.requestChallenge({
          wallet: String(body.wallet ?? ""),
          domain: String(body.domain ?? "pact.test"),
          chainLabel: String(body.chainLabel ?? "advance-testnet"),
          nowMs: options.nowMs,
        });
        return sessionResponse({ requestId, ...result });
      }
      if (path === "/v1/session/verify") {
        const result = await runtime.verifyChallenge({
          nonce: String(body.nonce ?? ""),
          signature: String(body.signature ?? ""),
          nowMs: options.nowMs,
          verifyFn: options.verifyFn,
        });
        return sessionResponse({ requestId, ...result });
      }
      if (path === "/v1/session/revoke") {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "";
        return sessionResponse({ requestId, ...(await runtime.revokeSession({ token, nowMs: options.nowMs })) });
      }
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "AUTH_INVALID";
      return sessionResponse({ requestId, code, message: "Authentication request failed." }, 401);
    }
    return sessionResponse({ requestId, code: "INPUT_INVALID", message: "Unsupported session route." }, 404);
  };
}

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

export function createSessionEntrypointHandler(input: {
  runtime?: SessionRuntime;
  configuredRegion?: string;
  expectedRegion?: string;
  actualRegion?: string;
  options?: Parameters<typeof createSessionHttpHandler>[1];
} = {}): (request: Request) => Promise<Response> {
  if (
    input.runtime === undefined ||
    !regionsMatch(input.expectedRegion, input.actualRegion) ||
    input.configuredRegion !== input.actualRegion
  ) {
    return async (request) => sessionResponse({
      requestId: request.headers.get("x-request-id") ?? "req-session",
      code: "PROVIDER_UNAVAILABLE",
      message: "Session persistence runtime is unavailable.",
    }, 503);
  }
  return createSessionHttpHandler(input.runtime, input.options);
}

type RuntimeEnv = Record<string, string | undefined>;
type Server = (handler: (request: Request) => Response | Promise<Response>) => void;

type SessionCompositionInput = {
  env?: RuntimeEnv;
  persistence?: SessionPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
  options?: Parameters<typeof createSessionHttpHandler>[1];
};

function unavailableSessionHandler(input: {
  configuredRegion?: string;
  expectedRegion: string;
  actualRegion?: string;
}): (request: Request) => Promise<Response> {
  return createSessionEntrypointHandler(input);
}

export function createSessionCompositionRoot(input: SessionCompositionInput = {}): (request: Request) => Promise<Response> {
  const env = input.env ?? {};
  const region = resolveRegionConfig(env);
  const secret = env.SESSION_HMAC_SECRET;
  if (secret === undefined || !regionsMatch(region.expectedRegion, region.observedRegion)) {
    return unavailableSessionHandler({
      configuredRegion: region.configuredRegion,
      expectedRegion: region.expectedRegion ?? "unknown",
      actualRegion: region.observedRegion,
    });
  }
  let persistence = input.persistence;
  if (persistence === undefined) {
    let composed: PostgrestPersistence;
    try {
      composed = createPostgrestPersistenceFromEnv(env, input.postgrestTransport);
    } catch {
      return unavailableSessionHandler({
        configuredRegion: region.configuredRegion,
        expectedRegion: region.expectedRegion ?? "unknown",
        actualRegion: region.observedRegion,
      });
    }
    persistence = composed.session;
  }
  return createSessionEntrypointHandler({
    runtime: createSessionRuntime({ persistence, secret }),
    configuredRegion: region.configuredRegion,
    expectedRegion: region.expectedRegion,
    actualRegion: region.observedRegion,
    options: input.options,
  });
}

export function startSessionServer(input: {
  serve: Server;
  env?: RuntimeEnv;
  persistence?: SessionPersistence;
  postgrestTransport?: Parameters<typeof createPostgrestPersistenceFromEnv>[1];
  options?: Parameters<typeof createSessionHttpHandler>[1];
}): void {
  input.serve(createSessionCompositionRoot(input));
}

function sessionResponse(body: unknown, status = 200): Response {
  const requestId = typeof body === "object" && body !== null && "requestId" in body
    ? String((body as { requestId: unknown }).requestId)
    : "req-session";
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

if (typeof Deno !== "undefined" && typeof Deno.serve === "function") {
  startSessionServer({
    serve: Deno.serve,
    env: {
      PACT_EXPECTED_REGION: Deno.env.get("PACT_EXPECTED_REGION"),
      SB_REGION: Deno.env.get("SB_REGION"),
      SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SESSION_HMAC_SECRET: Deno.env.get(SESSION_HMAC_SECRET_NAME),
    },
  });
}
