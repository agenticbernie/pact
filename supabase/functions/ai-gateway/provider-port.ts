/**
 * Narrow provider port (S1): the ONLY OpenAI I/O is `fetch` inside
 * `openai-provider.ts`. This port carries no network import.
 */

export type ProviderCardContext = {
  cardId: string;
  agent: string;
  asset: string;
  recipient: string;
  policyVersion: number;
};

export type MerchantCatalogItem = {
  id: string;
  label: string;
};

export type ProviderIntentResult = {
  provider: "openai";
  model: string;
  merchantId: string;
  amountDecimal: string;
  purpose: string;
  confidence: number;
};

export interface AiProvider {
  parseIntent(input: {
    prompt: string;
    card: ProviderCardContext;
    merchants: ReadonlyArray<MerchantCatalogItem>;
  }): Promise<ProviderIntentResult>;
}

/**
 * AI provider identity boundary (Neon migration foundation).
 *
 * The MVP wires exactly one provider: pure OpenAI API, server-side only.
 * The Neon AI Gateway id is reserved as explicitly not enabled so no caller
 * can silently route through it. No gateway env names are referenced here.
 */
export const SUPPORTED_AI_PROVIDERS = ["openai"] as const;

export type AiProviderId = (typeof SUPPORTED_AI_PROVIDERS)[number] | "neon-ai-gateway";

export function assertSupportedProviderId(id: string): "openai" {
  if (id === "openai") return "openai";
  if (id === "neon-ai-gateway") {
    throw new Error("AI provider not enabled: neon-ai-gateway is a future option only");
  }
  throw new Error(`AI provider not enabled: ${id}`);
}
