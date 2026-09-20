export { FOUNDATION_MARKER } from "./bootstrap.ts";
export { DomainError } from "./errors.ts";
export type { DomainErrorCode } from "./errors.ts";
export {
  parseEvidenceRecord,
  transitionEvidenceStatus,
  deriveEvidenceKey,
  classifyProofOutcome,
  sanitizeCategory,
  CreditEvidenceRecordSchema,
} from "./evidence.ts";
export type { CreditEvidenceRecord, EvidenceStatus } from "./evidence.ts";
export {
  CANONICAL_HASH_ABI_TYPES,
  NATIVE_ASSET_EVM_ADDRESS,
  canonicalIntentHash,
  merchantIdToBytes32,
} from "./canonical-hash.ts";
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
} from "./schemas.ts";
export type {
  AdvanceTestnetConfig,
  AgentIntent,
  CanonicalIntentInput,
  MerchantCatalog,
  NativeAssetDescriptor,
  NetworkObservation,
  ObservedExternalContract,
  OpenAIConfig,
} from "./types.ts";
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
} from "./api.ts";
export type {
  ApiError,
  ApiErrorCode,
  ExecuteResponse,
  IntentRequest,
  IntentResponse,
  PreflightResponse,
} from "./api.ts";
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
} from "./session-token.ts";
export type { SessionRole, SessionTokenPayload } from "./session-token.ts";
export { PAYMENT_STATUSES, classifyReceipt, isSettledReceipt, paymentCodeForStatus } from "./payment.ts";
export type { PaymentStatus, ReceiptResult } from "./payment.ts";
export { PINNED_MODEL, assertModelConfigAllowsCall, loadModelConfig } from "./model-config.ts";
export type { ModelConfig } from "./model-config.ts";
export {
  ARC_LANE,
  ARC_LANE_ASSET_ID,
  ARC_LANE_CHAIN_ID,
  ARC_LANE_CONTROLLER,
  ARC_LANE_MERCHANT,
  ARC_LANE_POOL,
  ARC_LANE_RPC_ENV_NAME,
  LEGACY_LANE,
  LEGACY_LANE_ASSET_ID,
  LEGACY_LANE_CHAIN_ID,
  LEGACY_LANE_RPC_ENV_NAME,
  assertArcLaneBinding,
  isLaneAssetPair,
  defaultChainForAsset,
  laneForChainId,
  resolveLane,
} from "./arc-lane.ts";
export type { LaneAssetId, LaneConfig, LaneSelection } from "./arc-lane.ts";
export {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_SOURCE,
  assertArcChainIdentity,
  getNetworkByChainId,
  loadArcTestnetConfig,
  parseArcTestnetConfig,
  parseChainNetworkConfig,
  requireVerifiedNetwork,
} from "./networks.ts";
export type { ChainNetworkConfig } from "./networks.ts";
export {
  ARC_CREDIT_AMOUNT_CAP_BASE_UNITS,
  ARC_CREDIT_DECIMALS,
  ARC_CREDIT_EXPIRY_DURATION_SECONDS,
  ARC_FIRST_TEST_PAYMENT_AMOUNT_BASE_UNITS,
  checkCreditAmount,
  checkCreditExpiryDuration,
  checkEvidenceFreshness,
  checkFirstTestPaymentAmount,
  checkLiveReadiness,
  checkRoleSeparation,
} from "./arc-credit-policy.ts";
export type { LiveReadiness, PolicyCheck, RoleSet } from "./arc-credit-policy.ts";
