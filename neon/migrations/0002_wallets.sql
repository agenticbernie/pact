-- 0002: local wallet registry for the agent-signer lane (additive).
--
-- WHY: the agent wallet that signs `controller.pay` has to be provisioned
-- before an execute attempt can settle. This table records the PUBLIC address
-- and the role of every wallet `scripts/create-wallet.mjs` generates, so the
-- operator can tell which address is the owner, the agent, the deployer, or the
-- ASC relayer.
--
-- PRIVATE KEYS ARE NEVER STORED HERE. The signing key lives only in the
-- server-side secret store (AGENT_SIGNER_PRIVATE_KEY) and never reaches the
-- database, the repository, or any client.
--
-- A row is a provisioning record, never an authorization: payment authority
-- stays with PactCardController on chain, and the executor re-reads the card
-- from the chain before it signs anything.
--
-- Backend-agnostic: applies to a local Postgres volume and to a hosted Neon
-- branch (the role must own the table; RLS deny policies apply to every
-- non-owner role, matching the baseline).

create table if not exists wallets (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  role text not null check (role in ('owner', 'agent', 'deployer', 'relayer', 'asc')),
  label text,
  created_at timestamptz not null default now()
);

create index if not exists wallets_role_idx on wallets (role);
