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
