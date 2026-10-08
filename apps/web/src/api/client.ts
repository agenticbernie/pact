/**
 * Read API client.
 *
 * Every call is same-origin (`/v1/...`), proxied to the API process by the dev
 * server. The wallet-bound session token travels in the `Authorization` header —
 * never in a query string or a cookie — so no secret material is ever baked into
 * the bundle.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const AUTH_CODES = new Set(["AUTH_REQUIRED", "AUTH_INVALID", "AUTH_EXPIRED"]);

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && AUTH_CODES.has(error.code);
}

type AuthFailureHandler = () => void;

const authFailureHandlers = new Set<AuthFailureHandler>();

/** Subscribe to a rejected session so the shell can drop stale credentials. */
export function onAuthFailure(handler: AuthFailureHandler): () => void {
  authFailureHandlers.add(handler);
  return () => {
    authFailureHandlers.delete(handler);
  };
}

let sessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  sessionToken = token === "" ? null : token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

type RequestOptions = {
  /** `undefined` uses the active session; `null` sends no credentials. */
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
};

function readString(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

async function request<T>(method: "GET" | "POST", path: string, options: RequestOptions): Promise<T> {
  const token = options.token === undefined ? sessionToken : options.token;
  const headers: Record<string, string> = { accept: "application/json" };
  if (token !== null && token !== undefined && token !== "") {
    headers["authorization"] = `Bearer ${token}`;
  }
  let payload: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(payload === undefined ? {} : { body: payload }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch {
    throw new ApiError(0, "NETWORK_UNREACHABLE", "The Pact runtime did not answer.");
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = readString(body, "code") ?? `HTTP_${response.status}`;
    const message = readString(body, "message") ?? response.statusText;
    if (AUTH_CODES.has(code)) {
      for (const handler of authFailureHandlers) handler();
    }
    throw new ApiError(response.status, code, message);
  }
  return body as T;
}

export function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>("GET", path, options);
}

export function apiPost<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  return request<T>("POST", path, { ...options, body });
}

/** Human-readable message for any failure the console can hit. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 0 ? error.message : `${error.message} (${error.code})`;
  }
  return error instanceof Error ? error.message : "Unexpected failure.";
}
