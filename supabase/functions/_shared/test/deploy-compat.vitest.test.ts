import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * G12a static deploy-compat scan (supplement C1–C4).
 *
 * SPEC-ONLY static assertions over source text: no network, no secrets, no
 * live calls. Each clause below is expected RED before compat EXECUTE and
 * GREEN after C1–C4. Test files (`*.test.ts`) are excluded from the scanned
 * graph because they assert on sources by text (Vitest/Node-only by design).
 *
 * Pin reading: `npm:ethers@6.17.0` / `npm:zod@3.25.76` must equal the root
 * `package.json` versions exactly. Bare npm specifiers are permitted ONLY
 * when the `supabase/functions/deno.json` import map pins them to an exact
 * `npm:` version (C1 acceptance: "unmapped bare imports" == zero).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const FUNCTIONS_DIR = join(ROOT, "supabase", "functions");
const DOMAIN_SRC = join(ROOT, "packages", "domain", "src");
const SLUGS = ["session", "ai-gateway", "agent-executor"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function graphFiles(): string[] {
  return [...walk(FUNCTIONS_DIR), ...walk(DOMAIN_SRC)];
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function loadMap(slug: string): Record<string, string> {
  const raw = read(join("supabase", "functions", slug, "deno.json"));
  const parsed = JSON.parse(raw) as { imports?: Record<string, string> };
  return parsed.imports ?? {};
}

function rootManifestVersions(): { ethers: string; zod: string } {
  const manifest = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
  return {
    ethers: manifest.dependencies?.["ethers"] ?? "",
    zod: manifest.dependencies?.["zod"] ?? "",
  };
}

const BARE_IMPORT = /from\s+["']([A-Za-z@][^"'/:]*[^"'/]*)["']/g;
const JS_SUFFIX_IMPORT = /from\s+["'](\.[^"']*\.js)["']/g;

describe("deploy-compat G12a (C1–C4)", () => {
  it("pins ethers/zod via supabase/functions/deno.json exactly equal to package.json", () => {
    const manifest = rootManifestVersions();
    for (const slug of SLUGS) {
      expect(existsSync(join(FUNCTIONS_DIR, slug, "deno.json")), `${slug}/deno.json must exist`).toBe(true);
      const map = loadMap(slug);
      expect(map).toEqual({
        ethers: `npm:ethers@${manifest.ethers}`,
        zod: `npm:zod@${manifest.zod}`,
      });
      expect(JSON.stringify(map)).not.toMatch(/esm\.sh|skypack|jsdelivr|unpkg|cdn\./i);
    }
    expect(read("package.json")).not.toMatch(/"openai"\s*:/);
  });

  it("leaves zero unmapped bare npm specifiers in the function bundle graph", () => {
    const unmapped: string[] = [];
    for (const slug of SLUGS) {
      const map = loadMap(slug);
      for (const file of graphFiles()) {
        const src = readFileSync(file, "utf8");
        for (const match of src.matchAll(BARE_IMPORT)) {
          const spec = match[1];
          if (spec === undefined) continue;
          if (spec.startsWith("node:") || spec.startsWith("npm:")) continue;
          const base = spec.split("/")[0] ?? spec;
          if (base === undefined || base === "") continue;
          const mapped = map[spec] ?? map[base];
          if (mapped === undefined || !mapped.startsWith("npm:")) {
            unmapped.push(`${slug}:${relative(ROOT, file)}:${spec}`);
          }
        }
      }
    }
    expect(unmapped, "every bare npm specifier must have an exact npm: map pin").toEqual([]);
  });

  it("uses explicit .ts relative imports in the graph (no .js suffixes)", () => {
    const offenders: string[] = [];
    for (const file of graphFiles()) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(JS_SUFFIX_IMPORT)) {
        offenders.push(`${relative(ROOT, file)}:${match[1] ?? ""}`);
      }
    }
    expect(offenders, "Deno cannot resolve .js→.ts; normalize to explicit .ts").toEqual([]);
  });

  it("provides a guarded Deno.serve entrypoint for every required slug", () => {
    for (const slug of SLUGS) {
      const entry = join(FUNCTIONS_DIR, slug, "index.ts");
      expect(existsSync(entry), `slug ${slug} must exist with index.ts`).toBe(true);
      const src = readFileSync(entry, "utf8");
      expect(src, `${slug}/index.ts must contain a guarded Deno.serve adapter`).toMatch(/Deno\.serve/);
      expect(src, `${slug}/index.ts serve block must be inert under Node/Vitest`).toMatch(
        /typeof Deno !== "undefined"/,
      );
    }
  });

  it("keeps the function runtime free of Node-only boundaries with explicit config deps", () => {
    for (const file of walk(FUNCTIONS_DIR)) {
      const src = readFileSync(file, "utf8");
      const rel = relative(ROOT, file);
      expect(src, `${rel} must not read config from disk at Edge runtime`).not.toMatch(/from\s+["']node:fs["']/);
      expect(src, `${rel} must not read process.env at Edge runtime`).not.toMatch(/process\.env/);
      expect(src, `${rel} must not use Buffer at Edge runtime`).not.toMatch(/\bBuffer\b/);
      const nodeImports = [...src.matchAll(/from\s+["'](node:[^"']+)["']/g)].map((m) => m[1] ?? "");
      for (const spec of nodeImports) {
        expect(spec, `${rel} allows only node:crypto`).toBe("node:crypto");
      }
    }
    const schemas = read(join("packages", "domain", "src", "schemas.ts"));
    const modelConfig = read(join("packages", "domain", "src", "model-config.ts"));
    expect(
      /parseOpenAIConfigJson/.test(schemas) || /parseModelConfigJson/.test(modelConfig),
      "pure-JSON config parse entries must exist for the Edge path",
    ).toBe(true);
    expect(schemas, "resolveOpenAIModel must accept an explicit envModel dep").toMatch(/envModel/);
  });

  it("pins the expected region constant in serve wiring (no SUPABASE_* custom secret)", () => {
    for (const slug of SLUGS) {
      const src = readFileSync(join(FUNCTIONS_DIR, slug, "index.ts"), "utf8");
      expect(src, `${slug} serve wiring must pin the expected region`).toMatch(/us-east-1/);
    }
  });
});
