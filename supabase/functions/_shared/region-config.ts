export type RuntimeEnv = Record<string, string | undefined>;

function readRegion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function isValidRegion(value: string | undefined): boolean {
  return value !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)+-\d+$/.test(value);
}

export type ResolvedRegionConfig = {
  /**
   * AUTHORITATIVE project region, from operator `PACT_EXPECTED_REGION`
   * (`SUPABASE_FUNCTION_REGION` only for explicit local/test inputs).
   * For Pact staging this is `us-east-1`. Missing/malformed still fails
   * protected work closed via `regionsMatch`.
   */
  expectedRegion?: string;
  /**
   * Platform-OBSERVED runtime metadata, from `SB_REGION`. Records where a
   * given invocation executed (e.g. edge runtime), NEVER the project
   * region. Validated for presence/shape only; never compared for
   * equality against the authoritative region.
   */
  observedRuntimeRegion?: string;
  /**
   * Health-facing project region: authoritative or `"unknown"`. This is
   * what `configuredRegion` reports — never the observed runtime value.
   */
  configuredRegion: string;
};

export function resolveRegionConfig(env: RuntimeEnv): ResolvedRegionConfig {
  // SUPABASE_FUNCTION_REGION is retained only for explicit local/test inputs.
  const expectedRegion = env.PACT_EXPECTED_REGION !== undefined
    ? readRegion(env.PACT_EXPECTED_REGION)
    : readRegion(env.SUPABASE_FUNCTION_REGION);
  const observedRuntimeRegion = readRegion(env.SB_REGION);
  return {
    expectedRegion,
    observedRuntimeRegion,
    configuredRegion: expectedRegion ?? "unknown",
  };
}

/**
 * Validity-only gate: both names present and well-formed. Deliberately NOT
 * an equality check — the authoritative project region and the observed
 * runtime region are separate facts (e.g. `us-east-1` vs `ap-southeast-1`
 * is the HEALTHY production shape, not a mismatch).
 */
export function regionsMatch(expectedRegion: string | undefined, observedRegion: string | undefined): boolean {
  return isValidRegion(expectedRegion) && isValidRegion(observedRegion);
}
