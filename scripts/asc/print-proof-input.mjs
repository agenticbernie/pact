#!/usr/bin/env node
// Hybrid lane Step-0 input gate (dry run): validates ONLY the 8 operator
// inputs. Derived values (SOURCE_CHAIN_KEY) and deployment outputs
// (SOURCE_CREDIT_SOURCE_ADDRESS, PACT_CREDIT_ASC_ADDRESS) are reported as
// pending and never block. Secrets are presence-checked only — values are
// never printed, logged, or persisted. FUNDER_PRIVATE_KEY is not consulted.
export const STEP0_PUBLIC = [
  "CREDITCOIN_RPC_URL",
  "SOURCE_CHAIN_RPC_URL",
  "PROOF_BUILDER_URL",
  "AGENT_WALLET_ADDRESS",
  "RELAYER_WALLET_ADDRESS",
  "DEPLOYER_WALLET_ADDRESS",
];

export const STEP0_SECRET = ["ASC_RELAYER_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY"];

export const DERIVED_LATER = [
  "SOURCE_CHAIN_KEY",
  "SOURCE_CREDIT_SOURCE_ADDRESS",
  "PACT_CREDIT_ASC_ADDRESS",
];

function isSet(env, name) {
  return env[name] !== undefined && env[name] !== "";
}

export function checkStepZero(env = process.env) {
  const states = {};
  for (const name of [...STEP0_PUBLIC, ...STEP0_SECRET]) {
    states[name] = isSet(env, name) ? "set" : "missing";
  }
  const missing = Object.entries(states)
    .filter(([, state]) => state === "missing")
    .map(([name]) => name);
  const pendingDerived = DERIVED_LATER.filter((name) => !isSet(env, name));
  return { ok: missing.length === 0, states, missing, pendingDerived };
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  (await import("node:url").then(({ pathToFileURL }) => pathToFileURL(process.argv[1]).href)) ===
    import.meta.url;

if (invokedDirectly) {
  const result = checkStepZero();
  process.stdout.write(
    `${JSON.stringify({ dryRun: true, stage: "step-0-operator-inputs", ...result }, null, 2)}\n`,
  );
  process.exitCode = result.ok ? 0 : 2;
}
