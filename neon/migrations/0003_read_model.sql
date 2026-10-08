-- 0003: Phase 05 read model (chain-events ledger + indexer cursor).
--
-- WHY: Phase 04 can execute a payment, but a client response or a database row
-- must never be the authority for "settled". This migration adds the two
-- tables the Phase 05 indexer owns:
--
--   * chain_events  — append-only ledger of DECODED, chain-confirmed Pact/ASC
--                     events. Uniqueness is (chain_id, tx_hash, log_index), so
--                     replaying a block range is idempotent by construction.
--   * indexer_state — the persisted cursor. `next_block` advances ONLY after a
--                     whole confirmed range is persisted; a crash or RPC outage
--                     leaves the cursor untouched and the next tick reprocesses.
--
-- Authority boundary: these tables are DERIVED data. They cannot authorize,
-- settle, increase credit, or override a contract result. Payment authority
-- stays with PactCardController on chain.
--
-- Secrets: no keys, bearer tokens, raw prompt bodies, or provider responses are
-- stored here — only public on-chain values and their decoded payloads.
--
-- Idempotent DDL (create … if not exists / drop policy if exists), so the
-- one-shot `migrate` compose service can re-run it on an existing volume.
-- Backend-agnostic: applies to the local Postgres volume and to a hosted Neon
-- branch (the runtime role must own the tables; the RLS deny policies below
-- apply to every non-owner role, matching the 0001 baseline).

create table if not exists chain_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null check (chain_id >= 0),
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  event_type text not null,
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  indexed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

-- Read paths: latest activity per card, and event lookup by type/tx.
create index if not exists chain_events_chain_tx_idx
  on chain_events (chain_id, tx_hash);
create index if not exists chain_events_chain_type_block_idx
  on chain_events (chain_id, event_type, block_number desc);
create index if not exists chain_events_card_block_idx
  on chain_events (chain_id, ((payload ->> 'cardId')), block_number desc);

create table if not exists indexer_state (
  chain_id bigint primary key check (chain_id >= 0),
  next_block bigint not null check (next_block >= 0),
  latest_confirmed_block bigint not null check (latest_confirmed_block >= 0),
  latest_block_hash text check (latest_block_hash is null or latest_block_hash ~ '^0x[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

-- RLS deny-only policies (same posture as the 0001 baseline: server-side access
-- via the owning role only; no public/anonymous read or write path).
alter table if exists chain_events enable row level security;
alter table if exists indexer_state enable row level security;

drop policy if exists chain_events_deny_public_select on chain_events;
create policy chain_events_deny_public_select on chain_events for select to public using (false);
drop policy if exists chain_events_deny_public_insert on chain_events;
create policy chain_events_deny_public_insert on chain_events for insert to public with check (false);
drop policy if exists chain_events_deny_public_update on chain_events;
create policy chain_events_deny_public_update on chain_events for update to public using (false) with check (false);
drop policy if exists chain_events_deny_public_delete on chain_events;
create policy chain_events_deny_public_delete on chain_events for delete to public using (false);

drop policy if exists indexer_state_deny_public_select on indexer_state;
create policy indexer_state_deny_public_select on indexer_state for select to public using (false);
drop policy if exists indexer_state_deny_public_insert on indexer_state;
create policy indexer_state_deny_public_insert on indexer_state for insert to public with check (false);
drop policy if exists indexer_state_deny_public_update on indexer_state;
create policy indexer_state_deny_public_update on indexer_state for update to public using (false) with check (false);
drop policy if exists indexer_state_deny_public_delete on indexer_state;
create policy indexer_state_deny_public_delete on indexer_state for delete to public using (false);
