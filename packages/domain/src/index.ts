export { FOUNDATION_MARKER } from "./bootstrap.js";
export { DomainError } from "./errors.js";
export type { DomainErrorCode } from "./errors.js";
export {
  parseEvidenceRecord,
  transitionEvidenceStatus,
  deriveEvidenceKey,
  classifyProofOutcome,
  sanitizeCategory,
  CreditEvidenceRecordSchema,
} from "./evidence.js";
export type { CreditEvidenceRecord, EvidenceStatus } from "./evidence.js";
export {
  CANONICAL_HASH_ABI_TYPES,
  NATIVE_ASSET_EVM_ADDRESS,
  canonicalIntentHash,
  merchantIdToBytes32,
} from "./canonical-hash.js";
export {
  AgentIntentSchema,
  assertDeploymentReady,
  assertMerchantAllowed,
  createMerchantCatalog,
  loadAdvanceTestnetConfig,
  loadOpenAIConfig,
  parseAdvanceTestnetConfig,
  parseAgentIntent,
  resolveOpenAIModel,
  VERIFIER_PRECOMPILE_ADDRESS,
  CREDITCOIN_CHAIN_IDS,
} from "./schemas.js";
export type {
  AdvanceTestnetConfig,
  AgentIntent,
  CanonicalIntentInput,
  MerchantCatalog,
  NativeAssetDescriptor,
  NetworkObservation,
  ObservedExternalContract,
  OpenAIConfig,
} from "./types.js";
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
} from "./api.js";
export type {
  ApiError,
  ApiErrorCode,
  ExecuteResponse,
  IntentRequest,
  IntentResponse,
  PreflightResponse,
} from "./api.js";
export {
  CHALLENGE_TTL_MS,
  SESSION_HMAC_SECRET_NAME,
  SESSION_TTL_MS,
  buildChallengeMessage,
  hashNonce,
  hashToken,
  is64Hex,
  issueSessionToken,
  verifySessionToken,
} from "./session-token.js";
export type { SessionRole, SessionTokenPayload } from "./session-token.js";
export { PAYMENT_STATUSES, classifyReceipt, isSettledReceipt, paymentCodeForStatus } from "./payment.js";
export type { PaymentStatus, ReceiptResult } from "./payment.js";
export { PINNED_MODEL, assertModelConfigAllowsCall, loadModelConfig } from "./model-config.js";
export type { ModelConfig } from "./model-config.js";
