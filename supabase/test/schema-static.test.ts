import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const MIGRATION_PATH = new URL(
  "../migrations/202609120001_persistence_contracts.sql",
  import.meta.url,
);
const EXISTING_PATH = new URL(
  "../migrations/202609080001_sessions_and_intents.sql",
  import.meta.url,
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}

describe("G19 migration structure (Option A)", () => {
  it("uses the exact additive filename and preserves the existing migration", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(existsSync(EXISTING_PATH)).toBe(true);
    const sql = readMigration();
    expect(sql.length).toBeGreaterThan(0);
    // Additive: must reference the prior migration without editing it.
    expect(sql).toMatch(/202609080001_sessions_and_intents/);
  });

  it("declares session_challenges, sessions, intents, and cards tables", () => {
    const sql = readMigration().toLowerCase();
    expect(sql).toMatch(/session_challenges/);
    expect(sql).toMatch(/sessions/);
    expect(sql).toMatch(/intents/);
    expect(sql).toMatch(/create table if not exists cards/);
    // payment_attempts remains governed by the original contract (referenced, not redefined destructively).
    expect(sql).toMatch(/payment_attempts/);
  });

  it("adds exact session_challenges persistence columns", () => {
    const sql = readMigration();
    expect(sql).toMatch(/message/);
    expect(sql).toMatch(/issued_at/);
    expect(sql).toMatch(/revoked_at/);
    expect(sql).toMatch(/nonce_hash/);
    expect(sql).toMatch(/wallet_address/);
    expect(sql).toMatch(/expires_at/);
    expect(sql).toMatch(/consumed_at/);
    expect(sql).toMatch(/created_at/);
  });

  it("adds intents agent_id and idempotency_key as text NOT NULL without UUID", () => {
    const sql = readMigration();
    expect(sql).toMatch(/agent_id/);
    expect(sql).toMatch(/idempotency_key/);
    expect(sql).toMatch(/text not null/i);
    expect(sql.toLowerCase()).not.toMatch(/uuid/);
  });

  it("creates cards with card_id text PRIMARY KEY as the sole primary key", () => {
    const sql = readMigration();
    expect(sql).toMatch(/card_id text not null primary key/i);
    // No composite primary key on (controller_address, card_id).
    expect(sql).not.toMatch(
      /primary key\s*\(\s*controller_address\s*,\s*card_id\s*\)/i,
    );
    expect(sql).toMatch(/controller_address/);
    expect(sql).toMatch(/owner_address/);
    expect(sql).toMatch(/owner_configured_cap/);
    expect(sql).toMatch(/per_transaction_limit/);
    expect(sql).toMatch(/verified_credit/);
    expect(sql).toMatch(/verified_credit_expires_at/);
    expect(sql).toMatch(/spent/);
    expect(sql).toMatch(/expires_at/);
    expect(sql).toMatch(/policy_version/);
    expect(sql).toMatch(/allowlist_hash/);
    expect(sql).toMatch(/source_block/);
    expect(sql).toMatch(/source_tx_hash/);
    expect(sql).toMatch(/created_at/);
    expect(sql).toMatch(/updated_at/);
  });

  it("uses exact PostgreSQL types and uppercase card statuses", () => {
    const sql = readMigration();
    expect(sql).toMatch(/numeric\(78,0\)/);
    expect(sql).toMatch(/bigint/);
    expect(sql).toMatch(/timestamptz/);
    expect(sql).toMatch(/integer/);
    expect(sql).toMatch(/'ISSUED'/);
    expect(sql).toMatch(/'ACTIVE'/);
    expect(sql).toMatch(/'SUSPENDED'/);
    expect(sql).toMatch(/'CLOSED'/);
    // No lowercase statuses as valid DB values.
    expect(sql).not.toContain("('issued'");
    expect(sql).not.toContain("'active'");
    expect(sql).not.toContain("'suspended'");
    expect(sql).not.toContain("'closed'");
  });

  it("declares the partial unique active-assignment index without now() predicate", () => {
    const sql = readMigration();
    expect(sql).toMatch(/cards_agent_active_uidx/);
    expect(sql).toMatch(/on cards\s*\(\s*agent_id\s*\)/i);
    expect(sql).toMatch(/where status = 'ACTIVE'/);
    expect(sql).not.toMatch(/where.*now\(\)/i);
  });

  it("declares all required indexes and the intents card FK", () => {
    const sql = readMigration();
    expect(sql).toMatch(/session_challenges_wallet_issued_idx/);
    expect(sql).toMatch(/session_challenges_expiry_idx/);
    expect(sql).toMatch(/cards_owner_updated_idx/);
    expect(sql).toMatch(/cards_agent_updated_idx/);
    expect(sql).toMatch(/cards_status_expiry_idx/);
    expect(sql).toMatch(/cards_controller_block_idx/);
    expect(sql).toMatch(
      /foreign key\s*\(\s*card_id\s*\)\s*references cards\s*\(\s*card_id\s*\)/i,
    );
    // intents agent/card/status lookups
    expect(sql.toLowerCase()).toMatch(/on intents/);
    expect(sql).toMatch(/intent_hash/);
  });

  it("declares address, uint, status, time, and hash checks", () => {
    const sql = readMigration();
    expect(sql).toMatch(/\^0x\[0-9a-f\]\{40\}\$/);
    expect(sql).toMatch(/\^\[0-9a-f\]\{64\}\$/);
    expect(sql).toMatch(/expires_at > issued_at/i);
    expect(sql).toMatch(/expires_at > created_at/i);
    expect(sql).toMatch(/policy_version >= 0/i);
    expect(sql).toMatch(/source_block >= 0/i);
    expect(sql).toMatch(/asset = 'native-testnet-ctc'/);
  });

  it("contains no is_active_assignment, RPC, or destructive SQL", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/is_active_assignment/);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).not.toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/\/rest\/v1\/rpc\//);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it("has no service-role dependency and documents fail-closed backfill", () => {
    const sql = readMigration();
    expect(sql).not.toMatch(/SERVICE_ROLE/);
    expect(sql).not.toMatch(/service_role/);
    // Fail-closed invalid-row handling must be explicit.
    expect(sql.toLowerCase()).toMatch(/invalid/);
    expect(sql.toLowerCase()).toMatch(/raise exception/);
  });
});
