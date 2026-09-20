# Neon Baseline Schema Review (2026-09-19)

Status: **BASELINE CREATED, NOT APPLIED.** Target (documented context):
Neon project `polished-dream-04296130`, branch `main`, `aws-us-east-1`,
PostgreSQL 17, empty database. No Neon deploy, apply, link, secret, or
lane was executed or authorized here. No Supabase source migration was
modified. No business row seeded; no Supabase data copied.

## 1. Migration order

`neon/migrations/0001_neon_baseline.sql` replays, in order, byte-verbatim
sections (proven by extraction diff in evidence):
- S1 `supabase/migrations/202609080001_sessions_and_intents.sql`
  (`sha256:5abb…dd2d`) — `session_challenges`, `sessions`, `intents`,
  `payment_attempts` + C-SESSION/C-DDL pins.
- S2 `supabase/migrations/202609120001_persistence_contracts.sql`
  (`sha256:16c5…e086`) — `cards` cache, intent/card columns, checks,
  indexes, FK, RLS deny matrix.
- S3 `supabase/migrations/202609190001_arc_lane.sql`
  (`sha256:43f0…81046e`) — `chain_id` lane columns, lane-pair CHECKs,
  lane indexes. Runs only after cards/intents exist (section order).

## 2. Tables / constraints / indexes

- 5 tables, all `IF NOT EXISTS`: session/sessions/intents/payment_attempts
  (S1 shapes) + cards (numeric-text PK, 0x address checks, 78-digit
  numerics, status enum, policy/block/hash fields).
- Lane-pair CHECKs (S3 replaces S1/S2 CTC-only shape inside the new
  section): `(102031,'native-testnet-ctc')` OR
  `(5042002,'arc-testnet-usdc')` on cards + intents; SHA-256 64-hex,
  0x-address/tx, TTL/expiry, and idempotency predicates preserved.
- FK `intents.card_id → cards.card_id`; unique `intent_hash` /
  `idempotency_key`; `payment_attempts` first-claim/row-lock/store-before-
  wait/reconcile/no-resubmit/settled-only-status-1 invariants preserved
  (identical SQL).
- Indexes incl. `cards_chain_updated_idx`, `intents_chain_created_idx`.

## 3. Arc/legacy lane semantics

Identical to Supabase: legacy pair stays valid (history preserved),
Arc pair admitted, anything else fails closed at INSERT/UPDATE.
`NATIVE_ASSET`/canonical-hash behavior unchanged (no contract change).

## 4. RLS compatibility assessment

16 deny-public policies (4 tables × select/insert/update/delete) are
plain Postgres — identical on Neon. Neon Data API callers map to DB
roles/JWT; deny-to-public holds regardless of role. Server-side access
requires a privileged Neon connection (owner/app role); Neon has no
`service_role` — never invented here, and no secret/role value appears
in the baseline. HMAC wallet sessions unchanged (no Better Auth).

## 5. Neon-specific assumptions (explicit, unverified)

Empty target database (backfill/validation DO blocks no-op); PG17
semantics for `to_regclass`/`pg_constraint` guards, `DROP CONSTRAINT IF
EXISTS`, `CREATE POLICY … TO public`, guarded `ADD CONSTRAINT`
(no `ADD IF NOT EXISTS` in core Postgres — DO blocks preserved);
no extensions required (none used); Data API PostgREST-compatibility for
existing `*-store.ts` adapters (base URL + auth headers only).

## 6. Rollback forward-only

Per-file convention (same as sources): disable dependent composition,
preserve rows for forensics, compensating migration after an explicit
data-retention decision. Never rewrite the baseline after apply.

## 7. Verification (this lane)

New `neon/test/baseline-static.test.ts` (5/5 GREEN): file exists with
pinned source checksums, S1→S2→S3 order, 5 tables + lane checks/indexes,
RLS/Neon docs, no-seed/no-destructive/no-extension/no-secret guards.
Full `vitest run`, `typecheck`, `lint`, `validate:aicd`, secret scan,
`git diff --check` — see final report. `vitest.config.ts` gains the
`neon/test` glob (one string, additive). Neon README status bullet
updated to reflect real DDL (minimal, reported).
