# Neon Baseline Applied Evidence (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Target (verified live):
database `pact`, PostgreSQL `17.11`, empty public schema at preflight.
Scope: apply EXACTLY `neon/migrations/0001_neon_baseline.sql` once
(S1→S2→S3 consolidated DDL). No seed/data copy, no business-row DML, no
Function work, no Data API provisioning, no OpenAI/H-lanes, no secret
changes, no commit/push. Connection via the provisioned `NEON_DATABASE_URL`
(names only; value never printed, logged, or persisted). No retry was
needed or issued.

## 1. Result

**APPLIED (once, single transaction, committed).** Credential path: temp
`pg` driver install under `/tmp` (outside the repo; repo manifests and
lockfile untouched), SSL as provisioned in the URL. Apply wrapped in
`BEGIN … COMMIT` (all-or-nothing; any failure would have rolled back and
stopped the lane with no retry).

## 2. Preflight (all green before apply)

- `current_database()` = `pact`; server `PostgreSQL 17.11` (matches the
  PG17 review basis).
- Public base tables: none (empty database as stated).
- Migration file re-verified: byte-verbatim S1+S2+S3 sections (extraction
  diff in the prior lane), no seed/DML beyond reviewed backfill guards.

## 3. Post-apply verification (read-only SELECTs only)

- Tables: `cards`, `intents`, `payment_attempts`, `session_challenges`,
  `sessions` — all 5 present, nothing else created.
- Columns: `chain_id` NOT NULL on `cards` + `intents`.
- Constraints: `cards_asset_lane_check` + `intents_asset_lane_check`
  present with the exact lane-pair definitions; legacy CTC-only shape gone.
- Indexes: `cards_chain_updated_idx` + `intents_chain_created_idx`.
- RLS: 16 deny policies across the 4 tables (unchanged semantics).
- Counts: `0/0/0/0/0` — no seed, no data copy, no business rows.

## 4. Mutations performed (exhaustive)

One single-transaction DDL apply. Nothing else. No DML of any kind.
Baseline status is now **APPLIED** on the Neon branch database; the
`BASELINE CREATED, NOT APPLIED` file header remains historical plan text
(the file itself is unchanged by applying it).

## 5. Next (separate approvals)

Any seed, adapter wiring, Function work, Data API provisioning, or lane
use on Neon. None granted here.
