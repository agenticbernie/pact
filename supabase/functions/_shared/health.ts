/**
 * Health shape: requestId, configured region, expected region, chain ID,
 * provider name, and model availability — never secrets.
 */
export type HealthResponse = {
  requestId: string;
  configuredRegion: string;
  expectedRegion: string;
  chainId: number;
  provider: "openai";
  model: string;
  modelAvailable: boolean;
};

export function buildHealth(input: {
  requestId: string;
  configuredRegion: string;
  expectedRegion: string;
  chainId: number;
  model: string;
  modelAvailable: boolean;
}): HealthResponse {
  return {
    requestId: input.requestId,
    configuredRegion: input.configuredRegion,
    expectedRegion: input.expectedRegion,
    chainId: input.chainId,
    provider: "openai",
    model: input.model,
    modelAvailable: input.modelAvailable,
  };
}
