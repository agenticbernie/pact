import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const MIGRATION_PATH = new URL(
  "../migrations/202609190001_arc_lane.sql",
  import.meta.url,
);
const PRIOR_PATH = new URL(
  "../migrations/202609120001_persistence_contracts.sql",
  import.meta.url,
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("Arc lane migration structure (additive)", () => {
  it("uses the exact additive filename and preserves prior migrations", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(existsSync(PRIOR_PATH)).toBe(true);
    const sql = readMigration();
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toMatch(/202609080001_sessions_and_intents/);
    expect(sql).toMatch(/202609120001_persistence_contracts/);
  });

  it("adds chain_id to cards and intents with legacy backfill", () => {
    const sql = readMigration();
    expect(sql).toMatch(/alter table if exists cards/i);
    expect(sql).toMatch(/alter table if exists intents/i);
    expect(sql).toMatch(/add column if not exists chain_id bigint/i);
    expect(sql).toMatch(/set chain_id = 102031 where chain_id is null/i);
    expect(sql).toMatch(/alter column chain_id set not null/i);
  });

  it("enforces lane pairs for both CTC and Arc without a CTC-only check", () => {
    const sql = readMigration();
    expect(sql).toMatch(/cards_asset_lane_check/);
    expect(sql).toMatch(/intents_asset_lane_check/);
    expect(sql).toMatch(/chain_id = 102031 and asset = 'native-testnet-ctc'/);
    expect(sql).toMatch(/chain_id = 5042002 and asset = 'arc-testnet-usdc'/);
  });

  it("adds lane indexes and documents forward-only rollback", () => {
    const sql = readMigration();
    expect(sql).toMatch(/cards_chain_updated_idx/);
    expect(sql).toMatch(/intents_chain_created_idx/);
    expect(sql.toLowerCase()).toMatch(/forward-only/);
    expect(sql.toLowerCase()).toMatch(/invalid/);
    expect(sql.toLowerCase()).toMatch(/raise exception/);
  });

  it("contains no destructive SQL, RPC, or service-role dependency", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).not.toMatch(/\/rest\/v1\/rpc\//);
    expect(sql).not.toMatch(/SERVICE_ROLE/);
    expect(sql).not.toMatch(/service_role/);
  });
});
