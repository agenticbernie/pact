import { DomainError } from "./errors.js";
import type { DomainErrorCode } from "./errors.js";
import type { AgentIntent } from "./types.js";

/**
 * Phase 04 API envelopes + closed error taxonomy.
 *
 * C-SESSION / C-DDL / C-MODEL pins are enforced by sibling modules; this file
 * owns the stable 15-code surface (Task 1.2 + S3). There is no `string`
 * escape hatch: `ApiErrorCode` is the closed union and every mapper path is
 * `never`-exhaustive.
 */

export const API_ERROR_CODES = [
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "INPUT_INVALID",
  "NETWORK_CONFIG_INVALID",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_MODEL_UNAVAILABLE",
  "PROVIDER_OUTPUT_INVALID",
  "REGION_MISMATCH",
  "CARD_NOT_ELIGIBLE",
  "PREFLIGHT_DECLINED",
  "PAYMENT_BROADCAST_TIMEOUT",
  "PAYMENT_FAILED",
  "PAYMENT_RECONCILIATION_REQUIRED",
  "RATE_LIMITED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiError = {
  requestId: string;
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
};

export type IntentRequest = {
  cardId: string;
  prompt: string;
};

export type IntentResponse = {
  requestId: string;
  intentId: string;
  intent: AgentIntent;
  status: "ready";
};

export type PreflightResponse = {
  requestId: string;
  intentId: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  chainId: number;
  checkedAt: string;
};

export type ExecuteResponse = {
  requestId: string;
  intentId: string;
  paymentId: string;
  status: "pending" | "settled" | "declined" | "failed";
  txHash?: string;
  explorerUrl?: string;
  reasonCode?: string;
};

/** Maximum prompt length: 2,000 characters (Task 1.1). */
export const MAX_PROMPT_LENGTH = 2000;

/** Maximum request body accepted by the edge: 64 KB (Task 4). */
export const MAX_BODY_BYTES = 64 * 1024;

const RETRYABLE_BY_CODE: Record<ApiErrorCode, boolean> = {
  AUTH_REQUIRED: false,
  AUTH_INVALID: false,
  AUTH_EXPIRED: false,
  INPUT_INVALID: false,
  NETWORK_CONFIG_INVALID: false,
  PROVIDER_UNAVAILABLE: true,
  PROVIDER_MODEL_UNAVAILABLE: false,
  PROVIDER_OUTPUT_INVALID: false,
  REGION_MISMATCH: false,
  CARD_NOT_ELIGIBLE: false,
  PREFLIGHT_DECLINED: false,
  PAYMENT_BROADCAST_TIMEOUT: true,
  PAYMENT_FAILED: false,
  PAYMENT_RECONCILIATION_REQUIRED: false,
  RATE_LIMITED: true,
};

const CODE_SET: ReadonlySet<string> = new Set(API_ERROR_CODES);

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && CODE_SET.has(value);
}

function messageFor(code: ApiErrorCode): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return "Authentication is required.";
    case "AUTH_INVALID":
      return "Authentication is invalid.";
    case "AUTH_EXPIRED":
      return "Authentication has expired.";
    case "INPUT_INVALID":
      return "Request input is invalid.";
    case "NETWORK_CONFIG_INVALID":
      return "Network configuration is invalid.";
    case "PROVIDER_UNAVAILABLE":
      return "Provider is unavailable.";
    case "PROVIDER_MODEL_UNAVAILABLE":
      return "Configured provider model is unavailable.";
    case "PROVIDER_OUTPUT_INVALID":
      return "Provider output failed validation.";
    case "REGION_MISMATCH":
      return "Request reached the wrong region.";
    case "CARD_NOT_ELIGIBLE":
      return "Card or merchant is not eligible.";
    case "PREFLIGHT_DECLINED":
      return "Preflight declined the payment.";
    case "PAYMENT_BROADCAST_TIMEOUT":
      return "Payment broadcast timed out.";
    case "PAYMENT_FAILED":
      return "Payment failed.";
    case "PAYMENT_RECONCILIATION_REQUIRED":
      return "Payment requires reconciliation.";
    case "RATE_LIMITED":
      return "Rate limit exceeded.";
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

/**
 * Total mapper from the Phase 01 DomainError union to the closed 15-code API
 * surface. Exhaustive: adding a DomainErrorCode without updating this switch
 * fails typecheck via the `never` assignment.
 */
export function mapDomainErrorToApiCode(code: DomainErrorCode): ApiErrorCode {
  switch (code) {
    case "INTENT_SCHEMA_INVALID":
      return "INPUT_INVALID";
    case "SECRET_FIELD_REJECTED":
      return "INPUT_INVALID";
    case "MERCHANT_NOT_ALLOWLISTED":
      return "CARD_NOT_ELIGIBLE";
    case "NETWORK_CONFIG_INVALID":
      return "NETWORK_CONFIG_INVALID";
    case "AI_CONFIG_INVALID":
      return "PROVIDER_MODEL_UNAVAILABLE";
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

export function createApiError(code: ApiErrorCode, requestId: string, message?: string): ApiError {
  return {
    requestId,
    code,
    message: message ?? messageFor(code),
    retryable: RETRYABLE_BY_CODE[code],
  };
}

function safeRequestId(requestId: string): string {
  return requestId.length > 0 ? requestId : "req-unknown";
}

/**
 * Catch-all error normalizer. DomainError maps via the closed mapper;
 * known ApiErrorCode strings pass through; network-shaped throwables map to
 * PROVIDER_UNAVAILABLE; everything else maps to INPUT_INVALID. Provider
 * bodies, headers, prompts, and key material are never echoed.
 */
export function toApiError(input: unknown, requestId: string): ApiError {
  const rid = safeRequestId(requestId);
  if (isApiErrorCode(input)) {
    return createApiError(input, rid);
  }
  if (input instanceof DomainError) {
    return createApiError(mapDomainErrorToApiCode(input.code), rid);
  }
  if (typeof input === "object" && input !== null && "code" in input) {
    const maybe = (input as { code?: unknown }).code;
    if (isApiErrorCode(maybe)) {
      return createApiError(maybe, rid);
    }
  }
  if (input instanceof Error) {
    const text = input.message.toLowerCase();
    if (
      text.includes("fetch failed") ||
      text.includes("network") ||
      text.includes("timeout") ||
      text.includes("econn") ||
      text.includes("socket")
    ) {
      return createApiError("PROVIDER_UNAVAILABLE", rid);
    }
    return createApiError("INPUT_INVALID", rid);
  }
  return createApiError("INPUT_INVALID", rid);
}

/** Rejects missing request IDs (Task 1.1). */
export function requireRequestId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Missing requestId.", { field: "requestId" });
  }
  return value;
}

/** Strict IntentRequest parse: cardId required, prompt 1..2000 chars. */
export function parseIntentRequest(input: unknown): IntentRequest {
  if (typeof input !== "object" || input === null) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Intent request must be an object.", {});
  }
  const record = input as Record<string, unknown>;
  const { cardId, prompt } = record;
  if (typeof cardId !== "string" || cardId.length === 0 || cardId.length > 128) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Invalid cardId.", { field: "cardId" });
  }
  if (typeof prompt !== "string" || prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) {
    throw new DomainError("INTENT_SCHEMA_INVALID", "Invalid prompt length.", { field: "prompt" });
  }
  return { cardId, prompt };
}
