-- Neon baseline migration (REAL DDL, consolidated replay 1 → 2 → 3).
--
-- Target (documented context, NOT live facts): Neon project
-- polished-dream-04296130, branch main, aws-us-east-1, PostgreSQL 17,
-- empty database. Status: BASELINE CREATED, NOT APPLIED. Apply only under
-- a separately approved lane; never alongside unreviewed edits.
--
-- Source files (byte-verbatim sections below; originals untouched):
--   S1 supabase/migrations/202609080001_sessions_and_intents.sql
--      sha256 5abb6100d5d0b3624864d1d00652446003f856945aa599b7f9664b01dd2d24fb
--   S2 supabase/migrations/202609120001_persistence_contracts.sql
--      sha256 16c5c6fdd4b2385357100d2f3e8ad68faffb2351657a8ba938b69a5be1f0e086
--   S3 supabase/migrations/202609190001_arc_lane.sql
--      sha256 43f0f862498eb5ae08032bf12578a39257f924ac76721007bcf2f24f81046e91
--
-- Replay order (mirrors Supabase history; S3 requires cards/intents from
-- S1+S2 — enforced by section order, not by runtime checks):
--   S1: session_challenges, sessions, intents, payment_attempts (+ C-SESSION/C-DDL pins)
--   S2: cards cache, intent/card columns, lane-agnostic checks, RLS deny matrix
--   S3: chain_id lane columns, Arc/legacy lane-pair CHECKs, lane indexes
--
-- PostgreSQL 17 review (static; no live branch touched):
--   - to_regclass / pg_constraint guards: supported, unchanged semantics.
--   - DROP CONSTRAINT IF EXISTS / ADD via guarded DO blocks (no ADD IF NOT
--     EXISTS in core Postgres): preserved verbatim.
--   - CREATE POLICY ... TO public (PG15+ syntax incl. PG17): preserved.
--   - No extensions, no elevated function security attributes, no RPC,
--     COLUMN/TRUNCATE/DELETE, no service-role or secret values anywhere.
--   - RLS deny-public policies are plain Postgres: identical semantics on
--     Neon. Neon Data API callers map to DB roles/JWT; deny-to-public holds
--     regardless of JWT role. Server-side access must use a privileged
--     Neon connection (owner/app role with bypass-row-security or equivalent) —
--     Neon has no such superuser equivalent for app code; never invent one.
--   - Neon Data API is PostgREST-compatible: existing *-store.ts adapters
--     change base URL + auth headers only; queries unchanged. JWT model:
--     HMAC wallet sessions kept (no Managed Better Auth in MVP).
--
-- Rollback: forward-only and additive (same convention as the sources).
-- Disable the dependent composition root, preserve rows for forensics, and
-- apply a separately reviewed compensating migration after an explicit
-- data-retention decision. Never rewrite this baseline after apply; later
-- changes are new dated files.
--
-- Post-apply verification (read-only; run before any lane use):
--   select table_name from information_schema.tables where table_schema='public'
--     and table_name in ('session_challenges','sessions','intents','payment_attempts','cards');
--   select conname from pg_constraint where connamespace='public'::regnamespace
--     and conname in ('cards_asset_lane_check','intents_asset_lane_check');
--   select indexname from pg_indexes where schemaname='public'
--     and indexname in ('cards_chain_updated_idx','intents_chain_created_idx');
--   select tablename, count(*) from pg_policies where schemaname='public'
--     group by tablename; -- expect 16 deny rows across the 4 tables
--   select count(*) from cards; select count(*) from intents; -- expect 0 (no seed here)

-- ==================== S1 — sessions and intents foundation ====================
-- Source: supabase/migrations/202609080001_sessions_and_intents.sql (verbatim; see sha256 in header).
-- Phase 04 migration: wallet session, intents, idempotent payment attempts.
--
-- C-SESSION pins (verbatim):
-- - challenge TTL 5 min (expires_at now()+5min)
-- - session TTL 30 min (HMAC exp, expires_at now()+30min)
-- - sha256-hex-only nonce_hash/token_hash TEXT CHECK 64-hex + indexes
-- - NO plaintext columns (no token / signature / bearer plaintext storage)
-- - atomic UPDATE ... WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING
--   (second verify -> AUTH_INVALID, no session)
-- - function-only SESSION_HMAC_SECRET with versioned rotation
--   (verify-accept-old-for-one-session-TTL overlap then destroy; rotation
--   statement reserved for report). The secret lives only in Supabase secrets,
--   never in this migration, never bundled to edge/browser.
--
-- C-DDL pins (verbatim):
-- - payment_attempts(intent_id TEXT, idempotency_key TEXT, status TEXT,
--   tx_hash TEXT, card_nonce TEXT NOT NULL, timestamps)
--   PRIMARY KEY(intent_id,idempotency_key) UNIQUE(idempotency_key)
--   + tx_hash index
-- - first-claim INSERT ... ON CONFLICT DO NOTHING + SELECT ... FOR UPDATE
-- - store-txHash-before-wait ordering
-- - findByNonce+receipt reconcile; never second-submit
-- - settled only on receipt.status==1 (never-settled-on-uncertain)

create table if not exists session_challenges (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text not null,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists session_challenges_nonce_hash_idx on session_challenges (nonce_hash);
create index if not exists session_challenges_wallet_idx on session_challenges (wallet_address);

create table if not exists sessions (
  id text primary key,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text not null,
  role text not null default 'user',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sessions_token_hash_idx on sessions (token_hash);
create index if not exists sessions_wallet_idx on sessions (wallet_address);

-- Canonical one-time consume (atomic; second verify -> AUTH_INVALID):
--   UPDATE session_challenges SET consumed_at = now()
--   WHERE nonce_hash = $1 AND consumed_at IS NULL
--   RETURNING nonce_hash, wallet_address, expires_at;

create table if not exists intents (
  intent_id text primary key,
  card_id text not null,
  merchant_id text not null,
  amount_base_units text not null,
  asset text not null default 'native-testnet-ctc',
  purpose text not null,
  confidence double precision not null,
  provider text not null default 'openai',
  model text not null default 'gpt-5.6-luna',
  policy_version integer not null,
  intent_hash text not null,
  status text not null default 'ready',
  request_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists payment_attempts (
  intent_id text not null,
  idempotency_key text not null,
  status text not null,
  tx_hash text,
  card_nonce text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (intent_id, idempotency_key),
  unique (idempotency_key)
);

create index if not exists payment_attempts_tx_hash_idx on payment_attempts (tx_hash);

-- Canonical first-claim (idempotent lock ordering):
--   INSERT INTO payment_attempts(intent_id, idempotency_key, status, card_nonce)
--   VALUES ($1, $2, 'pending', $3) ON CONFLICT DO NOTHING RETURNING *;
--   SELECT * FROM payment_attempts
--   WHERE intent_id = $1 AND idempotency_key = $2 FOR UPDATE;
-- Ordering invariant: UPDATE payment_attempts SET tx_hash=$1, status='broadcast'
-- BEFORE waitForReceipt (store-txHash-before-wait).
-- Reconcile policy: on timeout call findByNonce(cardId, nonce) + receipt lookup
-- by stored txHash before any retry; unproven outcome ->
-- PAYMENT_RECONCILIATION_REQUIRED, never a second submit.

-- ==================== S2 — persistence contracts (cards cache, RLS deny matrix) ====================
-- Source: supabase/migrations/202609120001_persistence_contracts.sql (verbatim; see sha256 in header).
-- Option A persistence contracts (G18-G21): additive only.
-- Extends 202609080001_sessions_and_intents without editing that file.
-- Existing tables session_challenges, sessions, intents, payment_attempts
-- remain governed by the original contract; this file only adds columns,
-- the cards cache table, checks, indexes, foreign keys, RLS deny policies,
-- and fail-closed backfill validation. No remote parity is claimed.
-- payment_attempts is unchanged and remains executor-owned.

-- 1. session_challenges: add canonical challenge content and lifecycle columns.
alter table if exists session_challenges
  add column if not exists message text,
  add column if not exists issued_at timestamptz,
  add column if not exists revoked_at timestamptz;

-- Backfill issued_at from created_at only for internally generated rows that
-- already carry a message. Rows with no recoverable message are invalid and
-- block promotion; they are never fabricated.
do $$
declare
  invalid_challenges integer;
begin
  update session_challenges
    set issued_at = created_at
    where issued_at is null and message is not null;
  select count(*) into invalid_challenges
    from session_challenges
    where message is null or issued_at is null;
  if invalid_challenges > 0 then
    raise exception 'invalid legacy session_challenges rows: % must be quarantined before promotion', invalid_challenges;
  end if;
end $$;

-- Session challenge checks and lookups (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
do $$
begin
  if to_regclass('public.session_challenges') is not null
     and not exists (select 1 from pg_constraint where conname = 'session_challenges_nonce_hash_hex') then
    alter table session_challenges
      add constraint session_challenges_nonce_hash_hex
      check (nonce_hash ~ '^[0-9a-f]{64}$');
  end if;
  if to_regclass('public.session_challenges') is not null
     and not exists (select 1 from pg_constraint where conname = 'session_challenges_wallet_address_fmt') then
    alter table session_challenges
      add constraint session_challenges_wallet_address_fmt
      check (wallet_address ~ '^0x[0-9a-f]{40}$');
  end if;
  if to_regclass('public.session_challenges') is not null
     and not exists (select 1 from pg_constraint where conname = 'session_challenges_expiry_after_issue') then
    alter table session_challenges
      add constraint session_challenges_expiry_after_issue
      check (expires_at > issued_at);
  end if;
end $$;

create index if not exists session_challenges_wallet_issued_idx
  on session_challenges (wallet_address, issued_at desc);
create index if not exists session_challenges_expiry_idx
  on session_challenges (expires_at)
  where consumed_at is null and revoked_at is null;

-- Tighten required challenge columns only after validation above.
alter table if exists session_challenges
  alter column message set not null,
  alter column issued_at set not null;

-- 2. intents: add server-bound agent ownership and idempotency key.
alter table if exists intents
  add column if not exists agent_id text,
  add column if not exists idempotency_key text;

-- 3. cards cache table (off-chain lookup only; controller remains authority).
create table if not exists cards (
  card_id text not null primary key check (card_id ~ '^(0|[1-9][0-9]*)$'),
  controller_address text not null check (controller_address ~ '^0x[0-9a-f]{40}$'),
  owner_address text not null check (owner_address ~ '^0x[0-9a-f]{40}$'),
  agent_id text not null check (agent_id ~ '^0x[0-9a-f]{40}$'),
  asset text not null check (asset = 'native-testnet-ctc'),
  status text not null check (status in ('ISSUED','ACTIVE','SUSPENDED','CLOSED')),
  owner_configured_cap numeric(78,0) not null check (owner_configured_cap >= 0),
  per_transaction_limit numeric(78,0) not null check (per_transaction_limit >= 0),
  verified_credit numeric(78,0) not null default 0 check (verified_credit >= 0),
  verified_credit_expires_at timestamptz,
  spent numeric(78,0) not null default 0 check (spent >= 0),
  expires_at timestamptz not null,
  policy_version integer not null check (policy_version >= 0),
  allowlist_hash text not null,
  source_block bigint not null check (source_block >= 0),
  source_tx_hash text not null check (source_tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- Backfill validation against the authoritative card source. Rows with no
-- card, invalid agent, or agent mismatch are invalid and block promotion.
-- Cards is created above, so this reference is safe.
do $$
declare
  invalid_intents integer;
begin
  select count(*) into invalid_intents
    from intents i
    left join cards c on c.card_id = i.card_id
    where i.agent_id is null
      or c.card_id is null
      or lower(i.agent_id) <> lower(c.agent_id);
  if invalid_intents > 0 then
    raise exception 'invalid legacy intents rows: % must be quarantined before promotion', invalid_intents;
  end if;
end $$;

-- Card intent ownership link (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
do $$
begin
  if to_regclass('public.intents') is not null
     and to_regclass('public.cards') is not null
     and not exists (select 1 from pg_constraint where conname = 'intents_card_id_fkey') then
    alter table intents
      add constraint intents_card_id_fkey
      foreign key (card_id) references cards (card_id);
  end if;
  if to_regclass('public.intents') is not null
     and not exists (select 1 from pg_constraint where conname = 'intents_agent_id_fmt') then
    alter table intents
      add constraint intents_agent_id_fmt
      check (agent_id ~ '^0x[0-9a-f]{40}$');
  end if;
  if to_regclass('public.intents') is not null
     and not exists (select 1 from pg_constraint where conname = 'intents_intent_hash_unique') then
    alter table intents
      add constraint intents_intent_hash_unique
      unique (intent_hash);
  end if;
  if to_regclass('public.intents') is not null
     and not exists (select 1 from pg_constraint where conname = 'intents_idempotency_key_unique') then
    alter table intents
      add constraint intents_idempotency_key_unique
      unique (idempotency_key);
  end if;
end $$;

alter table if exists intents
  alter column agent_id set not null,
  alter column idempotency_key set not null;

-- Required indexes.
create unique index if not exists cards_agent_active_uidx
  on cards (agent_id) where status = 'ACTIVE';
create index if not exists cards_owner_updated_idx
  on cards (owner_address, updated_at desc);
create index if not exists cards_agent_updated_idx
  on cards (agent_id, updated_at desc);
create index if not exists cards_status_expiry_idx
  on cards (status, expires_at);
create index if not exists cards_controller_block_idx
  on cards (controller_address, source_block);
create index if not exists intents_agent_created_idx
  on intents (agent_id, created_at desc);
create index if not exists intents_card_created_idx
  on intents (card_id, created_at desc);
create index if not exists intents_status_expiry_idx
  on intents (status, expires_at);

-- Final fail-closed validation before promotion.
do $$
declare
  invalid_final integer;
begin
  select count(*) into invalid_final
    from intents where agent_id is null or idempotency_key is null;
  if invalid_final > 0 then
    raise exception 'invalid intents rows remain: % must be resolved before promotion', invalid_final;
  end if;
end $$;

-- 4. RLS deny-only policies (Option A server-only PostgREST; no public access).
alter table if exists session_challenges enable row level security;
alter table if exists sessions enable row level security;
alter table if exists intents enable row level security;
alter table if exists cards enable row level security;

drop policy if exists session_challenges_deny_public_select on session_challenges;
create policy session_challenges_deny_public_select on session_challenges for select to public using (false);
drop policy if exists session_challenges_deny_public_insert on session_challenges;
create policy session_challenges_deny_public_insert on session_challenges for insert to public with check (false);
drop policy if exists session_challenges_deny_public_update on session_challenges;
create policy session_challenges_deny_public_update on session_challenges for update to public using (false) with check (false);
drop policy if exists session_challenges_deny_public_delete on session_challenges;
create policy session_challenges_deny_public_delete on session_challenges for delete to public using (false);

drop policy if exists sessions_deny_public_select on sessions;
create policy sessions_deny_public_select on sessions for select to public using (false);
drop policy if exists sessions_deny_public_insert on sessions;
create policy sessions_deny_public_insert on sessions for insert to public with check (false);
drop policy if exists sessions_deny_public_update on sessions;
create policy sessions_deny_public_update on sessions for update to public using (false) with check (false);
drop policy if exists sessions_deny_public_delete on sessions;
create policy sessions_deny_public_delete on sessions for delete to public using (false);

drop policy if exists intents_deny_public_select on intents;
create policy intents_deny_public_select on intents for select to public using (false);
drop policy if exists intents_deny_public_insert on intents;
create policy intents_deny_public_insert on intents for insert to public with check (false);
drop policy if exists intents_deny_public_update on intents;
create policy intents_deny_public_update on intents for update to public using (false) with check (false);
drop policy if exists intents_deny_public_delete on intents;
create policy intents_deny_public_delete on intents for delete to public using (false);

drop policy if exists cards_deny_public_select on cards;
create policy cards_deny_public_select on cards for select to public using (false);
drop policy if exists cards_deny_public_insert on cards;
create policy cards_deny_public_insert on cards for insert to public with check (false);
drop policy if exists cards_deny_public_update on cards;
create policy cards_deny_public_update on cards for update to public using (false) with check (false);
drop policy if exists cards_deny_public_delete on cards;
create policy cards_deny_public_delete on cards for delete to public using (false);

-- Rollback is forward-only and additive: disable the new composition root,
-- preserve new rows for forensic inspection, and apply a separately reviewed
-- compensating migration after an explicit data-retention decision.
-- Existing data validity is proven by counts before and after.

-- ==================== S3 — Arc lane (chain_id, lane-pair CHECKs, lane indexes) ====================
-- Source: supabase/migrations/202609190001_arc_lane.sql (verbatim; see sha256 in header).
-- H1/H2 Arc lane migration (additive only).
-- Extends 202609080001_sessions_and_intents and 202609120001_persistence_contracts
-- without editing either file. Existing rows are all legacy-lane
-- (Creditcoin/Advance + native-testnet-ctc) and are backfilled as such.
-- No remote parity is claimed; apply only under a separately approved lane.
--
-- Lane pairs (the only valid combinations, enforced below):
--   (102031, 'native-testnet-ctc')   legacy lane (history preserved)
--   (5042002, 'arc-testnet-usdc')    H1/H2 Arc lane (product decision)
-- Anything else fails closed at INSERT/UPDATE time. An Arc row can never
-- disguise as CTC and a CTC row can never enter the Arc lane.

-- 1. cards: explicit lane chain.
alter table if exists cards
  add column if not exists chain_id bigint;

-- Backfill legacy lane for pre-migration rows (all CTC-era data).
update cards set chain_id = 102031 where chain_id is null;

-- Fail-closed validation before tightening.
do $$
declare
  invalid_cards integer;
begin
  select count(*) into invalid_cards
    from cards
    where chain_id is null
       or not ((chain_id = 102031 and asset = 'native-testnet-ctc')
            or (chain_id = 5042002 and asset = 'arc-testnet-usdc'));
  if invalid_cards > 0 then
    raise exception 'invalid legacy cards rows: % must be quarantined before promotion', invalid_cards;
  end if;
end $$;

alter table if exists cards
  alter column chain_id set not null;

-- Replace the CTC-only asset check with the lane-pair check.
-- The old inline check (auto-named cards_asset_check) is dropped here, in
-- this additive file only; the original migration file is untouched.
alter table if exists cards
  drop constraint if exists cards_asset_check;

do $$
begin
  if to_regclass('public.cards') is not null
     and not exists (select 1 from pg_constraint where conname = 'cards_asset_lane_check') then
    alter table cards
      add constraint cards_asset_lane_check
      check (
        (chain_id = 102031 and asset = 'native-testnet-ctc') or
        (chain_id = 5042002 and asset = 'arc-testnet-usdc')
      );
  end if;
end $$;

create index if not exists cards_chain_updated_idx
  on cards (chain_id, updated_at desc);

-- 2. intents: explicit lane chain (intents had no asset check; one is added).
alter table if exists intents
  add column if not exists chain_id bigint;

update intents set chain_id = 102031 where chain_id is null;

do $$
declare
  invalid_intents integer;
begin
  select count(*) into invalid_intents
    from intents
    where chain_id is null
       or not ((chain_id = 102031 and asset = 'native-testnet-ctc')
            or (chain_id = 5042002 and asset = 'arc-testnet-usdc'));
  if invalid_intents > 0 then
    raise exception 'invalid legacy intents rows: % must be quarantined before promotion', invalid_intents;
  end if;
end $$;

alter table if exists intents
  alter column chain_id set not null;

do $$
begin
  if to_regclass('public.intents') is not null
     and not exists (select 1 from pg_constraint where conname = 'intents_asset_lane_check') then
    alter table intents
      add constraint intents_asset_lane_check
      check (
        (chain_id = 102031 and asset = 'native-testnet-ctc') or
        (chain_id = 5042002 and asset = 'arc-testnet-usdc')
      );
  end if;
end $$;

create index if not exists intents_chain_created_idx
  on intents (chain_id, created_at desc);

-- 3. No RLS change: cards/intents already deny public under Option A;
-- new columns inherit the existing table policies. No RPC, no SECURITY
-- DEFINER, no destructive SQL in this file.

-- Rollback is forward-only and additive: disable the Arc lane composition
-- root, preserve new rows for forensic inspection, and apply a separately
-- reviewed compensating migration after an explicit data-retention decision.
-- Existing data validity is proven by counts before and after.

-- End of Neon baseline. BASELINE CREATED, NOT APPLIED.
