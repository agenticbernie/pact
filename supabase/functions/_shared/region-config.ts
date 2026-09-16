export type RuntimeEnv = Record<string, string | undefined>;

function readRegion(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined;
}

function isValidRegion(value: string | undefined): boolean {
  return value !== undefined && /^[a-z0-9]+(?:-[a-z0-9]+)+-\d+$/.test(value);
}

export function resolveRegionConfig(env: RuntimeEnv): {
  expectedRegion?: string;
  observedRegion?: string;
  configuredRegion: string;
} {
  // SUPABASE_FUNCTION_REGION is retained only for explicit local/test inputs.
  const expectedRegion = env.PACT_EXPECTED_REGION !== undefined
    ? readRegion(env.PACT_EXPECTED_REGION)
    : readRegion(env.SUPABASE_FUNCTION_REGION);
  const observedRegion = readRegion(env.SB_REGION);
  return {
    expectedRegion,
    observedRegion,
    configuredRegion: observedRegion ?? "unknown",
  };
}

export function regionsMatch(expectedRegion: string | undefined, observedRegion: string | undefined): boolean {
  return isValidRegion(expectedRegion) && isValidRegion(observedRegion);
}
