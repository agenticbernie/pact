#!/usr/bin/env node
/**
 * Arc Testnet deploy dry-run (A1, foundation only).
 *
 * WHAT IT DOES: validates the Arc network config, resolves prerequisites
 * from environment presence (names only, values never printed), prints the
 * intended deployment plan, and exits non-zero while live prerequisites are
 * missing. This is the ONLY safe outcome before an approved live lane.
 *
 * WHAT IT NEVER DOES: broadcast, deploy, fund, call mutators, request the
 * faucet, consume nonces, or touch the network unless `--verify-rpc` is
 * passed (which itself requires an explicit live/read-only approval).
 *
 * Exit codes: 0 = all prerequisites present (still performs NO mutation);
 * 2 = config invalid; 3 = live prerequisites missing (fail closed).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_CHAIN_ID = 5042002;
const EXPECTED_EVM_PROFILE = "osaka";
const DEPLOY_CONTRACTS = ["MerchantSimulator", "PactCreditPool", "PactCardController"];
const EXCLUDED_CONTRACTS = [
  ["PactCreditASC", "needs the Creditcoin 0xFD2 precompile; no Arc equivalent; verified-credit out of Arc MVP"],
  ["PactCreditSource", "Sepolia-side ASC emitter; out of Arc MVP lane"],
];
const REQUIRED_ENV_NAMES = ["ARC_RPC_URL", "DEPLOYER_PRIVATE_KEY"];

function parseArgs(argv) {
  const args = { config: "config/networks/arc-testnet.json", verifyRpc: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config" && i + 1 < argv.length) {
      args.config = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--verify-rpc") {
      args.verifyRpc = true;
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      args.help = true;
    }
  }
  return args;
}

function fail(code, lines) {
  for (const line of lines) console.log(line);
  process.exit(code);
}

function checkConfig(config) {
  const problems = [];
  if (config?.id !== "arc-testnet") problems.push("config.id must be 'arc-testnet'");
  if (config?.chainId !== EXPECTED_CHAIN_ID) {
    problems.push(`config.chainId must be ${EXPECTED_CHAIN_ID}, got ${String(config?.chainId)}`);
  }
  if (config?.evmProfile !== EXPECTED_EVM_PROFILE) {
    problems.push(`config.evmProfile must be '${EXPECTED_EVM_PROFILE}', got ${String(config?.evmProfile)}`);
  }
  if (config?.feePolicy?.minBaseFeeGwei !== "20") problems.push("config.feePolicy.minBaseFeeGwei must be '20'");
  if (config?.feePolicy?.confirmations !== 1) problems.push("config.feePolicy.confirmations must be 1");
  if (config?.rejectsZeroAddressValue !== true) problems.push("config.rejectsZeroAddressValue must be true");
  if (!Array.isArray(config?.unsupportedFeatures) || !config.unsupportedFeatures.includes("verified-credit")) {
    problems.push("config.unsupportedFeatures must include 'verified-credit'");
  }
  if (!Array.isArray(config?.deployedContracts) || config.deployedContracts.length !== 0) {
    problems.push("config.deployedContracts must be empty (no fake addresses)");
  }
  if (typeof config?.rpcUrl !== "string" || !config.rpcUrl.includes("rpc.testnet.arc.io")) {
    problems.push("config.rpcUrl must reference the documented Arc Testnet host");
  }
  return problems;
}

async function verifyChainId(rpcUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: controller.signal,
    });
    const body = await response.json();
    const observed = Number.parseInt(body?.result ?? "", 16);
    return observed;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/dry-run-arc-deploy.mjs --config <path> [--verify-rpc]");
    console.log("Dry-run only. Never broadcasts, deploys, funds, or claims the faucet.");
    return;
  }
  let config;
  try {
    config = JSON.parse(readFileSync(resolve(args.config), "utf8"));
  } catch {
    fail(2, [`config unreadable: ${args.config}`, "result: CONFIG_INVALID"]);
  }
  const configProblems = checkConfig(config);
  if (configProblems.length > 0) {
    fail(2, ["Arc config problems:", ...configProblems.map((p) => `  - ${p}`), "result: CONFIG_INVALID"]);
  }

  const missing = REQUIRED_ENV_NAMES.filter((name) => !process.env[name]);

  console.log(`network: ${config.id} (chainId ${config.chainId}, evm ${config.evmProfile})`);
  console.log(`config live status: verified=${String(config.verified)} (documented, live unverified)`);
  console.log("would deploy (in order):");
  for (const name of DEPLOY_CONTRACTS) console.log(`  - ${name}`);
  console.log("excluded from the Arc MVP lane:");
  for (const [name, reason] of EXCLUDED_CONTRACTS) console.log(`  - ${name}: ${reason}`);
  console.log(`fee policy: minBaseFeeGwei=${config.feePolicy.minBaseFeeGwei}, confirmations=${config.feePolicy.confirmations}`);
  console.log("zero-address value transfers: rejected (Arc protocol rule)");
  console.log(`faucet (manual claim only, never automatic): ${config.faucetUrl ?? "unknown"}`);

  let rpcNote = "RPC chain-identity check: skipped (no --verify-rpc; no network use)";
  if (args.verifyRpc) {
    if (!process.env["ARC_RPC_URL"]) {
      fail(3, ["--verify-rpc requested but ARC_RPC_URL is absent.", "result: MISSING_PREREQUISITES"]);
    }
    const observed = await verifyChainId(process.env["ARC_RPC_URL"]);
    if (observed !== EXPECTED_CHAIN_ID) {
      fail(2, [`RPC chain mismatch: observed ${String(observed)}, expected ${EXPECTED_CHAIN_ID}.`, "result: CHAIN_MISMATCH"]);
    }
    rpcNote = `RPC chain-identity check: observed ${observed} (matches)`;
  }
  console.log(rpcNote);

  if (missing.length > 0) {
    fail(3, [
      "missing prerequisites (names only, values never shown):",
      ...missing.map((name) => `  - ${name}`),
      "result: MISSING_PREREQUISITES (fail closed; no broadcast, no deploy, no faucet call)",
    ]);
  }
  console.log("all prerequisites present. Still a dry-run: no mutation performed.");
  console.log("result: DRY_RUN_READY");
}

await main();
