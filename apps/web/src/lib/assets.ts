/**
 * Display metadata for settlement assets.
 *
 * The read API reports an asset id (`arc-testnet-usdc`), not its symbol or
 * decimals, so the mapping is mirrored from the committed network manifest
 * (`config/networks/arc-testnet.json`, `nativeAsset`). An unknown asset falls
 * back to its id suffix rather than a guessed symbol.
 */
type AssetMeta = { symbol: string; decimals: number };

const KNOWN_ASSETS: Readonly<Record<string, AssetMeta>> = {
  "arc-testnet-usdc": { symbol: "USDC", decimals: 18 },
};

export function assetMeta(asset: string): AssetMeta {
  const known = KNOWN_ASSETS[asset];
  if (known !== undefined) return known;
  const suffix = asset.split("-").pop() ?? asset;
  return { symbol: suffix.toUpperCase(), decimals: 18 };
}
