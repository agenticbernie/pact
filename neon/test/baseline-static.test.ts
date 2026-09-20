import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const BASELINE_PATH = new URL("../migrations/0001_neon_baseline.sql", import.meta.url);

const SOURCES: Array<{ path: string; sha256: string }> = [
  {
    path: new URL(
      "../../supabase/migrations/202609080001_sessions_and_intents.sql",
      import.meta.url,
    ).pathname,
    sha256:
      "5abb6100d5d0b3624864d1d00652446003f856945aa599b7f9664b01dd2d24fb",
  },
  {
    path: new URL(
      "../../supabase/migrations/202609120001_persistence_contracts.sql",
      import.meta.url,
    ).pathname,
    sha256:
      "16c5c6fdd4b2385357100d2f3e8ad68faffb2351657a8ba938b69a5be1f0e086",
  },
  {
    path: new URL(
      "../../supabase/migrations/202609190001_arc_lane.sql",
      import.meta.url,
    ).pathname,
    sha256:
      "43f0f862498eb5ae08032bf12578a39257f924ac76721007bcf2f24f81046e91",
  },
];

function readBaseline(): string {
  return readFileSync(BASELINE_PATH, "utf8");
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("Neon baseline migration (consolidated replay 1-2-3)", () => {
  it("exists, is not the skeleton, and pins all three source checksums", () => {
    expect(existsSync(BASELINE_PATH)).toBe(true);
    const sql = readBaseline();
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).not.toMatch(/^SELECT 1;\s*$/m);
    expect(sql).toMatch(/BASELINE CREATED, NOT APPLIED/);
    for (const source of SOURCES) {
      expect(sha256Of(source.path)).toBe(source.sha256);
      expect(sql).toContain(source.sha256);
    }
  });

  it("replays sections in order S1 -> S2 -> S3", () => {
    const sql = readBaseline();
    const s1 = sql.indexOf("==================== S1");
    const s2 = sql.indexOf("==================== S2");
    const s3 = sql.indexOf("==================== S3");
    expect(s1).toBeGreaterThan(-1);
    expect(s2).toBeGreaterThan(s1);
    expect(s3).toBeGreaterThan(s2);
  });

  it("declares all five tables with lane-pair checks and lane indexes", () => {
    const sql = readBaseline();
    for (const table of ["session_challenges", "sessions", "intents", "payment_attempts", "cards"]) {
      expect(sql).toContain(table);
    }
    expect(sql).toMatch(/create table if not exists cards/);
    expect(sql).toMatch(/cards_asset_lane_check/);
    expect(sql).toMatch(/intents_asset_lane_check/);
    expect(sql).toMatch(/chain_id = 102031 and asset = 'native-testnet-ctc'/);
    expect(sql).toMatch(/chain_id = 5042002 and asset = 'arc-testnet-usdc'/);
    expect(sql).toMatch(/cards_chain_updated_idx/);
    expect(sql).toMatch(/intents_chain_created_idx/);
    expect(sql).toMatch(/payment_attempts/);
  });

  it("keeps RLS deny policies and documents Neon compatibility", () => {
    const sql = readBaseline().toLowerCase();
    expect(sql).toMatch(/row level security/);
    expect(sql).toMatch(/deny/);
    expect(sql).toMatch(/neon data api/);
    expect(sql).toMatch(/bypass-row-security/);
    expect(sql).toMatch(/never invent one/);
    expect(sql).toMatch(/forward-only/);
  });

  it("contains no seed, destructive SQL, extensions, or secrets", () => {
    const sql = readBaseline();
    expect(sql).not.toMatch(/^\s*insert into\s+(cards|intents|sessions|session_challenges|payment_attempts)/im);
    expect(sql).not.toMatch(/^\s*drop\s+table/im);
    expect(sql).not.toMatch(/^\s*truncate/im);
    expect(sql).not.toMatch(/^\s*drop\s+column/im);
    expect(sql).not.toMatch(/^\s*delete\s+from/im);
    expect(sql).not.toMatch(/SECURITY DEFINER/);
    expect(sql).not.toMatch(/CREATE EXTENSION/i);
    expect(sql).not.toMatch(/service_role/i);
    expect(sql).not.toMatch(/OPENAI_API_KEY|SESSION_HMAC_SECRET\s*=/);
  });
});
