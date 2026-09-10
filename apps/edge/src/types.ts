/**
 * Edge type surface: re-export only (no OpenAI/signer imports here, ever).
 * Source of truth: `packages/domain/src/api.ts`.
 */
export {
  MAX_BODY_BYTES,
  MAX_PROMPT_LENGTH,
  createApiError,
  isApiErrorCode,
  toApiError,
} from "../../../packages/domain/src/api.ts";
export type { ApiError, ApiErrorCode } from "../../../packages/domain/src/api.ts";
