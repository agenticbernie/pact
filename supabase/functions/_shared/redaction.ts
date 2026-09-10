/**
 * Redaction helpers: errors expose category + requestId but never provider
 * response bodies, authorization headers, prompt secrets, or key material.
 */

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9-_]{20,}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /0x[0-9a-fA-F]{64}/g,
  /https?:\/\/[^\s"']+/g,
];

function stripSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out.slice(0, 300);
}

/** Redact an arbitrary log/detail string (names survive, values do not). */
export function redactDetail(value: unknown): string {
  if (typeof value === "string") {
    return stripSecrets(value);
  }
  try {
    return stripSecrets(JSON.stringify(value) ?? "unknown");
  } catch {
    return "unknown";
  }
}

/** Redacted structured log line: requestId + category only, never bodies/keys. */
export function redactedLog(input: {
  requestId: string;
  code: string;
  latencyMs?: number;
  provider?: string;
  model?: string;
  decision?: string;
}): string {
  return JSON.stringify({
    requestId: input.requestId,
    code: input.code,
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
  });
}
