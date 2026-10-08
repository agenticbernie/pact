/**
 * Write-side endpoints of the Pact runtime.
 *
 * These are the only two steps a console can drive against the payment
 * boundary: asking the gateway to turn a described payment into a server-bound
 * intent, and asking the executor to preflight or settle it. Both are
 * session-scoped — the bearer token is the wallet that is making the request —
 * and neither accepts a recipient, an amount or a nonce chosen by the caller,
 * so a compromised form cannot redirect a payment.
 *
 * `pay` is never encoded here. Settlement is signed by the agent lane's own
 * signer, server-side; the console only ever submits an intent id.
 */
import { apiPost } from "./client";
import type { ApiExecuteResponse, ApiIntentResponse, ApiPreflightResponse } from "./types";

/** `POST /v1/agent/intents` — the gateway resolves merchant, amount and card server-side. */
export function requestPaymentIntent(input: { cardId: string; prompt: string }): Promise<ApiIntentResponse> {
  return apiPost<ApiIntentResponse>("/v1/agent/intents", input);
}

/** `POST /v1/payments/preflight` — the read-only mirror of `pay`, with the caller as the agent. */
export function preflightPayment(intentId: string): Promise<ApiPreflightResponse> {
  return apiPost<ApiPreflightResponse>("/v1/payments/preflight", { intentId });
}

/** `POST /v1/payments/execute` — signs and broadcasts `pay` for a ready intent. */
export function executePayment(input: {
  intentId: string;
  idempotencyKey: string;
}): Promise<ApiExecuteResponse> {
  return apiPost<ApiExecuteResponse>("/v1/payments/execute", input);
}
