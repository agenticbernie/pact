#!/usr/bin/env node
// Export forge deployment artifacts to the SDK and manifest.
// Reads ONLY the broadcast receipt JSON and compiled forge artifacts.
// Never reads keys, mnemonics, or env files.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACTS = ["PactCardController", "PactCreditPool", "MerchantSimulator"];
const MANIFEST_KEYS = {
  PactCardController: "controller",
  PactCreditPool: "pool",
  MerchantSimulator: "merchantSimulator",
};

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`missing --${name} argument`);
  }
  return process.argv[index + 1];
}

function readAbi(root, contract) {
  const artifact = JSON.parse(
    readFileSync(resolve(root, `contracts/out/${contract}.sol/${contract}.json`), "utf8"),
  );
  if (!Array.isArray(artifact.abi)) {
    throw new Error(`no abi in artifact for ${contract}`);
  }
  return artifact.abi;
}

export function exportArtifacts({ root, broadcastPath, manifestPath, sdkDir }) {
  const broadcast = JSON.parse(readFileSync(broadcastPath, "utf8"));
  const addresses = {};
  for (const tx of broadcast.transactions ?? []) {
    if (tx.transactionType === "CREATE" && MANIFEST_KEYS[tx.contractName] !== undefined) {
      if (typeof tx.contractAddress !== "string" || tx.contractAddress.length === 0) {
        throw new Error(`missing contractAddress for ${tx.contractName}`);
      }
      addresses[MANIFEST_KEYS[tx.contractName]] = tx.contractAddress;
    }
  }
  for (const [contract, key] of Object.entries(MANIFEST_KEYS)) {
    if (addresses[key] === undefined) {
      throw new Error(`broadcast is missing deployment of ${contract}`);
    }
  }
  const receipts = broadcast.receipts ?? [];
  const deployedAtBlock = receipts.length > 0 ? Number(receipts[0].blockNumber) : 0;
  let gitCommit = "unknown";
  try {
    gitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    gitCommit = "unknown";
  }
  const chainId = Number(
    broadcastPath.split("/").find((part) => /^\d+$/.test(part)) ?? "0",
  );
  const manifest = {
    protocol: "creditcoin-evm",
    label: "anvil-local",
    chainId,
    ...addresses,
    deployedAtBlock,
    gitCommit,
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const abis = {};
  for (const contract of CONTRACTS) {
    abis[MANIFEST_KEYS[contract]] = readAbi(root, contract);
  }
  mkdirSync(resolve(sdkDir, "src"), { recursive: true });
  writeFileSync(
    resolve(sdkDir, "src/abi.ts"),
    `export const PACT_ABI = ${JSON.stringify(abis, null, 2)} as const;\n`,
  );
  writeFileSync(
    resolve(sdkDir, "src/addresses.ts"),
    `export const PACT_ADDRESSES = ${JSON.stringify({ chainId, ...addresses }, null, 2)} as const;\n`,
  );
  writeFileSync(
    resolve(sdkDir, "src/index.ts"),
    `export { PACT_ABI } from "./abi.js";\nexport { PACT_ADDRESSES } from "./addresses.js";\n`,
  );
  return manifest;
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const root = process.cwd();
  const manifest = exportArtifacts({
    root,
    broadcastPath: resolve(root, arg("broadcast")),
    manifestPath: resolve(root, arg("manifest")),
    sdkDir: resolve(root, arg("sdk-dir")),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
