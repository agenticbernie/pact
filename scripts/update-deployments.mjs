#!/usr/bin/env node
// Reads Foundry broadcast artifacts and writes deployed addresses into shared/deployments.json.
// Usage (after deploying): node scripts/update-deployments.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deploymentsPath = path.join(root, "shared", "deployments.json");
const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));

const targets = [
  { script: "DeployFuji.s.sol", chainId: 43113, key: "avalancheFuji" },
  { script: "DeployDestination.s.sol", chainId: 421614, key: "arbitrumSepolia" },
  { script: "DeployDestination.s.sol", chainId: 84532, key: "baseSepolia" },
  { script: "DeployBatchDispatcher.s.sol", chainId: 421614, key: "arbitrumSepolia" },
  { script: "DeployBatchDispatcher.s.sol", chainId: 84532, key: "baseSepolia" },
];

for (const { script, chainId, key } of targets) {
  const file = path.join(root, "contracts", "broadcast", script, String(chainId), "run-latest.json");
  if (!fs.existsSync(file)) {
    console.warn(`skip ${key}: no broadcast at ${path.relative(root, file)}`);
    continue;
  }
  const run = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const tx of run.transactions ?? []) {
    if (tx.transactionType === "CREATE" && (tx.contractName in deployments.networks[key].contracts || tx.contractName === "PactBatchDispatcher")) {
      deployments.networks[key].contracts[tx.contractName] = tx.contractAddress;
      console.log(`${key}.${tx.contractName} = ${tx.contractAddress}`);
    }
  }
}

fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
