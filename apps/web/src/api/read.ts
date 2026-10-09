/**
 * Read-model endpoints. Read-only by construction: every call is a GET against
 * the Phase 05 read API, and settlement truth is whatever that API reports.
 */
import { apiGet } from "./client";
import type {
  ApiActivityResponse,
  ApiCardResponse,
  ApiCardsResponse,
  ApiConfig,
  ApiIntentDetail,
  ApiPaymentDetail,
  ApiPaymentsResponse,
} from "./types";

export function getConfig(signal?: AbortSignal): Promise<ApiConfig> {
  return apiGet<ApiConfig>("/v1/config", { token: null, ...(signal === undefined ? {} : { signal }) });
}

export function listCards(signal?: AbortSignal): Promise<ApiCardsResponse> {
  return apiGet<ApiCardsResponse>("/v1/cards", signal === undefined ? {} : { signal });
}

export function getCard(cardId: string, signal?: AbortSignal): Promise<ApiCardResponse> {
  return apiGet<ApiCardResponse>(
    `/v1/cards/${encodeURIComponent(cardId)}`,
    signal === undefined ? {} : { signal },
  );
}

export function listCardActivity(cardId: string, signal?: AbortSignal): Promise<ApiActivityResponse> {
  return apiGet<ApiActivityResponse>(
    `/v1/cards/${encodeURIComponent(cardId)}/activity`,
    signal === undefined ? {} : { signal },
  );
}

export function listCardPayments(cardId: string, signal?: AbortSignal): Promise<ApiPaymentsResponse> {
  return apiGet<ApiPaymentsResponse>(
    `/v1/payments?cardId=${encodeURIComponent(cardId)}`,
    signal === undefined ? {} : { signal },
  );
}

export function getPayment(paymentId: string, signal?: AbortSignal): Promise<ApiPaymentDetail> {
  return apiGet<ApiPaymentDetail>(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    signal === undefined ? {} : { signal },
  );
}

/** One persisted intent plus the attempts bound to it. */
export function getIntent(intentId: string, signal?: AbortSignal): Promise<ApiIntentDetail> {
  return apiGet<ApiIntentDetail>(
    `/v1/intents/${encodeURIComponent(intentId)}`,
    signal === undefined ? {} : { signal },
  );
}
