/**
 * Thin re-export of the closed 15-code API surface (no fork).
 * Source of truth: `packages/domain/src/api.ts`.
 */
export {
  API_ERROR_CODES,
  MAX_BODY_BYTES,
  MAX_PROMPT_LENGTH,
  createApiError,
  isApiErrorCode,
  mapDomainErrorToApiCode,
  parseIntentRequest,
  requireRequestId,
  toApiError,
} from "../../../packages/domain/src/api.ts";
export type {
  ApiError,
  ApiErrorCode,
  ExecuteResponse,
  IntentRequest,
  IntentResponse,
  PreflightResponse,
} from "../../../packages/domain/src/api.ts";
