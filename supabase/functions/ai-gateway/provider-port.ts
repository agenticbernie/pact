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
