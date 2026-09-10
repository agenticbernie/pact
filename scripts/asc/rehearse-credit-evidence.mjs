#!/usr/bin/env node
// Phase 03 Task 5 rehearsal — 5.1 + 5.2 only (preparation, NO BROADCAST).
// 5.1: chain guard rejects mainnet IDs and any target not matching config.
// 5.2: dry-run prints required env NAMES only — no provider contact, no values.
// This module has no network imports and never touches secrets beyond presence.

export const REQUIRED_PUBLIC = [
  "CREDITCOIN_RPC_URL",
  "SOURCE_CHAIN_RPC_URL",
  "PROOF_BUILDER_URL",
  "AGENT_WALLET_ADDRESS",
  "RELAYER_WALLET_ADDRESS",
  "DEPLOYER_WALLET_ADDRESS",
];

export const REQUIRED_SECRETS = ["ASC_RELAYER_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"];

// Mirrors domain UNSAFE_CHAIN_IDS + pack §13 mainnet list. Never allowlisted.
export const MAINNET_BLOCKED = [1, 10, 56, 100, 137, 250, 8453, 42161, 43114, 59144, 534352];

// Task 5B lane target: Advance/CC3 ONLY 102031. The generic preflight allowlist
// is [102030, 102031, 102032]; this lane is stricter by pack hard stop.
export const TASK_TARGET_CHAIN_ID = 102031;
export const TARGET_ALLOWLIST = [102031];

// Source chain: Sepolia 11155111 is resolution-only for SOURCE_CHAIN_KEY via
// getSupportedChains(). It must never be accepted as a rehearsal target.
export const SOURCE_CHAIN_ID = 11155111;

function isSet(env, name) {
  return env[name] !== undefined && env[name] !== "";
}

export function getDryRunReport(env = process.env) {
  const states = {};
  for (const name of [...REQUIRED_PUBLIC, ...REQUIRED_SECRETS]) {
    states[name] = isSet(env, name) ? "set" : "missing";
  }
  const missing = Object.entries(states)
    .filter(([, s]) => s === "missing")
    .map(([n]) => n);
  return { dryRun: true, stage: "rehearse-dry-run", ok: missing.length === 0, states, missing };
}

export class ChainGuardError extends Error {
  constructor(reason) {
    super(`rehearsal chain guard rejected: ${reason}.`);
    this.name = "ChainGuardError";
    this.code = "CHAIN_GUARD_REJECTED";
    this.reason = reason;
  }
}

export function assertChainGuard({ targetChainId, configChainId } = {}) {
  if (!Number.isSafeInteger(targetChainId) || !Number.isSafeInteger(configChainId)) {
    throw new ChainGuardError("chain-unresolved");
  }
  if (targetChainId === SOURCE_CHAIN_ID || configChainId === SOURCE_CHAIN_ID) {
    throw new ChainGuardError("source-not-target");
  }
  if (MAINNET_BLOCKED.includes(targetChainId) || MAINNET_BLOCKED.includes(configChainId)) {
    throw new ChainGuardError("mainnet-blocked");
  }
  if (targetChainId !== TASK_TARGET_CHAIN_ID || configChainId !== TASK_TARGET_CHAIN_ID) {
    throw new ChainGuardError("target-not-allowlisted");
  }
  if (!TARGET_ALLOWLIST.includes(targetChainId) || !TARGET_ALLOWLIST.includes(configChainId)) {
    throw new ChainGuardError("target-not-allowlisted");
  }
  if (targetChainId !== configChainId) {
    throw new ChainGuardError("target-config-mismatch");
  }
  return { ok: true, targetChainId };
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  (await import("node:url").then(({ pathToFileURL }) => pathToFileURL(process.argv[1]).href)) ===
    import.meta.url;

if (invokedDirectly) {
  const argv = process.argv.slice(2);
  if (argv.includes("--dry-run")) {
    const report = getDryRunReport();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 2;
  } else {
    process.stdout.write(
      `${JSON.stringify({ dryRun: false, usage: "node scripts/asc/rehearse-credit-evidence.mjs --dry-run", note: "live lane not implemented in preparation step; no broadcast" }, null, 2)}\n`,
    );
    process.exitCode = 1;
  }
}
