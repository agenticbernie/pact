# Arc Lane Migration Applied — Staging Evidence (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: apply exactly
`supabase/migrations/202609190001_arc_lane.sql` once on the approved
staging project. No business-row seed, no Function deploy, no OpenAI call,
no H-lane run, no G13, no card/credit/payment/broadcast, no Neon, no
contract/source edit, no commit/push. No credential or secret value was
printed, logged, or persisted (names and shapes only).

## 1. Result

**Migration APPLIED (exactly once).** Project ref `myotkovmgzdabuirkqlx`
("pact"). Credential: the machine's prior CLI link session for the
approved ref (pooler link state provisioned via CLI; no token, password,
or key handled in this lane). Signer/private key absent throughout.

## 2. Preflight (all green before apply)

- Project binding: linked-project ref, `SUPABASE_URL` substring, and anon
  JWT `ref` claim all equal the approved ref. Dry-run explicitly scoped
  `--project-ref myotkovmgzdabuirkqlx`.
- File integrity: `202609190001_arc_lane.sql` re-read in full (106 lines);
  sha256 `43f0f862498eb5ae08032bf12578a39257f924ac76721007bcf2f24f81046e91`;
  content matches the reviewed additive design (lane-pair CHECKs, legacy
  backfill, fail-closed validation, forward-only rollback notes; no DROP
  TABLE/COLUMN/TRUNCATE/DELETE, no RPC, no service-role, no seed).
- Pending set (dry-run): exactly `202609190001_arc_lane.sql` and nothing
  else — corroborating the historical record that `202609080001` and
  `202609120001` were already applied.
- Row counts before (anon exact-count): cards `*/0`, intents `*/0`.

## 3. Apply record

`supabase db push --linked --project-ref myotkovmgzdabuirkqlx` (single
invocation): `Applying migration 202609190001_arc_lane.sql... Finished`,
exit 0. Post-apply dry-run rerun: `Remote database is up to date`
(exactly-once proof; nothing pending, nothing double-applied).

## 4. Schema verification (read-only `db query`)

- Columns: `cards.chain_id` bigint NOT NULL ✓ ·
  `intents.chain_id` bigint NOT NULL ✓.
- Constraints: `cards_asset_lane_check` and `intents_asset_lane_check`
  present with the exact lane-pair definitions
  (`(102031,'native-testnet-ctc')` OR `(5042002,'arc-testnet-usdc')`) ✓ ·
  legacy `cards_asset_check` absent ✓.
- Indexes: `cards_chain_updated_idx`, `intents_chain_created_idx` ✓.
- RLS: all 16 deny-public policies intact across `cards`, `intents`,
  `sessions`, `session_challenges` (migration touches none) ✓.
- Migration history: `202609080001`, `202609120001`, `202609190001` all
  recorded applied, one row each ✓.

## 5. Row counts and mutation accounting

After apply: cards `0`, intents `0`, payment_attempts `0` (no business
rows created, updated, or deleted — backfill `UPDATE … WHERE chain_id IS
NULL` matched zero rows). Pre-existing lane artifacts untouched in count:
sessions `4`, session_challenges `16` (origin: prior approved lanes; this
lane created none). Per the migration's reviewed design, the 16 challenge
rows now carry `message` + `issued_at` (16/16 non-null, 0 invalid — the
push succeeded, so the fail-closed validation passed); `revoked_at`
nullable as designed. No row content beyond those additive columns was
altered; no rollback was executed (documented forward-only per file).

## 6. Security and evidence

Local gates unaffected by this lane (no source changed): secret scan
`1118` scanned / `0` findings at evidence time; `git diff --check` clean.
Commands issued: `db push --dry-run`, `db push` (once), `migration list`,
six read-only `db query` SELECTs, anon count GETs. No DDL beyond the
approved file, no DML beyond its reviewed backfill/validation, no
`db reset/push/pull`, no Function deployment, no provider/RPC mutation.

## 7. Next approvals (unchanged order)

Seed approval (bounded two-row card-1/intent-req-1 lane) → G13 redeploy →
fresh H1–H3. None granted here; H1/H2 remain BLOCKED, H3 PARTIAL, G22
DRIFT (pre-existing drift record stands; this migration does not claim
parity), Phase 04 COMPLETE_WITH_GAPS.
