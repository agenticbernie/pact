/**
 * Fixed-upstream forwarder: the Worker calls ONLY the configured regional
 * Supabase function URL. Arbitrary upstream routing is never permitted.
 */

export type UpstreamFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; body: string; headers: Record<string, string> }>;

export type UpstreamResult =
  | { ok: true; status: number; body: string; headers: Record<string, string> }
  | { ok: false; status: number; code: string; requestId: string; retryable: boolean };

export function regionalUrlFor(base: string, path: string): string {
  if (!base.startsWith("https://")) {
    throw new Error("Regional function URL must be absolute HTTPS.");
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function forwardToRegional(input: {
  regionalBase: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  requestId: string;
  fetchFn: UpstreamFetch;
}): Promise<UpstreamResult> {
  const url = regionalUrlFor(input.regionalBase, input.path);
  let response: { status: number; body: string; headers: Record<string, string> };
  try {
    response = await input.fetchFn(url, {
      method: input.method,
      headers: { ...input.headers, "x-request-id": input.requestId },
      body: input.body,
    });
  } catch {
    return { ok: false, status: 504, code: "PROVIDER_UNAVAILABLE", requestId: input.requestId, retryable: true };
  }
  if (response.status >= 200 && response.status < 300) {
    return { ok: true, status: response.status, body: response.body, headers: response.headers };
  }
  if (response.status === 429) {
    return { ok: false, status: 429, code: "RATE_LIMITED", requestId: input.requestId, retryable: true };
  }
  if (response.status >= 500) {
    return { ok: false, status: response.status, code: "PROVIDER_UNAVAILABLE", requestId: input.requestId, retryable: true };
  }
  return { ok: false, status: response.status, code: "INPUT_INVALID", requestId: input.requestId, retryable: false };
}
