/**
 * Structured, secret-free rejection diagnostics.
 *
 * A request refused at the wrong boundary reaches the client only as a generic
 * `INPUT_INVALID`, which hides which function actually refused it. Every line
 * here is built from a closed set of non-sensitive fields (surface, request id,
 * route, method, stage, code) — never a prompt, a token, a session, a key, or a
 * wallet address — so an operator can see WHERE a request was refused without
 * leaking anything to the log or to the client. The helper returns nothing and
 * never throws: logging must not change a response.
 */
export type RejectionDiagnostic = {
  /** Which function boundary refused the request. */
  surface: "ai-gateway" | "read-api" | "session" | "agent-executor";
  requestId: string;
  /** The code the client received. */
  code: string;
  /** Internal code before any generic mapping (token-shaped only). */
  internalCode?: string;
  /** Request route that was refused. */
  route?: string;
  /** Request method that was refused. */
  method?: string;
  /** Which dispatch/validation step refused. */
  stage?: string;
};

/** Only closed, token-shaped codes are ever logged — never free text. */
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Extract an internal error `code` when it is token-shaped and therefore safe to log. */
export function internalCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_TOKEN.test(code)) return code;
  }
  return undefined;
}

export function logRejection(diagnostic: RejectionDiagnostic): void {
  try {
    const line: Record<string, string> = {
      level: "warn",
      event: "request_rejected",
      surface: diagnostic.surface,
      requestId: diagnostic.requestId,
      code: diagnostic.code,
    };
    if (diagnostic.stage !== undefined) line["stage"] = diagnostic.stage;
    if (diagnostic.method !== undefined) line["method"] = diagnostic.method;
    if (diagnostic.route !== undefined) line["route"] = diagnostic.route;
    if (diagnostic.internalCode !== undefined && SAFE_TOKEN.test(diagnostic.internalCode)) {
      line["internalCode"] = diagnostic.internalCode;
    }
    console.warn(JSON.stringify(line));
  } catch {
    // Diagnostics must never change a response.
  }
}
