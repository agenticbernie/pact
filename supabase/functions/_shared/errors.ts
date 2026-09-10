/**
 * Thin re-export of the closed error mapper (no fork).
 * Source of truth: `packages/domain/src/api.ts`.
 */
export {
  createApiError,
  isApiErrorCode,
  mapDomainErrorToApiCode,
  toApiError,
} from "../../../packages/domain/src/api.ts";
export type { ApiError, ApiErrorCode } from "../../../packages/domain/src/api.ts";
export { DomainError } from "../../../packages/domain/src/errors.ts";
