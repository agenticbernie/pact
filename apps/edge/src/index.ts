/**
 * Cloudflare public edge (Task 4 + S7): validates method/path/64KB body,
 * requestId, session/demo header shape, and the 30/min rate limit, then
 * forwards to ONE configured regional Supabase URL. Never imports OpenAI or
 * signer code. Redacted structured logs only.
 */
import { MAX_BODY_BYTES, createApiError } from "../../../packages/domain/src/api.ts";
import { createRateLimiter } from "./rate-limit.ts";
import type { RateLimiter } from "./rate-limit.ts";
import { forwardToRegional } from "./upstream.ts";
import type { UpstreamFetch } from "./upstream.ts";

export type EdgeEnv = {
  SUPABASE_REGIONAL_FUNCTION_URL: string;
  ALLOWED_ORIGIN: string;
};

export type EdgeRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
};

export type EdgeResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

const ALLOWED_PATHS = [
  "/v1/session/challenge",
  "/v1/session/verify",
  "/v1/session/revoke",
  "/v1/agent/intents",
  "/v1/payments/preflight",
  "/v1/payments/execute",
  "/health",
];

const ALLOWED_METHODS: Record<string, string[]> = {
  "/health": ["GET"],
  "/v1/session/challenge": ["POST"],
  "/v1/session/verify": ["POST"],
  "/v1/session/revoke": ["POST"],
  "/v1/agent/intents": ["POST"],
  "/v1/payments/preflight": ["POST"],
  "/v1/payments/execute": ["POST"],
};

const AUTH_REQUIRED_PATHS = new Set([
  "/v1/agent/intents",
  "/v1/payments/preflight",
  "/v1/payments/execute",
]);

const sharedLimiter: RateLimiter = createRateLimiter({ limitPerMinute: 30 });

function header(headers: Record<string, string>, name: string): string {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return "";
}

function newRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

export async function handleEdgeRequest(
  request: EdgeRequest,
  env: EdgeEnv,
  deps: { fetchFn: UpstreamFetch; nowMs?: number; clientIp?: string; limiter?: RateLimiter } = {
    fetchFn: () => Promise.reject(new Error("no-upstream")),
  },
): Promise<EdgeResponse> {
  const now = deps.nowMs ?? Date.now();
  const incomingId = header(request.headers, "x-request-id");
  const requestId = incomingId !== "" ? incomingId : newRequestId();
  const baseHeaders = { "x-request-id": requestId };

  if (!ALLOWED_PATHS.includes(request.path)) {
    return {
      status: 404,
      body: createApiError("INPUT_INVALID", requestId),
      headers: baseHeaders,
    };
  }
  const methods = ALLOWED_METHODS[request.path] ?? ["POST"];
  if (!methods.includes(request.method)) {
    return {
      status: 404,
      body: createApiError("INPUT_INVALID", requestId),
      headers: baseHeaders,
    };
  }
  const body = request.body ?? "";
  if (body.length > MAX_BODY_BYTES) {
    return {
      status: 413,
      body: createApiError("INPUT_INVALID", requestId, "Request body exceeds 64 KB."),
      headers: baseHeaders,
    };
  }
  if (AUTH_REQUIRED_PATHS.has(request.path)) {
    const auth = header(request.headers, "authorization");
    const demo = header(request.headers, "x-demo-token");
    if (auth === "" && demo === "") {
      return {
        status: 401,
        body: createApiError("AUTH_REQUIRED", requestId),
        headers: baseHeaders,
      };
    }
    if (auth !== "" && !auth.startsWith("Bearer ")) {
      return {
        status: 401,
        body: createApiError("AUTH_INVALID", requestId),
        headers: baseHeaders,
      };
    }
  }
  const limiter = deps.limiter ?? sharedLimiter;
  const key = deps.clientIp ?? "anonymous";
  const decision = limiter.check(`${request.path}:${key}`, now);
  if (!decision.allowed) {
    return {
      status: 429,
      body: createApiError("RATE_LIMITED", requestId),
      headers: { ...baseHeaders, "retry-after-ms": String(decision.retryAfterMs) },
    };
  }

  const upstream = await forwardToRegional({
    regionalBase: env.SUPABASE_REGIONAL_FUNCTION_URL,
    path: request.path,
    method: request.method,
    headers: { "content-type": "application/json" },
    body,
    requestId,
    fetchFn: deps.fetchFn,
  });
  if (upstream.ok) {
    let parsed: unknown = upstream.body;
    try {
      parsed = JSON.parse(upstream.body) as unknown;
    } catch {
      parsed = upstream.body;
    }
    return { status: upstream.status, body: parsed, headers: baseHeaders };
  }
  return {
    status: upstream.status,
    body: {
      requestId: upstream.requestId,
      code: upstream.code,
      message: "Upstream request failed.",
      retryable: upstream.retryable,
    },
    headers: baseHeaders,
  };
}
