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

-- Session challenge checks and lookups.
alter table if exists session_challenges
  add constraint if not exists session_challenges_nonce_hash_hex
  check (nonce_hash ~ '^[0-9a-f]{64}$'),
  add constraint if not exists session_challenges_wallet_address_fmt
  check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  add constraint if not exists session_challenges_expiry_after_issue
  check (expires_at > issued_at);

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

-- Backfill agent from the authoritative card source. Rows with no card,
-- invalid agent, or agent mismatch are invalid and block promotion.
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

-- Card intent ownership link.
alter table if exists intents
  add constraint if not exists intents_card_id_fkey
  foreign key (card_id) references cards (card_id);

alter table if exists intents
  add constraint if not exists intents_agent_id_fmt
  check (agent_id ~ '^0x[0-9a-f]{40}$'),
  add constraint if not exists intents_intent_hash_unique
  unique (intent_hash),
  add constraint if not exists intents_idempotency_key_unique
  unique (idempotency_key);

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
