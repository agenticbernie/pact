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
} from "./schemas.js";
export type {
  AdvanceTestnetConfig,
  AgentIntent,
  CanonicalIntentInput,
  MerchantCatalog,
  NativeAssetDescriptor,
  NetworkObservation,
  OpenAIConfig,
} from "./types.js";
