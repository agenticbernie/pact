import { DomainError } from "./errors.ts";

/**
 * H1/H2 execution-lane identity (Arc migration).
 *
 * Product decision: H1/H2 execute on Arc Testnet. Creditcoin/CTC remains as
 * the preserved legacy lane (Phase 03 history, existing tests). Lane binding
 * is explicit everywhere: no code may assume a chain or asset default.
 *
 * Cross-chain replay note: the canonical 8-field hash tuple is UNCHANGED
 * (both native assets share the `address(0)` EVM representation). Replay
 * protection across lanes comes from chain-gated stores and controller
 * binding, never from a tuple change.
 *
 * Deno-safe: pure module, no Node imports (importable from Supabase fns).
 */

/** Arc Testnet chain ID (live-reconfirmed in the Arc closeout index). */
export const ARC_LANE_CHAIN_ID = 5042002;

/** Canonical Arc lane asset literal (A1 `config/networks/arc-testnet.json`). */
export const ARC_LANE_ASSET_ID = "arc-testnet-usdc";

/** Env name carrying the Arc lane RPC endpoint (production Deno wiring). */
export const ARC_LANE_RPC_ENV_NAME = "ARC_RPC_URL";

/** Arc deployment manifest addresses (lowercase; source-verified on Arc). */
export const ARC_LANE_CONTROLLER =
  "0x7a474c005433def5fc496d2016f6ae794edfc423";
export const ARC_LANE_POOL =
  "0x5e1771de29bd1a084900d032fd4db2ac7c7528b";
export const ARC_LANE_MERCHANT =
  "0xac030ddaa1fc29c1738332c3b9524ecfd0b4174f";

/** Preserved legacy lane (Creditcoin/Advance + CTC). Not an H1/H2 target. */
export const LEGACY_LANE_CHAIN_ID = 102031;
export const LEGACY_LANE_ASSET_ID = "native-testnet-ctc";
export const LEGACY_LANE_RPC_ENV_NAME = "CREDITCOIN_RPC_URL";

export type LaneSelection = "arc" | "creditcoin";

export type LaneAssetId = typeof ARC_LANE_ASSET_ID | typeof LEGACY_LANE_ASSET_ID;

export type LaneConfig = {
  chainId: number;
  asset: string;
  rpcEnvName: string;
  controller?: string;
};

export const ARC_LANE: LaneConfig = {
  chainId: ARC_LANE_CHAIN_ID,
  asset: ARC_LANE_ASSET_ID,
  rpcEnvName: ARC_LANE_RPC_ENV_NAME,
  controller: ARC_LANE_CONTROLLER,
};

export const LEGACY_LANE: LaneConfig = {
  chainId: LEGACY_LANE_CHAIN_ID,
  asset: LEGACY_LANE_ASSET_ID,
  rpcEnvName: LEGACY_LANE_RPC_ENV_NAME,
};

/**
 * Injectable-seam default is the legacy lane so pre-migration callers and
 * tests keep byte-identical behavior. Production `Deno.serve` roots pass
 * `"arc"` explicitly (product decision). Never silently default to Arc.
 */
export function resolveLane(selection?: LaneSelection | LaneConfig): LaneConfig {
  if (selection === undefined || selection === "creditcoin") return { ...LEGACY_LANE };
  if (selection === "arc") return { ...ARC_LANE };
  return {
    chainId: selection.chainId,
    asset: selection.asset,
    rpcEnvName: selection.rpcEnvName,
    ...(selection.controller === undefined ? {} : { controller: selection.controller }),
  };
}

/** True only for the two known (chain, asset) pairs. Anything else fails closed. */
export function isLaneAssetPair(chainId: unknown, asset: unknown): boolean {
  return (
    (chainId === ARC_LANE_CHAIN_ID && asset === ARC_LANE_ASSET_ID) ||
    (chainId === LEGACY_LANE_CHAIN_ID && asset === LEGACY_LANE_ASSET_ID)
  );
}

/**
 * Chain inferred from an asset literal for rows that predate the chain_id
 * column (legacy fakes/fixtures). Unknown assets fall back to legacy so the
 * pair check still rejects them fail-closed. Explicit chain_id always wins
 * at the call site; this never overrides a stored value.
 */
export function defaultChainForAsset(asset: unknown): number {
  if (asset === ARC_LANE_ASSET_ID) return ARC_LANE_CHAIN_ID;
  return LEGACY_LANE_CHAIN_ID;
}

export function laneForChainId(chainId: number): LaneSelection {
  if (chainId === ARC_LANE_CHAIN_ID) return "arc";
  if (chainId === LEGACY_LANE_CHAIN_ID) return "creditcoin";
  throw new DomainError("NETWORK_CONFIG_INVALID", "Unknown lane chain.", {
    chainId: String(chainId),
  });
}

function toLaneError(details: Record<string, string>): DomainError {
  return new DomainError("NETWORK_CONFIG_INVALID", "Arc lane binding mismatch.", details);
}

/** Fail-closed Arc binding: exact chain + asset, plus controller when checked. */
export function assertArcLaneBinding(input: {
  chainId: unknown;
  asset: unknown;
  controller?: unknown;
}): void {
  if (input.chainId !== ARC_LANE_CHAIN_ID || input.asset !== ARC_LANE_ASSET_ID) {
    throw toLaneError({ reason: "not-arc-lane-pair" });
  }
  if (input.controller !== undefined && String(input.controller).toLowerCase() !== ARC_LANE_CONTROLLER) {
    throw toLaneError({ reason: "controller-mismatch" });
  }
}
