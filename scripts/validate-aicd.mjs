#!/usr/bin/env node
// Pact AICD validator: parses/merges the seven YAML fragments deterministically,
// enforces authority/cannot/deployment/evidence links, secret boundaries,
// scenario-registry membership, and generated-diagram parity.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const archDir = resolve(root, "architecture");

const FRAGMENTS = [
  "pact.system.aicd.yaml",
  "pact.contracts.aicd.yaml",
  "pact.policies.aicd.yaml",
  "pact.trust-boundaries.aicd.yaml",
  "pact.ui.aicd.yaml",
  "pact.deployment.aicd.yaml",
  "pact.evidence.aicd.yaml",
];

const COLLECTIONS = [
  "components",
  "policies",
  "invariants",
  "flows",
  "boundaries",
  "deployments",
  "uiStates",
];

const SECRET_FORBIDDEN_DEPLOYMENTS = new Set(["browser", "cloudflare-edge"]);
const MERMAID_PATH = resolve(archDir, "generated", "pact-architecture.mmd");

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function loadMerged() {
  const docs = FRAGMENTS.map((file) => parseYaml(readFileSync(resolve(archDir, file), "utf8")));
  const merged = {};
  const versions = new Set(docs.map((doc) => doc.version));
  if (versions.size !== 1) {
    fail(`fragment version mismatch: ${[...versions].join(",")}`);
  }
  merged.version = [...versions][0];
  for (const doc of docs) {
    for (const [key, value] of Object.entries(doc)) {
      if (key === "version") {
        continue;
      }
      if (Array.isArray(value)) {
        merged[key] = [...(merged[key] ?? []), ...value];
      } else if (merged[key] === undefined) {
        merged[key] = value;
      } else {
        fail(`duplicate singleton section: ${key}`);
      }
    }
  }
  return merged;
}

function checkSecretBoundary(node, deployment, path) {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      checkSecretBoundary(node[index], deployment, `${path}[${index}]`);
    }
    return;
  }
  if (typeof node === "object" && node !== null) {
    const record = node;
    const current = typeof record.deployment === "string" ? record.deployment : deployment;
    if (Array.isArray(record.secrets) && record.secrets.length > 0) {
      if (SECRET_FORBIDDEN_DEPLOYMENTS.has(current)) {
        fail(`secret-bearing node deployed to forbidden target: ${path} (${current})`);
      }
      for (const secret of record.secrets) {
        if (typeof secret !== "string" || secret.length === 0) {
          fail(`empty secret entry at ${path}`);
        }
      }
    }
    for (const [key, entry] of Object.entries(record)) {
      if (key === "deployment") {
        continue;
      }
      checkSecretBoundary(entry, current, path === "" ? key : `${path}.${key}`);
    }
  }
}

function buildMermaid(merged) {
  const lines = ["flowchart TB"];
  for (const component of merged.components ?? []) {
    lines.push(`    ${component.id}["${component.id}"]`);
  }
  const seen = new Set();
  for (const flow of merged.flows ?? []) {
    const chain = [flow.from, ...(flow.through ?? [])];
    for (let index = 0; index + 1 < chain.length; index += 1) {
      const edge = `    ${chain[index]} --> ${chain[index + 1]}`;
      if (!seen.has(edge)) {
        seen.add(edge);
        lines.push(edge);
      }
    }
  }
  const hash = createHash("sha256").update(stableStringify(merged)).digest("hex");
  return `%% aicd-hash: ${hash}\n${lines.join("\n")}\n`;
}

const merged = loadMerged();

const schema = JSON.parse(readFileSync(resolve(archDir, "aicd.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
if (!validate(merged)) {
  for (const error of validate.errors ?? []) {
    fail(`schema: ${error.instancePath} ${error.message}`);
  }
}

const registry = JSON.parse(readFileSync(resolve(archDir, "scenario-registry.json"), "utf8"));
const registered = new Set(registry.scenarios ?? []);

const ids = new Map();
for (const collection of COLLECTIONS) {
  for (const node of merged[collection] ?? []) {
    if (ids.has(node.id)) {
      fail(`duplicate ID: ${node.id} (also in ${ids.get(node.id)})`);
    } else {
      ids.set(node.id, collection);
    }
  }
}

const components = new Map((merged.components ?? []).map((component) => [component.id, component]));
const invariants = new Map((merged.invariants ?? []).map((invariant) => [invariant.id, invariant]));

for (const flow of merged.flows ?? []) {
  for (const hop of [flow.from, ...(flow.through ?? [])]) {
    if (!components.has(hop)) {
      fail(`flow ${flow.id} references undeclared component: ${hop}`);
    }
  }
  if (flow.realData === true && (flow.evidence ?? []).length === 0) {
    fail(`real-data flow without evidence: ${flow.id}`);
  }
}

for (const policy of merged.policies ?? []) {
  if (policy.critical === true) {
    if (!invariants.has(policy.invariant)) {
      fail(`critical policy without invariant link: ${policy.id}`);
    }
    if ((policy.scenarios ?? []).length === 0) {
      fail(`critical policy without scenario link: ${policy.id}`);
    }
  }
}

for (const state of merged.uiStates ?? []) {
  if (state.kind === "success") {
    if (state.receiptGate !== true) {
      fail(`UI success state without receipt gate: ${state.id}`);
    }
    if ((state.evidence ?? []).length === 0) {
      fail(`UI success state without evidence: ${state.id}`);
    }
  }
}

for (const deployment of merged.deployments ?? []) {
  for (const host of deployment.hosts ?? []) {
    if (!components.has(host)) {
      fail(`deployment ${deployment.id} hosts undeclared component: ${host}`);
    }
  }
}

const referencedScenarios = new Set();
for (const component of merged.components ?? []) {
  for (const scenario of component.evidence ?? []) {
    referencedScenarios.add(scenario);
  }
}
for (const flow of merged.flows ?? []) {
  for (const scenario of flow.evidence ?? []) {
    referencedScenarios.add(scenario);
  }
}
for (const invariant of merged.invariants ?? []) {
  for (const scenario of invariant.provenBy ?? []) {
    referencedScenarios.add(scenario);
  }
}
for (const policy of merged.policies ?? []) {
  for (const scenario of policy.scenarios ?? []) {
    referencedScenarios.add(scenario);
  }
}
for (const state of merged.uiStates ?? []) {
  for (const scenario of state.evidence ?? []) {
    referencedScenarios.add(scenario);
  }
}
for (const scenario of referencedScenarios) {
  if (!registered.has(scenario)) {
    fail(`scenario reference missing from registry: ${scenario}`);
  }
}

for (const component of merged.components ?? []) {
  checkSecretBoundary(component, component.deployment, component.id);
}

const expected = buildMermaid(merged);
if (process.argv.includes("--write")) {
  mkdirSync(dirname(MERMAID_PATH), { recursive: true });
  writeFileSync(MERMAID_PATH, expected);
  notes.push(`diagram written to ${MERMAID_PATH}`);
} else {
  let actual = null;
  try {
    actual = readFileSync(MERMAID_PATH, "utf8");
  } catch {
    fail(`generated diagram missing: ${MERMAID_PATH}`);
  }
  if (actual !== null && actual !== expected) {
    fail("generated diagram is stale: rerun with --write and commit the result");
  }
}

const componentCount = (merged.components ?? []).length;
const flowCount = (merged.flows ?? []).length;
notes.push(`${componentCount} components, ${flowCount} flows, ${referencedScenarios.size} scenarios referenced`);

console.log(JSON.stringify({ failures, notes }, null, 2));
if (failures.length > 0) {
  process.exitCode = 1;
}
