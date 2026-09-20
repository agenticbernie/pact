/**
 * Function-side lane surface (Arc migration): thin re-export of the domain
 * lane authority plus the injectable-seam default rule.
 *
 * Injectable composition roots default to the legacy lane so pre-migration
 * callers and tests keep byte-identical behavior. Production `Deno.serve`
 * roots pass `"arc"` explicitly (product decision). Never silently default
 * to Arc.
 */
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
} from "../../../packages/domain/src/arc-lane.ts";
export type {
  LaneAssetId,
  LaneConfig,
  LaneSelection,
} from "../../../packages/domain/src/arc-lane.ts";
