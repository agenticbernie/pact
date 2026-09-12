import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const MIGRATION_PATH = new URL(
  "../migrations/202609120001_persistence_contracts.sql",
  import.meta.url,
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

const EXPECTED_POLICIES: Array<{
  name: string;
  table: string;
  op: string;
}> = [
  { name: "session_challenges_deny_public_select", table: "session_challenges", op: "SELECT" },
  { name: "session_challenges_deny_public_insert", table: "session_challenges", op: "INSERT" },
  { name: "session_challenges_deny_public_update", table: "session_challenges", op: "UPDATE" },
  { name: "session_challenges_deny_public_delete", table: "session_challenges", op: "DELETE" },
  { name: "sessions_deny_public_select", table: "sessions", op: "SELECT" },
  { name: "sessions_deny_public_insert", table: "sessions", op: "INSERT" },
  { name: "sessions_deny_public_update", table: "sessions", op: "UPDATE" },
  { name: "sessions_deny_public_delete", table: "sessions", op: "DELETE" },
  { name: "intents_deny_public_select", table: "intents", op: "SELECT" },
  { name: "intents_deny_public_insert", table: "intents", op: "INSERT" },
  { name: "intents_deny_public_update", table: "intents", op: "UPDATE" },
  { name: "intents_deny_public_delete", table: "intents", op: "DELETE" },
  { name: "cards_deny_public_select", table: "cards", op: "SELECT" },
  { name: "cards_deny_public_insert", table: "cards", op: "INSERT" },
  { name: "cards_deny_public_update", table: "cards", op: "UPDATE" },
  { name: "cards_deny_public_delete", table: "cards", op: "DELETE" },
];

describe("G20 RLS deny matrix (Option A, 16 policies)", () => {
  it("migration exists and enables RLS on all four tables", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    const sql = readMigration();
    for (const table of ["session_challenges", "sessions", "intents", "cards"]) {
      expect(sql.toLowerCase()).toMatch(
        new RegExp(`alter table[^;]*${table}[^;]*enable row level security`, "i"),
      );
    }
  });

  it("declares all 16 deny-only policies by exact name", () => {
    const sql = readMigration();
    for (const policy of EXPECTED_POLICIES) {
      expect(
        sql.includes(policy.name),
        `missing policy ${policy.name}`,
      ).toBe(true);
    }
    // Fail-closed: exactly 16 CREATE deny policies, no allow policies.
    const createDenyCount = (sql.match(/create policy \w+_deny_public_/gi) ?? []).length;
    expect(createDenyCount).toBe(16);
    expect(sql).not.toMatch(/_allow_public_/);
  });

  it("binds each policy to the exact table, operation, and public role", () => {
    const sql = readMigration();
    for (const policy of EXPECTED_POLICIES) {
      const marker = `create policy ${policy.name}`;
      const idx = sql.toLowerCase().indexOf(marker);
      expect(idx, `missing create for ${policy.name}`).toBeGreaterThanOrEqual(0);
      const window = sql.slice(idx, idx + 600);
      expect(window.toLowerCase()).toContain(`on ${policy.table}`);
      expect(window.toLowerCase()).toContain(`for ${policy.op.toLowerCase()}`);
      expect(window.toLowerCase()).toContain("to public");
    }
  });

  it("denies with USING (false) / WITH CHECK (false) and no public allow", () => {
    const sql = readMigration();
    expect(sql).toMatch(/USING\s*\(\s*false\s*\)/i);
    expect(sql).toMatch(/WITH CHECK\s*\(\s*false\s*\)/i);
    // No permissive public policy.
    expect(sql).not.toMatch(/TO public[^;]*USING\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/TO public[^;]*WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("contains no RPC, SECURITY DEFINER/INVOKER, or service-role default", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).not.toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/\/rest\/v1\/rpc\//);
    expect(sql).not.toMatch(/SERVICE_ROLE/);
    expect(sql).not.toMatch(/service_role/);
  });

  it("browser inputs cannot select or mutate authority rows", () => {
    const sql = readMigration().toLowerCase();
    // All four tables have SELECT/INSERT/UPDATE/DELETE deny coverage.
    for (const table of ["session_challenges", "sessions", "intents", "cards"]) {
      for (const op of ["select", "insert", "update", "delete"]) {
        expect(
          sql.includes(`${table}_deny_public_${op}`),
          `missing deny for ${table} ${op}`,
        ).toBe(true);
      }
    }
  });
});
