#!/usr/bin/env node
// Redacted config printer: shows presence and non-sensitive facts only.
// Never prints URLs, addresses, or secret values.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

const network = readJson("config/networks/advance-testnet.json");
const ai = readJson("config/ai/openai.json");

const output = {
  network: {
    protocol: network.protocol,
    label: network.label,
    chainId: network.chainId,
    nativeSymbol: network.nativeAsset?.symbol,
    nativeDecimals: network.nativeAsset?.decimals,
    rpcConfigured: network.rpcUrl !== "https://advance-testnet.example.invalid",
    explorerConfigured: network.explorerUrl !== "https://explorer.example.invalid",
    ascWired:
      network.asc?.verifierPrecompile !== "0x0000000000000000000000000000000000000000" &&
      network.asc?.evmV1DecoderLibrary !== "0x0000000000000000000000000000000000000000",
    verified: network.verified,
  },
  ai: {
    provider: ai.provider,
    model: ai.model,
    region: ai.region,
    allowFallback: ai.allowFallback,
  },
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
