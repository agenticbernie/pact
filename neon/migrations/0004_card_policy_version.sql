-- 0004: authoritative card policy version provenance.
--
-- WHY: `cards.policy_version` could not be truthful. The controller's card
-- lifecycle events (`CardCreated`, `PolicyUpdated`, `CreditVerified`) do not
-- carry a policy version, so the Phase 05 projection could only write the
-- placeholder `0` — while `PactCardController.cards(id).policyVersion` (a
-- one-`eth_call` view) IS authoritative. The console then rendered that
-- placeholder next to real chain facts as if it were one, and an intent bound
-- to it was refused by the executor's on-chain compare with
-- `CARD_NOT_ELIGIBLE` (or, worse, showed a stale version as if verified).
--
-- This migration adds the *provenance* the read model needs to say which of
-- the three states a value is in:
--
--   * unknown  — never observed from the chain; the column is the projection
--                placeholder and must not be presented as an authoritative
--                policy version.
--   * stale    — observed on chain, but a newer card event has been indexed
--                for that card since, so the value may no longer match.
--   * verified — observed on chain at (or after) the latest indexed card event
--                for that card.
--
--   policy_version_source      'PROJECTION' (default) | 'CHAIN'
--   policy_version_block       block the authoritative value was read at;
--                              0 means "never read" (monotonic guard column)
--   policy_version_observed_at when the read happened (audit only)
--
-- Authority boundary: these columns describe a READ. They cannot authorize a
-- payment, raise credit, or override a contract result — the controller stays
-- the only authority, and the executor still re-reads `cards(id)` before it
-- signs anything.
--
-- Idempotent DDL (add column if not exists / constraint guards), so the
-- one-shot `migrate` compose service can re-run it on an existing volume.
-- Backend-agnostic: applies to the local Postgres volume and to a hosted Neon
-- branch (the runtime role must own the tables; the RLS deny policies from the
-- 0001 baseline still apply to every non-owner role).

alter table if exists cards
  add column if not exists policy_version_source text not null default 'PROJECTION',
  add column if not exists policy_version_block bigint not null default 0,
  add column if not exists policy_version_observed_at timestamptz;

do $$
begin
  if to_regclass('public.cards') is not null
     and not exists (select 1 from pg_constraint where conname = 'cards_policy_version_source_check') then
    alter table cards
      add constraint cards_policy_version_source_check
      check (policy_version_source in ('PROJECTION', 'CHAIN'));
  end if;
  if to_regclass('public.cards') is not null
     and not exists (select 1 from pg_constraint where conname = 'cards_policy_version_block_check') then
    alter table cards
      add constraint cards_policy_version_block_check
      check (policy_version_block >= 0);
  end if;
end $$;

-- The reconciler's work queue: rows that still need an authoritative read
-- (never read, or read before the newest indexed card event).
create index if not exists cards_policy_version_pending_idx
  on cards (chain_id, policy_version_block)
  where policy_version_source <> 'CHAIN' or policy_version_block = 0;
