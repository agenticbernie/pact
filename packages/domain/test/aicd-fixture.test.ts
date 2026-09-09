import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const archDir = resolve(here, "../../../architecture");

const FRAGMENTS = [
  "pact.system.aicd.yaml",
  "pact.contracts.aicd.yaml",
  "pact.policies.aicd.yaml",
  "pact.trust-boundaries.aicd.yaml",
  "pact.ui.aicd.yaml",
  "pact.deployment.aicd.yaml",
  "pact.evidence.aicd.yaml",
];

type Doc = Record<string, unknown>;

function loadMerged(): {
  components: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  invariants: Array<Record<string, unknown>>;
  flows: Array<Record<string, unknown>>;
  boundaries: Array<Record<string, unknown>>;
  deployments: Array<Record<string, unknown>>;
  uiStates: Array<Record<string, unknown>>;
  registry: string[];
  mermaid: string;
} {
  const docs: Doc[] = FRAGMENTS.map((file) =>
    parseYaml(readFileSync(resolve(archDir, file), "utf8")) as Doc,
  );
  const pick = (key: string) =>
    docs.flatMap((doc) => (Array.isArray(doc[key]) ? (doc[key] as Array<Record<string, unknown>>) : []));
  const registry = JSON.parse(
    readFileSync(resolve(archDir, "scenario-registry.json"), "utf8"),
  ) as { scenarios: string[] };
  return {
    components: pick("components"),
    policies: pick("policies"),
    invariants: pick("invariants"),
    flows: pick("flows"),
    boundaries: pick("boundaries"),
    deployments: pick("deployments"),
    uiStates: pick("uiStates"),
    registry: registry.scenarios,
    mermaid: readFileSync(resolve(archDir, "generated", "pact-architecture.mmd"), "utf8"),
  };
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

function secretLeak(node: unknown, path: string): string | null {
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      const found = secretLeak(node[index], `${path}[${index}]`);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (typeof node === "object" && node !== null) {
    const record = node as Record<string, unknown>;
    if (Array.isArray(record["secrets"]) && record["secrets"].length > 0) {
      const deployment = (record["deployment"] as string | undefined) ?? "";
      if (deployment === "browser" || deployment === "public-edge") {
        return path;
      }
    }
    for (const [key, entry] of Object.entries(record)) {
      const found = secretLeak(entry, path === "" ? key : `${path}.${key}`);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

describe("AICD fixture", () => {
  it("loads seven fragments with unique IDs across every collection", () => {
    const merged = loadMerged();
    const ids: string[] = [];
    for (const collection of [
      merged.components,
      merged.policies,
      merged.invariants,
      merged.flows,
      merged.boundaries,
      merged.deployments,
      merged.uiStates,
    ]) {
      for (const node of collection) {
        expect(typeof node["id"]).toBe("string");
        ids.push(node["id"] as string);
      }
    }
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires authority, cannot, deployment, and evidence on every component", () => {
    const { components } = loadMerged();
    expect(components.length).toBeGreaterThan(0);
    for (const component of components) {
      for (const field of ["type", "authority", "cannot", "deployment", "evidence"]) {
        const value = component[field];
        const ok = Array.isArray(value) ? value.length > 0 : typeof value === "string";
        expect(ok, `${component["id"]}.${field}`).toBe(true);
      }
    }
  });

  it("resolves every flow hop to a declared component", () => {
    const { components, flows } = loadMerged();
    const ids = new Set(components.map((component) => component["id"] as string));
    expect(flows.length).toBeGreaterThan(0);
    for (const flow of flows) {
      expect(ids.has(flow["from"] as string), `flow ${flow["id"]}.from`).toBe(true);
      for (const hop of asStrings(flow["through"])) {
        expect(ids.has(hop), `flow ${flow["id"]}.through ${hop}`).toBe(true);
      }
    }
  });

  it("links every critical policy to an invariant and a scenario", () => {
    const { policies, invariants, registry } = loadMerged();
    const invariantIds = new Set(invariants.map((invariant) => invariant["id"] as string));
    const critical = policies.filter((policy) => policy["critical"] === true);
    expect(critical.length).toBeGreaterThan(0);
    for (const policy of critical) {
      expect(invariantIds.has(policy["invariant"] as string), `${policy["id"]}.invariant`).toBe(
        true,
      );
      const scenarios = asStrings(policy["scenarios"]);
      expect(scenarios.length, `${policy["id"]}.scenarios`).toBeGreaterThan(0);
      for (const scenario of scenarios) {
        expect(registry.includes(scenario), `${policy["id"]} scenario ${scenario}`).toBe(true);
      }
    }
  });

  it("gates every UI success state on a receipt and evidence", () => {
    const { uiStates, registry } = loadMerged();
    const success = uiStates.filter((state) => state["kind"] === "success");
    expect(success.length).toBeGreaterThan(0);
    for (const state of success) {
      expect(state["receiptGate"], `${state["id"]}.receiptGate`).toBe(true);
      const evidence = asStrings(state["evidence"]);
      expect(evidence.length, `${state["id"]}.evidence`).toBeGreaterThan(0);
      for (const scenario of evidence) {
        expect(registry.includes(scenario)).toBe(true);
      }
    }
  });

  it("attaches evidence to every real-data flow", () => {
    const { flows } = loadMerged();
    const real = flows.filter((flow) => flow["realData"] === true);
    expect(real.length).toBeGreaterThan(0);
    for (const flow of real) {
      expect(asStrings(flow["evidence"]).length, `${flow["id"]}.evidence`).toBeGreaterThan(0);
    }
  });

  it("keeps secrets out of browser and public-edge components, recursively", () => {
    const { components } = loadMerged();
    for (const component of components) {
      expect(secretLeak(component, component["id"] as string)).toBeNull();
    }
  });

  it("registers every referenced scenario ID", () => {
    const merged = loadMerged();
    const referenced = new Set<string>();
    for (const component of merged.components) {
      for (const scenario of asStrings(component["evidence"])) {
        referenced.add(scenario);
      }
    }
    for (const flow of merged.flows) {
      for (const scenario of asStrings(flow["evidence"])) {
        referenced.add(scenario);
      }
    }
    for (const invariant of merged.invariants) {
      for (const scenario of asStrings(invariant["provenBy"])) {
        referenced.add(scenario);
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    for (const scenario of referenced) {
      expect(merged.registry.includes(scenario), `registry ${scenario}`).toBe(true);
    }
  });

  it("keeps the generated diagram in parity with declared components", () => {
    const { components, mermaid } = loadMerged();
    for (const component of components) {
      expect(mermaid.includes(component["id"] as string), `diagram ${component["id"]}`).toBe(true);
    }
  });
});
