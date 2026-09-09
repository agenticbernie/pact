#!/usr/bin/env node
// Pact secret scanner: fails when secret-shaped values appear anywhere they
// must not. Scans the repository tree (excluding tooling output and VCS data).
// Test fixtures with hashes/addresses are NOT flagged: private-key detection
// is anchored to key field names, and populated-secret detection requires a
// secret variable name with a non-empty value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(new URL(".", import.meta.url).pathname, "..");

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "coverage",
  "dist",
  "out",
  "cache",
  ".worktrees",
]);

const SKIP_EXTENSIONS = new Set([".lock", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2"]);
const MAX_FILE_BYTES = 1024 * 1024;

const SECRET_VAR_NAMES =
  "(?:API_KEY|PRIVATE_KEY|SECRET|TOKEN|SERVICE_ROLE_KEY|SIGNER_PRIVATE_KEY|RELAYER_PRIVATE_KEY)";

const RULES = [
  {
    id: "openai-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9-_]{20,}/,
    appliesTo: () => true,
  },
  {
    id: "jwt-like",
    pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
    appliesTo: () => true,
  },
  {
    id: "private-key-material",
    pattern: new RegExp(`(?:privateKey|PRIVATE_KEY)\\s*[:=]\\s*["']?0x[0-9a-fA-F]{64}["']?`),
    appliesTo: () => true,
  },
  {
    id: "populated-secret-field",
    pattern: /"(?:apiKey|privateKey|clientSecret|client_secret|password)"\s*:\s*"[^"]+"/,
    appliesTo: () => true,
  },
  {
    id: "populated-env-secret",
    pattern: new RegExp(`^\\s*[A-Z_]*${SECRET_VAR_NAMES}\\s*=\\s*\\S+`, "m"),
    appliesTo: (file) => basename(file).startsWith(".env") && basename(file) !== ".env.example",
  },
  {
    id: "example-must-stay-empty",
    pattern: new RegExp(`^\\s*[A-Z_]*${SECRET_VAR_NAMES}\\s*=\\s*\\S+`, "m"),
    appliesTo: (file) => basename(file) === ".env.example",
  },
];

const CREDENTIAL_FILENAMES = [/\.pem$/, /\.key$/, /^id_rsa/, /\.p12$/, /\.pfx$/];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        walk(full, files);
      }
    } else if (stat.isFile() && stat.size <= MAX_FILE_BYTES && !SKIP_EXTENSIONS.has(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

export function scanTree(target = root) {
  const findings = [];
  let scanned = 0;
  for (const file of walk(target)) {
    const rel = relative(root, file);
    for (const cred of CREDENTIAL_FILENAMES) {
      if (cred.test(basename(file))) {
        findings.push({ file: rel, line: 0, rule: "credential-file" });
      }
    }
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) {
      continue;
    }
    scanned += 1;
    const lines = text.split("\n");
    for (const rule of RULES) {
      if (!rule.appliesTo(rel)) {
        continue;
      }
      for (let index = 0; index < lines.length; index += 1) {
        if (rule.pattern.test(lines[index])) {
          findings.push({ file: rel, line: index + 1, rule: rule.id });
        }
      }
    }
  }
  return { scanned, findings };
}

const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  const { scanned, findings } = scanTree();
  process.stdout.write(`${JSON.stringify({ scanned, findings }, null, 2)}\n`);
  process.exitCode = findings.length > 0 ? 1 : 0;
}
