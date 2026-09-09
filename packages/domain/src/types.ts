export type AgentIntent = {
  intentId: string;
  agentId: string;
  cardId: string;
  merchantId: string;
  amountBaseUnits: string;
  asset: "native-testnet-ctc";
  purpose: string;
  confidence: number;
  provider: "openai";
  model: string;
  createdAt: string;
  expiresAt: string;
  policyVersion: number;
  intentHash: string;
};

export type CanonicalIntentInput = Pick<
  AgentIntent,
  | "cardId"
  | "agentId"
  | "merchantId"
  | "amountBaseUnits"
  | "asset"
  | "purpose"
  | "expiresAt"
  | "policyVersion"
>;

export type NativeAssetDescriptor = {
  id: "native-testnet-ctc";
  evmAddress: string;
  symbol: string;
  decimals: number;
};

export type AdvanceTestnetConfig = {
  protocol: "creditcoin-evm";
  label: "advance-testnet";
  rpcUrl: string;
  chainId: number;
  explorerUrl: string;
  nativeAsset: NativeAssetDescriptor;
  asc: {
    verifierPrecompile: string;
    evmV1DecoderLibrary: string;
  };
  verified: boolean;
};

export type NetworkObservation = {
  rpcChainId: number;
  verifierHasBytecode: boolean;
  decoderHasBytecode: boolean;
};

export type OpenAIConfig = {
  provider: "openai";
  model: "gpt-5.6-luna";
  region: string;
  allowFallback: false;
};

export type MerchantCatalog = {
  readonly ids: readonly string[];
};
