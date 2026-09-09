#!/usr/bin/env node
// Dry-run helper: prints the environment names a proof submission needs and
// the redacted presence of each. Never prints values, never calls a provider.
const REQUIRED = [
  "SOURCE_CHAIN_RPC_URL",
  "SOURCE_CHAIN_KEY",
  "SOURCE_CREDIT_SOURCE_ADDRESS",
  "PROOF_BUILDER_URL",
  "CREDITCOIN_RPC_URL",
  "PACT_CREDIT_ASC_ADDRESS",
  "ASC_RELAYER_PRIVATE_KEY",
];

const presence = {};
for (const name of REQUIRED) {
  presence[name] = process.env[name] === undefined || process.env[name] === "" ? "missing" : "set";
}

process.stdout.write(`${JSON.stringify({ dryRun: true, requiredEnv: presence }, null, 2)}\n`);
const missing = Object.entries(presence)
  .filter(([, state]) => state === "missing")
  .map(([name]) => name);
process.exitCode = missing.length > 0 ? 2 : 0;
