/**
 * Thin re-export of the canonical intent hash (no local copy).
 * Source of truth: Phase 01 `packages/domain/src/canonical-hash.ts`.
 */
export {
  CANONICAL_HASH_ABI_TYPES,
  NATIVE_ASSET_EVM_ADDRESS,
  canonicalIntentHash,
  merchantIdToBytes32,
} from "../../../packages/domain/src/canonical-hash.ts";
