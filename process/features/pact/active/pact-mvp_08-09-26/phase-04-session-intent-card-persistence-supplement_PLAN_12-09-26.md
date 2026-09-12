---
name: plan:phase-04-session-intent-card-persistence-supplement
description: "Phase 04 additive plan supplement for canonical session, intent, and card persistence contracts"
date: 12-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
  mode: plan-supplement
---

# Phase 04 Session, Intent, and Card Persistence Plan Supplement

**Mode:** PLAN-SUPPLEMENT  
**Date**: 2026-09-12  
**Status**: EVL GREEN — OPTION A PERSISTENCE FOUNDATION CLOSEOUT COMPLETE (local/static only); NOT READY FOR STAGING MIGRATION, G13 REDEPLOY, G22, OR H1-H3 WITHOUT SEPARATE APPROVALS  
**Complexity**: COMPLEX  
**Primary execute anchor:** G18-G21 implementation only after PVL and explicit
`ENTER EXECUTE MODE`; G22 remains separately hybrid-gated.  
**Supporting phase files:** Phase 04 plan/report, H1-H3 runtime-wiring plan,
hybrid gate pack, blast-radius registry, and the existing sessions/intents
migration are read-only historical inputs.  
**Selected feature task folder:** `process/features/pact/active/pact-mvp_08-09-26/`

## Overview

This supplement closes the persistence-contract gap between the Phase 04 local
runtime wiring and a server-owned Supabase implementation. It is additive to
the Phase 04 plan, explicit about data validity and authority, and deliberately
does not claim that the target schema, adapters, or remote database exist.

## Scope and Preservation Contract

This is a plan-only artifact. It does not authorize implementation, migration
execution, deployment, Supabase access, secret access, OpenAI/RPC calls,
transactions, database reset, commit, or push. It defines the missing durable
contracts needed before production persistence can replace the current fake or
Map-backed boundaries.

The following are immutable historical inputs and must remain byte-identical:

- The original V1-V7 Validate Contract in
  `phase-04-ai-gateway-executor_PLAN_08-09-26.md`.
- All original V1-V7 evidence and the original G13 evidence in the Phase 04
  plan/report.
- The G14-G17 local evidence and the H1-H3 runtime-wiring plan as historical
  records; this supplement does not convert local fake evidence into remote
  schema or deployment evidence.

Current disposition: G14-G17 are **BLOCKED for production completion by schema
and port prerequisites**, despite the previously recorded local 4/4 fake-backed
EVL result. Preserve that local result as local-only. Remote schema parity is
**UNKNOWN / HYBRID-ONLY**. G13 post-runtime redeploy remains pending. H1-H3 are
**NOT READY**.

## Contract Inputs and Ownership

Authoritative inputs read for this supplement:

- `process/context/all-context.md`
- `process/context/planning/all-planning.md`
- `process/context/tests/all-tests.md`
- `process/context/tests/backend-tests.md`
- `process/development-protocols/all-development-protocols.md` and its routing
  targets
- Phase 04 plan, report, hybrid gate pack, H1-H3 runtime-wiring supplement,
  blast-radius registry, and the existing migration
- `packages/domain/src/types.ts`, `schemas.ts`, session-token exports, and
  existing API/intent tests
- `contracts/src/PactTypes.sol`, `PactCardController.sol`,
  `IPactCardController.sol`, generated `packages/pact-sdk` ABI, and
  `architecture/pact.contracts.aicd.yaml`

Ownership remains Phase 04 for session/AI/executor/_shared persistence
composition and migrations. Phase 01 owns shared domain primitives and any
additive domain-contract tests. Phase 02 remains the authority for on-chain
card lifecycle and policy. Phase 05 consumes card/intent records for read-model
work but cannot make them authorization truth.

## 1. Canonical `session_challenges` Schema

The additive target is one canonical row per issued challenge. The existing
`nonce_hash` primary key remains the stable lookup identity; no plaintext nonce,
signature, bearer token, or secret is stored.

### Exact columns and types

| Column | PostgreSQL type | Nullability/default | Contract |
|---|---|---|---|
| `nonce_hash` | `text` | `NOT NULL`, primary key | Lowercase SHA-256 hex, exactly 64 characters; generated from the returned nonce and never from message text. |
| `wallet_address` | `text` | `NOT NULL` | Lowercase canonical EVM address, `^0x[0-9a-f]{40}$`; server-derived from the challenge request and signature comparison. |
| `message` | `text` | `NOT NULL` | Exact EIP-191 message returned to the caller and verified later; bounded to 2 KiB; no secret or bearer value. This is the canonical challenge content. |
| `issued_at` | `timestamptz` | `NOT NULL` | UTC issuance instant used in the signed message. |
| `expires_at` | `timestamptz` | `NOT NULL` | UTC expiry; exactly five minutes after `issued_at` for newly issued rows. |
| `consumed_at` | `timestamptz` | nullable | Set once by the atomic consume operation; never cleared. |
| `revoked_at` | `timestamptz` | nullable | Server-only administrative invalidation; never client supplied. |
| `created_at` | `timestamptz` | `NOT NULL`, `default now()` | Persistence audit timestamp; for new rows it equals or follows `issued_at`. |

`message` is the required challenge message/content field. `issued_at` is
distinct from `created_at` so the signed issuance instant is explicit and
testable. `expires_at > issued_at` is required. `consumed_at` and `revoked_at`
must be at or after `issued_at` when present and must not be after the database
clock at the mutation boundary.

### Indexes and replay/single-use constraints

- Keep the primary key on `nonce_hash`; retain an explicit lookup index only if
  the migration validator requires it, otherwise do not create a redundant
  duplicate of the primary-key index.
- Add `session_challenges_wallet_issued_idx` on `(wallet_address, issued_at
  desc)` for server-owned audit/cleanup lookup.
- Add `session_challenges_expiry_idx` on `(expires_at)` with a partial predicate
  for rows where `consumed_at is null and revoked_at is null`.
- Add a check that `nonce_hash` matches lowercase 64-hex and a check that
  `expires_at > issued_at`.
- Add a partial unique index on `nonce_hash` for unconsumed, unrevoked rows
  only if the target Postgres validator accepts the redundant uniqueness
  expression; the primary key already guarantees nonce identity. The required
  replay invariant is the atomic update, not a speculative duplicate index.
- Consume exactly once with `UPDATE ... SET consumed_at = now() WHERE
  nonce_hash = $1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at
  > now() RETURNING ...`. Zero rows map to `AUTH_INVALID` or `AUTH_EXPIRED`
  according to a prior non-mutating expiry classification; no session is
  issued on zero rows.
- Revocation is monotonic: `revoked_at` may transition only from null to a
  timestamp. A consumed or revoked challenge can never be consumed again.
- [SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: RPC/security-definer text below preserved for history; authoritative contract is Option A server-only PostgREST, no RPC for MVP.] The production adapter must perform consume and row return as one PostgREST
  RPC/security-definer operation or one transactionally equivalent server
  boundary. A client-side select followed by update is invalid.

### RLS and server-only boundary

- Enable RLS on `session_challenges`; do not expose a public select, update, or
  delete policy.
- The browser/edge may call only the session HTTP routes. It may not call the
  table directly and may not choose `nonce_hash`, ownership, role, timestamps,
  consumed state, or revocation state.
- [SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: RLS-safe RPC / security-definer text below preserved for history; authoritative contract is Option A server-only PostgREST, no RPC/`SECURITY DEFINER` for MVP.] The regional function uses an RLS-safe RPC or narrowly scoped PostgREST
  operation. `SUPABASE_SERVICE_ROLE_KEY` is not the default contract and must
  not be introduced without a new security decision and PVL blocker.
- [SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: security-definer text below preserved for history; authoritative contract is Option A server-only PostgREST, no `SECURITY DEFINER`/`search_path` contract for MVP.] Any security-definer function must set a safe `search_path`, expose only the
  exact insert/consume/revoke operations, reject caller-supplied ownership and
  role fields, and be covered by RLS/static SQL tests.

### Domain mapping

`ChallengeRecord` maps as follows: `nonceHash` ↔ `nonce_hash`, `wallet` ↔
`wallet_address`, `message` ↔ `message`, `issuedAtMs` ↔ `issued_at`,
`expiresAtMs` ↔ `expires_at`, `consumedAtMs` ↔ `consumed_at`, and
`revokedAtMs` ↔ `revoked_at`. The mapping must parse canonical UTC timestamps
and lowercase addresses, never silently coerce invalid rows, and never return
raw database errors or columns outside the domain record.

## 2. `intents.agent_id` and Intent Persistence

### Exact `agent_id` contract

Add `agent_id text NOT NULL` to `intents`, with a check for a lowercase EVM
address (`^0x[0-9a-f]{40}$`) and a foreign-key-like ownership invariant enforced
by the card store/transaction: `intents.agent_id` must equal the authoritative
card snapshot agent for `intents.card_id`. Postgres must not use `uuid` here;
the domain type is an EVM address string and the on-chain ABI is `address`.

The domain mapping is `agent_id` ↔ `AgentIntent.agentId`. The adapter may accept
checksum input only at the HTTP/domain boundary, then stores lowercase and
returns the domain’s canonical checksum form if the shared schema requires it.
It must not use a client-provided agent ID as authority.

### Ownership, lookups, idempotency, and nullability

- `intent_id`, `card_id`, `agent_id`, `merchant_id`, `amount_base_units`,
  `asset`, `purpose`, `confidence`, `provider`, `model`, `policy_version`,
  `intent_hash`, `status`, `request_id`, `created_at`, and `expires_at` remain
  `NOT NULL` under the current contract.
- Add a unique constraint on `(intent_hash)` for canonical duplicate detection.
- Add a unique constraint on `(request_id)` only if request IDs are defined as
  intent creation idempotency keys by the gateway; otherwise retain request ID
  as an audit correlation field and use an explicit `idempotency_key text NOT
  NULL` column in a later approved supplement. This plan chooses the latter:
  add `idempotency_key text NOT NULL` with a unique constraint, and do not
  overload `request_id`.
- Add indexes on `(agent_id, created_at desc)`, `(card_id, created_at desc)`,
  `(status, expires_at)`, and `intent_hash` (the unique constraint may supply
  the physical index).
- `IntentStore.save` is insert-only for a new `intent_id`; a duplicate
  `idempotency_key` returns the previously stored equivalent intent only when
  its canonical hash, card, agent, and all authority fields match. A mismatch
  is `IDEMPOTENCY_CONFLICT`, not an overwrite.
- Lookups must be scoped by `intent_id` plus server-authenticated wallet/owner
  or agent identity and must verify the current card snapshot before preflight
  or execute. No anonymous or browser-wide intent lookup is allowed.
- Backfill existing rows by joining each intent to the authoritative card
  record on `card_id`. Rows with no card, invalid agent, or agent mismatch are
  quarantined/blocked for manual resolution; they are never silently dropped,
  assigned a guessed agent, or marked ready. The migration must fail closed
  before adding `NOT NULL` if any existing row cannot be validated.

## 3. Minimum Card Persistence Model

The card table is an off-chain cache/lookup record, not payment authority. The
controller contract and its events remain authoritative. The minimum model is:

| Column | PostgreSQL type | Nullability/default | Contract |
|---|---|---|---|
| `card_id` | `text` | `NOT NULL`, primary key | Canonical unsigned decimal controller card ID. |
| `controller_address` | `text` | `NOT NULL` | Lowercase EVM contract address; identifies the authority instance. |
| `owner_address` | `text` | `NOT NULL` | Lowercase EVM owner address; server-derived from chain/event. |
| `agent_id` | `text` | `NOT NULL` | Lowercase EVM agent address; matches `AgentIntent.agentId`. |
| `asset` | `text` | `NOT NULL` | Exactly `native-testnet-ctc` in the domain; chain mapping is address(0). |
| `status` | `text` | `NOT NULL` | `issued`, `active`, `suspended`, or `closed`, mapping `CardStatus`. |
| `owner_configured_cap` | `numeric(78,0)` | `NOT NULL` | uint256 decimal, no negative values. |
| `per_transaction_limit` | `numeric(78,0)` | `NOT NULL` | uint256 decimal, no negative values. |
| `verified_credit` | `numeric(78,0)` | `NOT NULL`, default 0 | uint256 decimal. |
| `verified_credit_expires_at` | `timestamptz` | nullable | Chain timestamp mapping; null/expired means no spendable credit. |
| `spent` | `numeric(78,0)` | `NOT NULL`, default 0 | uint256 decimal. |
| `expires_at` | `timestamptz` | `NOT NULL` | Chain card expiry. |
| `policy_version` | `integer` | `NOT NULL` | Non-negative shared policy version. |
| `allowlist_hash` | `text` | `NOT NULL` | Hash of the authoritative merchant allowlist snapshot; no client-defined recipient authority. |
| `source_block` | `bigint` | `NOT NULL` | Chain observation provenance. |
| `source_tx_hash` | `text` | `NOT NULL` | Lowercase 0x-prefixed transaction hash. |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL` | Persistence audit timestamps. |

Required indexes/constraints:

- Primary key `(controller_address, card_id)` rather than `card_id` alone if
  multiple controller deployments can coexist; the domain lookup key is the
  pair. If the existing read model already declares a deployment-scoped card
  identity, reuse it and do not create a second card key.
- Unique partial index on `(agent_id)` where `status in ('issued','active',
  'suspended')` and `expires_at > now()` cannot use `now()` in an index
  predicate. Therefore enforce the one-active rule with a transactionally
  maintained `is_active_assignment boolean NOT NULL` and a unique partial index
  on `(agent_id)` where `is_active_assignment`; set it true only for the
  authoritative active assignment and clear it on close/revoke/expiry
  reconciliation. A second card assignment must fail atomically.
- Index `(owner_address, updated_at desc)`, `(agent_id, updated_at desc)`,
  `(status, expires_at)`, and `(controller_address, source_block)`.
- Check constraints cover address format, decimal uint bounds, valid statuses,
  `expires_at > created_at`, `spent <= owner_configured_cap` only when that
  invariant is valid for the snapshot, and non-negative policy fields.

Lifecycle and ownership:

- `CardStore.getById(controllerAddress, cardId)` returns a server-validated
  `CardSnapshot | null`.
- `CardStore.getActiveByAgent(controllerAddress, agentId)` returns at most one
  active assignment and fails closed on duplicate active rows.
- `createOrRecord` is idempotent on the authoritative `(controller_address,
  card_id, source_tx_hash)` event identity and atomically claims the one-active
  assignment for the agent.
- `transitionStatus` permits only controller-event-derived transitions:
  issued→active, active→suspended, suspended→active, and any non-closed state
  →closed. Close/revoke clears `is_active_assignment` in the same transaction.
- A card is eligible for payment only when the current chain snapshot says
  status active, card not expired, agent matches, asset matches, merchant is
  allowlisted, and policy version/hash are current. Database status is a
  lookup optimization and cannot authorize payment.

RLS/server authority: enable RLS; no browser insert/update/delete policy.
Indexer/server functions may write through a narrowly scoped server boundary;
payment preflight/execution reads must be server-only and re-read chain state.
Owner-facing reads are wallet-scoped. Agent-facing reads are agent-scoped.
No client may set owner, agent, status, policy, source provenance, or active
assignment.

## 4. Exact Persistence Ports

These ports are the compatibility contract. Types are illustrative names to be
materialized in Phase 04 `_shared/persistence-ports.ts` or the owning domain
module without changing existing V1-V7 types or error codes.

```ts
type PersistenceErrorCode =
  | "NOT_FOUND"
  | "INVALID_ROW"
  | "OWNERSHIP_DENIED"
  | "REPLAYED"
  | "EXPIRED"
  | "REVOKED"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_ACTIVE_CARD"
  | "CONFLICT"
  | "UNAVAILABLE";

type PersistenceFailure = {
  code: PersistenceErrorCode;
  retryable: boolean;
};

interface SessionChallengeStore {
  insertChallenge(input: ChallengeRecord): Promise<void>;
  consumeChallenge(input: {
    nonceHash: string;
    now: string;
  }): Promise<ChallengeRecord | null>;
  revokeChallenge(input: {
    nonceHash: string;
    now: string;
  }): Promise<boolean>;
}

interface IntentStore {
  insertIntent(input: {
    intent: AgentIntent;
    idempotencyKey: string;
    ownerAddress: string;
    requestId: string;
  }): Promise<AgentIntent>;
  getById(input: {
    intentId: string;
    ownerAddress: string;
    agentId?: string;
  }): Promise<AgentIntent | null>;
  getByIdempotencyKey(input: {
    idempotencyKey: string;
    ownerAddress: string;
  }): Promise<AgentIntent | null>;
  markStatus(input: {
    intentId: string;
    ownerAddress: string;
    status: "ready" | "expired" | "consumed" | "failed";
    now: string;
  }): Promise<void>;
}

interface CardStore {
  getById(input: {
    controllerAddress: string;
    cardId: string;
    ownerAddress?: string;
    agentId?: string;
  }): Promise<CardSnapshot | null>;
  getActiveByAgent(input: {
    controllerAddress: string;
    agentId: string;
  }): Promise<CardSnapshot | null>;
  createOrRecord(input: CardSnapshot): Promise<CardSnapshot>;
  transitionStatus(input: {
    controllerAddress: string;
    cardId: string;
    from: CardStatus;
    to: CardStatus;
    sourceTxHash: string;
    sourceBlock: number;
  }): Promise<CardSnapshot>;
  close(input: {
    controllerAddress: string;
    cardId: string;
    sourceTxHash: string;
    sourceBlock: number;
  }): Promise<CardSnapshot>;
}
```

Port semantics:

- All inputs are server-normalized and validated before the port. Raw nonce,
  signature, bearer token, client agent, client recipient, and private key are
  never port inputs.
- `consumeChallenge` is atomic and single-use; it returns the pre-consume row
  only on a successful update. It must not issue a session itself.
- `insertIntent` validates card/agent ownership in the same transaction or
  through an equivalent server-authoritative lookup. Duplicate idempotency
  with equal canonical values is a replay-safe read; differing values are an
  `IDEMPOTENCY_CONFLICT`.
- `createOrRecord`, `transitionStatus`, and `close` atomically update the card
  row and active-agent assignment. They reject stale source ordering and
  duplicate active assignments.
- Fake implementations are in-memory, deterministic, and local-only. They
  must record atomicity assertions and cannot be injected into a deployed
  composition root.
- Production implementations use Supabase PostgREST/RPC with fixed table,
  column, and policy names. They must map HTTP/SQL failures to the closed
  persistence error union and never return raw database payloads.
- Composition roots must explicitly choose `Fake*Store` only in Vitest/local
  test factories and `Postgrest*Store` only in the regional/server function.
  There is no environment-based silent fallback from production adapter to
  fake.

## 5. Exact Additive Migration Plan

**Exact future filename:**
`supabase/migrations/202609120001_persistence_contracts.sql`

This is a future implementation artifact, not created by this supplement. It
must be additive and must not edit or reorder
`202609080001_sessions_and_intents.sql`.

Migration order:

1. Create any required enum/check helper functions in a schema-qualified,
   idempotent form; prefer text plus checks where Supabase diff tooling makes
   enums difficult to roll back.
2. Add nullable `message`, `issued_at`, and `revoked_at` to
   `session_challenges`; populate `issued_at` from `created_at` only for rows
   that can be proven to be existing internally generated challenges. Existing
   rows with no recoverable message are marked migration-invalid in a temporary
   quarantine result and block promotion; they are not fabricated.
3. Add the exact session checks/indexes/RLS policies above, then validate all
   existing rows before tightening `message` and `issued_at` to `NOT NULL`.
4. Add nullable `agent_id` and `idempotency_key` to `intents`; backfill agent
   from the authoritative card source or fail with a counted invalid-row
   report. No default agent and no silent delete. Backfill idempotency from a
   deterministic existing request identity only if collision-free; otherwise
   block promotion for manual resolution.
5. Add the `cards` table with the exact columns above, seed only from a
   validated local/read-model source, and do not claim chain parity. If no
   authoritative existing card rows are available, create the table empty.
6. Add indexes, uniqueness, checks, RLS, and server-only policies. Validate
   policy names and ownership predicates with static SQL tests.
7. In a final validation transaction, assert zero invalid legacy rows, then
   set `intents.agent_id`, `intents.idempotency_key`, and required challenge
   columns `NOT NULL`. The migration must abort before commit on any violation.

Rollback is forward-only and additive: no destructive down migration, no
`DROP TABLE`, no data truncation, and no weakening of existing constraints.
Rollback means disable the new composition root, preserve the new rows for
forensic inspection, and apply a separately reviewed compensating migration
that removes only new indexes/policies/columns after an explicit data-retention
decision. Existing data validity must be proven by counts and checksums before
and after. This plan makes **no remote parity claim** and does not authorize
running the migration against any Supabase project.

## 6. Required Future Tests and Commands

These are future commands for EXECUTE/PVL acceptance only. They are not run in
this plan-only pass, and none may use secrets, live providers, RPC, a database
reset, or deployment.

### Domain and schema contract tests

- `corepack yarn vitest run packages/domain/test/session-token.test.ts packages/domain/test/intent-shape.test.ts packages/domain/test/api-contracts.test.ts`
- Add `packages/domain/test/persistence-contracts.test.ts`: canonical address
  mapping, AgentIntent/card mapping, UTC timestamps, invalid-row rejection,
  stable status vocabulary, and no raw persistence error exposure.
- Add `supabase/test/schema-static.test.ts` or an equivalent static validator
  that parses the exact migration text and asserts column types, `NOT NULL`,
  checks, indexes, uniqueness, RLS enablement, policy names, and additive
  ordering. It must not connect to Postgres.

### Session persistence/lifecycle

- `corepack yarn vitest run supabase/functions/_shared/test/session-persistence.vitest.test.ts`
- Fake-only cases: message/content round-trip, issued/expiry mapping,
  consume-once zero-row replay, expiry, revocation monotonicity, hash-only
  writes, ownership mismatch, and no session issuance after failed consume.
- Production adapter contract tests use a fake PostgREST transport that records
  request method/path/body and proves the atomic RPC shape; they do not call
  Supabase.

### Intent persistence

- `corepack yarn vitest run supabase/functions/_shared/test/intent-persistence.vitest.test.ts supabase/functions/_shared/test/ai-gateway-runtime.vitest.test.ts`
- Prove `agent_id` is server-bound to card agent, one write after provider
  validation, equal-idempotency replay, conflicting-idempotency rejection,
  owner/agent-scoped lookup, expiry/status transitions, and zero persistence on
  provider/schema/region failure.

### Card persistence/lifecycle

- `corepack yarn vitest run supabase/functions/_shared/test/card-persistence.vitest.test.ts supabase/functions/agent-executor/test/executor.vitest.test.ts`
- Prove card snapshot mapping from the ABI/domain contract, active lookup,
  issued→active→suspended→active→closed transitions, close clears active
  assignment, duplicate active-agent rejection, stale event rejection,
  owner/agent scoping, and database cache never authorizes a payment without
  chain re-read.
- `forge test --root contracts --match-path test/PactCardController.t.sol`
  remains a read-only regression command for the on-chain lifecycle authority;
  no Solidity file is changed by this supplement.

### Composition roots and static validation

- `corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts`
- Assert fake stores are selected only by test factories, PostgREST stores are
  selected only by server composition, no production fake fallback exists,
  gateway cannot import signer/payment-send code, and executor cannot use
  browser-owned card/agent values.
- `corepack yarn typecheck`
- `corepack yarn lint`
- `corepack yarn validate:aicd`
- `node scripts/check-no-secrets.mjs`
- `git diff --check`
- `node .claude/skills/vc-audit-context/scripts/validate-protocol-discovery.mjs`
  and the repository's applicable plan/artifact validators.

### Migration/static and parity boundary

- `corepack yarn vitest run supabase/test/schema-static.test.ts`
- A future local Postgres/Supabase schema command may be added by PVL only if
  it does not reset data and has an explicit disposable local database
  contract. `supabase db reset --local` is prohibited for this request and is
  not part of this supplement's validation.
- Any remote schema parity check is **HYBRID-ONLY**, requires a separate
  approved lane, reads metadata only, and must record the exact project/region
  without secrets or mutation. It cannot be inferred from fake tests.

## 7. Next Binding Gates and Boundaries

Preserve G1-G8, G12a/G12b, G13, H1-H3, and the original V1-V7 contract exactly.
The following IDs are additive next gates and do not retroactively alter prior
evidence:

- **G18 — Schema/port compatibility:** static domain-to-DB mapping, exact port
  signatures, atomicity/error semantics, fake boundary, and composition-root
  selection. Binding local gate; must be green before any adapter implementation
  is treated as compatible.
- **G19 — Migration/static validation:** exact filename, additive SQL, columns,
  checks, indexes, uniqueness, RLS/policies, backfill invalid-row stop, and
  rollback/no-parity statement. Binding local/static gate; no DB reset.
- **G20 — RLS/server authority:** policy/static tests prove browser/anon cannot
  read or mutate session, intent, or card authority rows; server operations are
  ownership-scoped and no service-role value is required by default.
- **G21 — Persistence lifecycle:** fake-local session replay/revoke, intent
  idempotency, card active assignment and close/revoke lifecycle, plus executor
  re-read invariants. Binding local-only; fake evidence remains local-only.
- **G22 — Remote parity:** **HYBRID-ONLY** metadata/read-only parity check after
  G18-G21 and explicit approval. No deployment, migration, mutation, secret,
  OpenAI/RPC, or transaction is implied.

G14-G17 remain blocked until G18-G21 are accepted and the production adapter
composition is implemented and validated. Existing local G14-G17 4/4 evidence
is retained as fake/local behavior only. G13 post-runtime redeploy remains a
separate gate. H1-H3 remain NOT READY and cannot use local or fake evidence.

## 8. Hard Stops

- Plan only: do not modify implementation files or migrations.
- Do not deploy, access secrets, run a database reset, call OpenAI/RPC,
  broadcast transactions, execute transactions, commit, or push.
- Do not rewrite, reflow, append to, or normalize the original V1-V7 Validate
  Contract or any original G13 evidence.
- Do not claim remote schema parity from fake tests, static SQL, local wiring,
  or prior G14-G17 evidence.
- Do not claim H1, H2, or H3 readiness; they remain NOT READY.
- Do not introduce a UUID `agent_id`, guessed agent ownership, plaintext nonce,
  plaintext signature, plaintext bearer token, service-role default, client
  authority, silent backfill loss, destructive rollback, or active-card
  uniqueness based on an invalid `now()` index predicate.
- Do not treat the card table as payment authority; controller state and chain
  re-read remain authoritative.
- Do not use fake stores in production composition roots or silently fall back
  from PostgREST to a fake.

## Implementation Checklist

- [ ] PVL validates the exact schema, ports, ownership rules, and additive
  migration plan without changing the original V1-V7/G13 artifacts.
- [ ] EXECUTE, only after explicit approval, captures genuine RED tests for
  G18-G21 before implementing the minimum ports/adapters/migration.
- [ ] EXECUTE proves local fake boundaries, then validates static migration and
  composition contracts; no fake result is promoted to remote parity.
- [ ] A separate approved hybrid lane evaluates G22 only after G18-G21 are
  green; G13 and H1-H3 retain their existing approvals and boundaries.

## Touchpoints

- Domain: `packages/domain/src/types.ts`, shared session/intent/card mapping,
  additive contract tests.
- Persistence: `supabase/functions/_shared/`, session, AI gateway, executor
  composition roots, fake stores, PostgREST stores.
- Database: future `supabase/migrations/202609120001_persistence_contracts.sql`
  only; the existing migration is read-only input.
- Authority: Phase 02 controller ABI/types and AICD registry consumed read-only.
- Process: this supplement only; historical Phase 04 plans/reports remain
  immutable.

## Public Contracts

The public contract is the exact `SessionChallengeStore`, `IntentStore`, and
`CardStore` interface block in §4, the column/type tables in §§1-3, the closed
persistence error codes, and the G18-G22 gate definitions. No new API error
code, model provider, payment authority, browser capability, or chain behavior
is introduced.

## Blast Radius

The implementation blast radius is Phase 04 persistence composition and the
additive Supabase migration, with additive Phase 01 mapping tests. Phase 02
Solidity/controller authority, Phase 03 evidence, existing domain canonical
hash behavior, V1-V7/G13 evidence, and H1-H3 lane rules are out of scope and
must remain unchanged. Phase 05 may consume the resulting records but cannot
authorize payments.

## Acceptance Criteria

- Every required column, type, nullability rule, index, constraint, policy,
  backfill stop, and rollback rule is represented in PVL findings.
- Port signatures and semantics match §4 exactly, including atomic consume,
  idempotency conflict, one-active-card enforcement, ownership scope, and
  fake/PostgREST separation.
- Future tests have exact commands and explicitly distinguish local fake,
  static migration, and HYBRID-ONLY remote evidence.
- G14-G17 remain blocked on G18-G21; local fake evidence remains local-only;
  H1-H3 remain NOT READY.
- Original V1-V7 and G13 bytes are unchanged.

## Phase Completion Rules

This supplement can leave PLAN-SUPPLEMENT only when PVL accepts or records
bounded concerns for G18-G22, with no unowned schema/port ambiguity. It cannot
mark persistence implemented, G13 complete, remote parity green, or H1-H3
ready. EXECUTE requires explicit approval naming this exact file.

## Verification Evidence

This plan-only pass may record only artifact/discovery/static results: plan
completeness, plan discovery, context discovery, protocol/wiring validation,
secret scan, `git diff --check`, and byte-identity comparison of the original
Validate Contract. No runtime, database, network, provider, or live evidence
is valid for this supplement.

## Test Infra Improvement Notes

The future implementation should add hermetic persistence-port fixtures and a
static SQL validator rather than requiring local Supabase reset. Any missing
Supabase/Deno capability remains a CI or separately approved hybrid concern;
it must not be papered over by fake-to-remote claims.

## Validate Contract

PVL must validate this supplement as an additive contract and must not rewrite
the original Phase 04 V1-V7 section. Binding next gates are G18 Schema/port
compatibility, G19 migration/static validation, G20 RLS/server authority, and
G21 persistence lifecycle. G22 remote parity is HYBRID-ONLY. The net state is
CONDITIONAL until these gates are independently accepted; this supplement is
READY FOR PVL, not READY FOR EXECUTE.

## Resume and Execution Handoff

Resume from this exact path in PVL. If PVL passes, the next valid state is
explicit `ENTER EXECUTE MODE` for this supplement with G18-G21 as the selected
binding gates. If PVL identifies schema/port drift, update only this supplement
or create a dated follow-up; never edit original V1-V7/G13 evidence.

## Plan Completeness and Acceptance

The supplement is complete when PVL can bind each schema field, port method,
migration operation, test command, error/atomicity rule, and gate to a concrete
acceptance assertion without editing implementation artifacts. PVL must classify
G18-G22 and retain the original V1-V7/G13/H boundaries. EXECUTE requires a
separate explicit approval naming this exact supplement path.

**Status:** READY FOR PVL  
**Summary:** Canonical session challenge, intent agent ownership/idempotency,
card lifecycle/cache, persistence ports, additive migration, local-only tests,
and next gates are specified without changing implementation or historical
evidence.  
**Concerns/Blockers:** G14-G17 production completion is blocked by G18-G21;
remote parity is HYBRID-ONLY; G13 and H1-H3 remain separately approval-gated.

**Next Step:** Run PVL against this exact supplement path; do not execute or
run any live, remote, migration, reset, secret, provider, RPC, transaction,
commit, or push operation.

---

## PVL Remediation Amendment -- G18-G22 and G13 Provenance (2026-09-12)

**Amendment status:** READY FOR PVL; PLAN ONLY; NOT READY FOR EXECUTE, G13,
H1-H3, migration, reset, deployment, remote parity, commit, or push.

This amendment is appended to remediate PVL findings. It supersedes only the
ambiguous schema, port, RLS, test, gate, and provenance statements above. It does
not rewrite V1-V7, the original Phase 04 report/evidence, the original G13
failure/success histories, G14-G17, or H1-H3. No implementation file,
migration, report, evidence artifact, or historical record is changed by this
amendment.

### A. Canonical port/type reconciliation (G18)

The first EXECUTE increment must map every persistence method and type to an
existing canonical definition. It must not add a second `AgentIntent`,
`ChallengeRecord`, `SessionRecord`, `CardStatus`, hash serializer, asset
descriptor, or API error union.

| Contract item | Canonical existing definition | Required remediation |
|---|---|---|
| `AgentIntent` | `packages/domain/src/types.ts:1-16`, validated by `packages/domain/src/schemas.ts:119-150` | Import and return this exact type. `agentId` is the EVM address string, `cardId` is canonical unsigned decimal text, asset is `native-testnet-ctc`, and no persistence-local replacement is allowed. |
| `CanonicalIntentInput` and hash | `packages/domain/src/types.ts:18-28`, `packages/domain/src/canonical-hash.ts` | Reuse the Phase 01 type and serializer. A persistence adapter never recomputes or changes the hash field order. |
| `ChallengeRecord` | `supabase/functions/session/index.ts:38-44` | Reuse this exact runtime record. DB mapping is `nonceHash` to `nonce_hash`, `wallet` to `wallet_address`, `message` to `message`, `expiresAtMs` to `expires_at`, and `consumedAtMs` to `consumed_at`; `issuedAt` and `revokedAt` are persistence-only columns and map only through an explicit adapter mapping, never by changing the runtime type silently. |
| `SessionRecord` | `supabase/functions/session/index.ts:46-54` | Reuse this exact runtime record. `id`, `tokenHash`, `wallet`, `role`, `issuedAtMs`, `expiresAtMs`, and `revokedAtMs` map one-for-one to the existing session contract. |
| `SessionPersistence` | `supabase/functions/session/index.ts:61-67` | This is the existing session composition port. Do not invent a second session port. If a `SessionChallengeStore` facade is needed for G21, it must be a named adapter over these exact five methods and must not duplicate runtime behavior. |
| `OnChainCardSnapshot` | `supabase/functions/agent-executor/chain-client.ts:13-25` | The chain read remains the authority for card state. A persistence row is a cache DTO mapped from this shape and must never be passed as payment authority. |
| `CardStatus` | `contracts/src/PactTypes.sol:4-9` and `packages/pact-sdk/src/abi.ts` | The canonical values are `Issued`, `Active`, `Suspended`, `Closed`; DB values are the uppercase strings `ISSUED`, `ACTIVE`, `SUSPENDED`, `CLOSED`, with an explicit mapping table. No lowercase or additional status is valid. |
| `CardSnapshot` | No existing domain export was found; `OnChainCardSnapshot` is the existing source shape | Do not add `CardSnapshot` to `packages/domain`. If an adapter DTO is required, define it only in the Phase 04 persistence module, document that it is a DB cache row, and map it losslessly to/from `OnChainCardSnapshot`; it cannot be used by gateway authorization or executor settlement. |
| `IntentStore` and `CardStore` | No existing implementation or domain export was found | These are Phase 04 persistence ports only, not domain abstractions. Their signatures below are binding and must use the canonical types above. No invented alternate method, status, or error type may be added. |

All port calls receive server-normalized values only. Raw nonce, signature,
bearer token, client-selected owner/agent/card/asset/recipient, private key,
provider body, and database payload are never port inputs or outputs.

#### Exact port method contract

The following is the complete binding contract. Every method has its input,
output, nullability, error behavior, and atomicity stated. A method not listed
here is not part of G18-G21.

| Method | Exact input and output | Null/error behavior | Atomicity and authority |
|---|---|---|---|
| `SessionChallengeStore.insertChallenge(row: ChallengeRecord): Promise<void>` | Input is a validated `ChallengeRecord`; output is `void`. | Invalid row -> `INVALID_ROW`; duplicate hash -> `CONFLICT`; transport failure -> `UNAVAILABLE` with no raw DB detail. | One insert; no session issuance; hash-only persistence. |
| `SessionChallengeStore.consumeChallenge(input: { nonceHash: string; now: string }): Promise<ChallengeRecord \| null>` | Input is lowercase 64-hex `nonceHash` and canonical UTC `now`; output is the consumed row or `null`. | `null` for missing, consumed, revoked, or expired row; caller maps zero-row replay to `AUTH_INVALID` and never issues a session. Invalid input -> `INVALID_ROW`. | One atomic update-and-return operation; select-then-update is forbidden. |
| `SessionChallengeStore.revokeChallenge(input: { nonceHash: string; now: string }): Promise<boolean>` | Input is hash plus server time; output is `true` only for a newly revoked row, otherwise `false`. | Missing/already revoked -> `false`; invalid input -> `INVALID_ROW`; DB failure -> `UNAVAILABLE`. | Monotonic null-to-timestamp update in one statement; client cannot supply ownership or role. |
| `IntentStore.insertIntent(input: { intent: AgentIntent; idempotencyKey: string; ownerAddress: string; requestId: string }): Promise<AgentIntent>` | Input uses canonical `AgentIntent` and server owner/idempotency/request values; output is the stored canonical `AgentIntent`. | Equal idempotency replay returns the equivalent existing intent; differing canonical/card/agent/authority fields -> `IDEMPOTENCY_CONFLICT`; invalid row -> `INVALID_ROW`; owner mismatch -> `OWNERSHIP_DENIED`. | Validate card/agent ownership and insert/replay decision in one transaction or equivalent server RPC; never overwrite. |
| `IntentStore.getById(input: { intentId: string; ownerAddress: string; agentId?: string }): Promise<AgentIntent \| null>` | Server-authenticated owner and optional agent scope; output is a canonical intent or `null`. | Unscoped/invalid identity -> `OWNERSHIP_DENIED`; missing -> `null`; DB failure -> `UNAVAILABLE`. | One scoped read; current card snapshot must be checked before preflight/execute. |
| `IntentStore.getByIdempotencyKey(input: { idempotencyKey: string; ownerAddress: string }): Promise<AgentIntent \| null>` | Server-authenticated owner plus key; output is canonical intent or `null`. | Cross-owner -> `OWNERSHIP_DENIED`; missing -> `null`; DB failure -> `UNAVAILABLE`. | One owner-scoped read; no anonymous/browser-wide lookup. |
| `IntentStore.markStatus(input: { intentId: string; ownerAddress: string; status: "ready" \| "expired" \| "consumed" \| "failed"; now: string }): Promise<void>` | Existing `AgentIntent` status vocabulary only; output `void`. | Illegal transition -> `CONFLICT`; missing -> `NOT_FOUND`; cross-owner -> `OWNERSHIP_DENIED`; invalid row -> `INVALID_ROW`. | One conditional transition; no client status authority and no status outside the existing gateway vocabulary. |
| `CardStore.getById(input: { cardId: string; ownerAddress?: string; agentId?: string }): Promise<OnChainCardSnapshot \| null>` | Canonical decimal `cardId` plus at least one server identity scope; output is the mapped cache snapshot or `null`. | Missing -> `null`; duplicate/invalid rows -> `INVALID_ROW`; scope mismatch -> `OWNERSHIP_DENIED`; DB failure -> `UNAVAILABLE`. | Scoped read only; result never authorizes payment without chain re-read. |
| `CardStore.getActiveByAgent(input: { agentId: string }): Promise<OnChainCardSnapshot \| null>` | Lowercase canonical agent address; output one mapped active snapshot or `null`. | Duplicate `ACTIVE` rows -> `DUPLICATE_ACTIVE_CARD`; missing -> `null`; invalid address -> `INVALID_ROW`. | Read must fail closed on duplicate active rows; the partial unique index is the database guard. |
| `CardStore.createOrRecord(input: OnChainCardSnapshot): Promise<OnChainCardSnapshot>` | Input is a server/indexer-derived chain snapshot; output is the stored mapped snapshot. | Same event identity is idempotent; stale/conflicting event -> `CONFLICT`; active collision -> `DUPLICATE_ACTIVE_CARD`; invalid snapshot -> `INVALID_ROW`. | Insert/update and active-agent uniqueness are one transaction; no client authority. |
| `CardStore.transitionStatus(input: { cardId: string; from: CardStatus; to: CardStatus; sourceTxHash: string; sourceBlock: number }): Promise<OnChainCardSnapshot>` | Uses Solidity `CardStatus` values and chain provenance; output updated mapped snapshot. | Illegal transition/stale event -> `CONFLICT`; missing -> `NOT_FOUND`; invalid provenance -> `INVALID_ROW`. | Conditional event-derived transition and active uniqueness are atomic. |
| `CardStore.close(input: { cardId: string; sourceTxHash: string; sourceBlock: number }): Promise<OnChainCardSnapshot>` | Server event provenance only; output closed mapped snapshot. | Missing -> `NOT_FOUND`; stale/duplicate event -> `CONFLICT`; invalid provenance -> `INVALID_ROW`. | One atomic transition to `CLOSED`; no assignment flag is cleared because no such column exists. |

The closed persistence error set remains `NOT_FOUND`, `INVALID_ROW`,
`OWNERSHIP_DENIED`, `REPLAYED`, `EXPIRED`, `REVOKED`, `IDEMPOTENCY_CONFLICT`,
`DUPLICATE_ACTIVE_CARD`, `CONFLICT`, and `UNAVAILABLE`. Adapters map all
PostgREST/SQL failures into this set and never expose raw errors.

### B. Corrected card schema and lifecycle

The prior card alternatives are rejected. The target table is `cards` with
`card_id text PRIMARY KEY`; there is no composite primary key and no
`is_active_assignment` column. A controller deployment is represented by the
`controller_address` column but does not alter primary-key identity. A future
multi-controller requirement needs a new approved supplement, not a silent
schema change.

| Column | Exact PostgreSQL type | Null/default and contract |
|---|---|---|
| `card_id` | `text` | `NOT NULL PRIMARY KEY`; canonical unsigned decimal controller card ID, `^(0|[1-9][0-9]*)$`. |
| `controller_address` | `text` | `NOT NULL`; lowercase EVM address, FK to a server-owned controller registry if that registry exists; otherwise a validated provenance value, never client supplied. |
| `owner_address` | `text` | `NOT NULL`; lowercase EVM address. |
| `agent_id` | `text` | `NOT NULL`; lowercase non-zero EVM address and FK to the authoritative agent identity relation if materialized. |
| `asset` | `text` | `NOT NULL CHECK (asset = 'native-testnet-ctc')`; maps to `address(0)` on chain. |
| `status` | `text` | `NOT NULL CHECK (status IN ('ISSUED','ACTIVE','SUSPENDED','CLOSED'))`; maps exactly to `CardStatus`. |
| `owner_configured_cap` | `numeric(78,0)` | `NOT NULL`, non-negative uint256 decimal. |
| `per_transaction_limit` | `numeric(78,0)` | `NOT NULL`, non-negative uint256 decimal. |
| `verified_credit` | `numeric(78,0)` | `NOT NULL DEFAULT 0`, non-negative uint256 decimal. |
| `verified_credit_expires_at` | `timestamptz` | Nullable; null or expired means no spendable credit. |
| `spent` | `numeric(78,0)` | `NOT NULL DEFAULT 0`, non-negative uint256 decimal. |
| `expires_at` | `timestamptz` | `NOT NULL`; chain expiry. |
| `policy_version` | `integer` | `NOT NULL CHECK (policy_version >= 0)`; maps to the existing domain/ABI policy version. |
| `allowlist_hash` | `text` | `NOT NULL`; authoritative merchant-allowlist snapshot hash. |
| `source_block` | `bigint` | `NOT NULL CHECK (source_block >= 0)`; chain observation provenance. |
| `source_tx_hash` | `text` | `NOT NULL`; lowercase `0x` transaction hash. |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()`. |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`. |

Required card indexes and constraints are: primary key on `card_id`; partial
unique index `cards_agent_active_uidx` on `(agent_id) WHERE status = 'ACTIVE'`;
indexes `cards_owner_updated_idx` on `(owner_address, updated_at DESC)`,
`cards_agent_updated_idx` on `(agent_id, updated_at DESC)`,
`cards_status_expiry_idx` on `(status, expires_at)`, and
`cards_controller_block_idx` on `(controller_address, source_block)`; checks
for all address formats, uint bounds, status vocabulary, `expires_at >
created_at`, and valid source hash. The partial unique index is the only
active-agent uniqueness mechanism. `is_active_assignment` must not appear in
the future migration, adapter SQL, static tests, or mapping code.

Required foreign-key behavior is exact: `intents.card_id REFERENCES cards(card_id)`;
no guessed/default `agent_id`; `intents.agent_id` is `text NOT NULL` and is
validated equal to `cards.agent_id` in the same insert transaction/RPC. If an
agent identity registry is introduced, both `cards.agent_id` and
`intents.agent_id` may reference its canonical text address key; a UUID FK is
forbidden. Existing `payment_attempts` is unchanged and remains governed by
the original Phase 04 contract.

Lifecycle mapping is: `ISSUED -> ACTIVE`, `ACTIVE -> SUSPENDED`,
`SUSPENDED -> ACTIVE`, and any non-`CLOSED` state -> `CLOSED`; no other
transition is valid. `createOrRecord`, `transitionStatus`, and `close` use
chain event provenance and reject stale source ordering. `ACTIVE` lookup is a
cache lookup only. Payment eligibility still requires a current chain read,
active/non-expired card, matching agent, native asset, allowlisted merchant,
and current policy/hash.

### C. G19 exact migration/static contract

The future implementation filename is exactly
`supabase/migrations/202609120001_persistence_contracts.sql`. It is not created
or modified by this amendment and must not edit
`supabase/migrations/202609080001_sessions_and_intents.sql`.

The future static test path is exactly `supabase/test/schema-static.test.ts` and
the exact command is:

```bash
corepack yarn vitest run supabase/test/schema-static.test.ts
```

The static test must read migration text only and assert: exact filename and
additive ordering; tables `session_challenges`, `intents`, and `cards`; exact
columns and PostgreSQL types; every required `NOT NULL`; `cards.card_id` as
the sole primary key; `intents.card_id` FK to `cards(card_id)`;
`cards_agent_active_uidx` with predicate `status = 'ACTIVE'`; all required
indexes; all address/uint/status/time/hash checks; `intents.agent_id text NOT
NULL`; no UUID agent field; no `is_active_assignment` token; no undefined table,
policy, function, or destructive object; no `DROP TABLE`, `TRUNCATE`, data
destructive operation, or unapproved service-role dependency; and additive
backfill/fail-closed invalid-row behavior. It must also assert that existing
payment/session invariants are not weakened.

The exact pre-EXECUTE RED contract is absent-file RED only: because
`supabase/test/schema-static.test.ts` and the future migration do not yet exist,
the command is expected to return the runner's missing-test-file result
`No test files found` with exit code `1`. This is an expected contract and was
not run or claimed here. After EXECUTE creates the approved files, the same
command must return exit code `0` with the actual Vitest file/test summary;
that GREEN output is future evidence and is not claimed by this amendment.

### D. G20 exact RLS/server-authority contract

> OPTION A AUTHORITY PIN — G20 SOLE AUTHORITY: Option A server-only PostgREST (Option A Amendment §0–§2) is the sole G20 authority for MVP. All prior RPC / `SECURITY DEFINER` / `SECURITY INVOKER` paragraphs in this supplement are SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP (each marked explicitly below). No RPC, `SECURITY DEFINER`, `SECURITY INVOKER`, or `/rest/v1/rpc/*` object is authoritative for MVP.

RLS is enabled on `session_challenges`, `sessions`, `intents`, and `cards`. Direct browser
and public table access is denied. The exact static policy matrix is 16 policies (4 tables × 4 operations):

| Policy name | Table | Operation | Role | `USING` | `WITH CHECK` | Boundary |
|---|---|---|---|---|---|---|
| `session_challenges_deny_public_select` | `session_challenges` | SELECT | `public` | `false` | n/a | no browser/anon read |
| `session_challenges_deny_public_insert` | `session_challenges` | INSERT | `public` | n/a | `false` | no browser insert |
| `session_challenges_deny_public_update` | `session_challenges` | UPDATE | `public` | `false` | `false` | no browser mutation |
| `session_challenges_deny_public_delete` | `session_challenges` | DELETE | `public` | `false` | n/a | no browser delete |
| `sessions_deny_public_select` | `sessions` | SELECT | `public` | `false` | n/a | no browser/anon read |
| `sessions_deny_public_insert` | `sessions` | INSERT | `public` | n/a | `false` | no browser insert |
| `sessions_deny_public_update` | `sessions` | UPDATE | `public` | `false` | `false` | no browser mutation |
| `sessions_deny_public_delete` | `sessions` | DELETE | `public` | `false` | n/a | no browser delete |
| `intents_deny_public_select` | `intents` | SELECT | `public` | `false` | n/a | no browser/anon read |
| `intents_deny_public_insert` | `intents` | INSERT | `public` | n/a | `false` | no browser insert |
| `intents_deny_public_update` | `intents` | UPDATE | `public` | `false` | `false` | no browser mutation |
| `intents_deny_public_delete` | `intents` | DELETE | `public` | `false` | n/a | no browser delete |
| `cards_deny_public_select` | `cards` | SELECT | `public` | `false` | n/a | no browser/anon read |
| `cards_deny_public_insert` | `cards` | INSERT | `public` | n/a | `false` | no browser insert |
| `cards_deny_public_update` | `cards` | UPDATE | `public` | `false` | `false` | no browser mutation |
| `cards_deny_public_delete` | `cards` | DELETE | `public` | `false` | n/a | no browser delete |

There are no public allow policies.

> SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: the RPC/security-definer paragraph immediately below is preserved for history only and is not authoritative for MVP. Authoritative replacement: server writes/reads occur only through Option A server-only PostgREST (Option A §1–§2) with RLS deny; no RPC/`SECURITY DEFINER` is authorized for MVP. `SUPABASE_SERVICE_ROLE_KEY` remains server-only transport (names only, values never in repo) and is not a public/browser role; any change requires a separate security decision and PVL blocker resolution.

Server writes/reads occur only through narrow, server-owned RPC/security-definer operations with fixed arguments,
safe `search_path`, ownership/card-agent checks, and no caller-selected role,
owner, agent, status, policy, source provenance, nonce, or timestamp. The
default implementation must not use `SUPABASE_SERVICE_ROLE_KEY`; service-role
is not a required policy role, not a browser role, and any future use requires
a separate security decision and PVL blocker resolution.

The exact future static RLS test path is
`supabase/test/rls-static.test.ts`, with command:

```bash
corepack yarn vitest run supabase/test/rls-static.test.ts
```

It must assert all 16 deny policies (`session_challenges`/`sessions`/`intents`/`cards` × SELECT/INSERT/UPDATE/DELETE, role `public`, `USING`/`WITH CHECK` as per matrix) with exact policy names/table/operation/role/predicate, RLS enablement on all 4 tables, absence of public allow policies, Option A server-only PostgREST contract with absence of `SECURITY DEFINER`, `SECURITY INVOKER`, and `/rest/v1/rpc/` tokens, absence of a service-role default, explicit rejection of any missing policy (fail-closed on absent name/table/operation), and that browser
inputs cannot select or mutate authority rows. This is static SQL only, not a
Postgres connection or remote parity result. The pre-EXECUTE absent-file RED
and post-EXECUTE actual GREEN distinction is identical to G19 and is not
claimed as run here.

### E. G21 adapter/lifecycle/composition contract

The exact future adapter files are:

- `supabase/functions/_shared/persistence-ports.ts` for the binding port types,
  re-exporting canonical existing types and containing no duplicate domain type.
- `supabase/functions/_shared/session-challenge-store.ts` for the
  `SessionChallengeStore` adapter over the existing `SessionPersistence`
  runtime boundary.
- `supabase/functions/_shared/intent-store.ts` for the server-only
  `IntentStore` adapter.
- `supabase/functions/_shared/card-store.ts` for the server-only `CardStore`
  adapter and cache mapping to `OnChainCardSnapshot`.
- `supabase/functions/_shared/persistence-composition.ts` for explicit fake vs
  PostgREST selection; no environment-based production fallback.
- `supabase/functions/_shared/test/session-challenge-store.vitest.test.ts`,
  `intent-store.vitest.test.ts`, `card-store.vitest.test.ts`, and
  `composition-roots.vitest.test.ts` for the local contract tests.

The exact focused commands are:

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-challenge-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/card-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
```

The G21 RED contract is genuine missing-test-file RED before EXECUTE: each
command must report `No test files found` and exit `1` because these exact future
files are not yet materialized. No RED command has been run or claimed in this
plan amendment. GREEN is the same command after implementation, exit `0` with
actual test counts, and must be recorded separately per file.

G21 tests use deterministic in-memory fakes and a fake PostgREST transport only.
They must prove session hash-only writes, atomic consume/replay/revoke,
intent agent binding and equal/conflicting idempotency, card mapping and
`ISSUED -> ACTIVE -> SUSPENDED -> ACTIVE -> CLOSED`, duplicate-active/stale
event rejection, and executor chain re-read before payment. Fake GREEN is
local adapter evidence only; it is not Supabase, hosted, RPC, OpenAI, or
deployment evidence. Composition tests must prove fake stores are selected only
by Vitest/local factories and PostgREST stores only by the regional/server
composition root; no silent fallback is permitted.

### F. G22 remains HYBRID-ONLY

G22 is a separate, read-only metadata/schema verifier after G18-G21 are green
and after explicit approval. It may inspect only the approved disposable
project metadata, record project/region and a redacted parity result, and stop
on unknown or mismatched schema. It may not migrate, deploy, mutate, access
secrets, call OpenAI/RPC, or run a transaction. An absent verifier result is
`UNKNOWN`, never GREEN. Hard stop before H1-H3: no provider call, H1-H3 approval
handoff, or readiness claim may proceed while schema parity is UNKNOWN.
`corepack yarn test:db` is explicitly prohibited because it runs
`supabase db reset --local`; it must not be used for G22 or this plan-only pass.

G14-G17 remain preserved and constrained by their existing local/fake evidence
and schema prerequisites. G13 remains separate deployment-only provenance.
H1-H3 remain separately approval-gated and are not advanced by G18-G22.

### G. G13 provenance correction

For this amendment, the G13 baseline is **unavailable and noncomparable** to
the current persistence plan: the original failure/success records are
historical artifacts with different scope and must not be used as a baseline
for G18-G22 or post-runtime persistence acceptance. The current record is two
separate append-only records: (1) the preserved historical G13 failure record,
and (2) the preserved historical deployment-only success record, if present.
Neither is rewritten, merged, relabeled, or treated as persistence/schema
proof. A future G13 rerun must append a new immutable record with its exact
commit, plan path, command/output artifact path, and content hashes for the
redacted output. No historical rewrite is permitted.

### H. Full future verification matrix and prohibited commands

After explicit EXECUTE approval only, the full relevant Vitest command is:

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
```

The required static repository commands are:

```bash
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
```

The required Deno 2.9.6 local check/bundle commands, only after future files
exist, are:

```bash
npx --yes deno --version
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/session/deno.json -o /tmp/opencode/session.js supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/ai-gateway/deno.json -o /tmp/opencode/ai-gateway.js supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/agent-executor/deno.json -o /tmp/opencode/agent-executor.js supabase/functions/agent-executor/index.ts
```

These commands are future acceptance commands and have no output claim here.
This amendment's plan-only validation may run only artifact/completeness,
discovery, protocol/wiring, secret-scan, diff-check, and V1-V7 byte-identity
checks. It must not run full Vitest, typecheck, lint, AICD, Deno, migration,
`test:db`, reset, deployment, service/provider/RPC call, or secret access.

### I. Reconciled gate disposition and PVL acceptance

| Gate | Reconciled disposition | Required evidence |
|---|---|---|
| G18 | Binding local/static, NOT RUN in this plan-only pass | Canonical type/port map, exact method contract, no invented domain abstractions, and future static/domain tests. |
| G19 | Binding local/static, NOT RUN in this plan-only pass | Exact migration filename, schema-static RED/GREEN contract, full additive/no-destructive assertions. |
| G20 | Binding local/static, NOT RUN in this plan-only pass | Exact RLS policy matrix and rls-static RED/GREEN contract. |
| G21 | Binding local fake/PostgREST-shaped, NOT RUN in this plan-only pass | Exact adapter/test files, RED/GREEN commands, lifecycle/atomicity/composition assertions. |
| G22 | HYBRID-ONLY, UNKNOWN, hard stop before H1-H3 | Approved read-only metadata verifier only after G18-G21; no `test:db`. |
| G13 | Historical append-only records, baseline unavailable/noncomparable | Future rerun requires immutable commit/path/output/hash record; no historical rewrite. |
| G14-G17 | Preserved | Existing local/fake evidence and prior boundaries remain unchanged. |
| H1-H3 | Preserved separately approval-gated | No readiness or evidence inferred from G18-G22. |

PVL acceptance requires that this amendment is the only edited artifact, all
future commands are explicit and unclaimed, the card schema is exactly the
single-key/uppercase-status/no-`is_active_assignment` model, and no original
V1-V7, Phase 04 report/evidence, or G13 record changes. Net state remains
**CONDITIONAL / READY FOR PVL, NOT READY FOR EXECUTE**.

---

## Final Contract-Reconciliation Amendment -- Authoritative Source Reconciliation (2026-09-12)

**Amendment status:** BLOCKED / READY FOR PVL REVIEW; PLAN ONLY; NOT READY FOR
EXECUTE, migration, reset, deployment, G13, H1-H3, G22, commit, or push.

This amendment is appended only. It does not rewrite V1-V7, Phase 04 history,
G13 evidence, G14-G17, or H1-H3. Earlier proposed contracts that cannot be
tied to an existing declaration are **BLOCKED**, not authoritative. No missing
definition below is inferred from a planned filename, illustrative type, SQL
comment, fake implementation, or prior local evidence.

### 1. Authoritative source-of-truth inventory

| Contract | Exact source/declaration | Exact fields/types/nullability | Authority and disposition |
|---|---|---|---|
| `AgentIntent` | `packages/domain/src/types.ts:1-16`; schema `packages/domain/src/schemas.ts:119-141` | `intentId:string`, `agentId:string`, `cardId:string`, `merchantId:string`, `amountBaseUnits:string`, `asset:"native-testnet-ctc"`, `purpose:string`, `confidence:number`, `provider:"openai"`, `model:string`, `createdAt:string`, `expiresAt:string`, `policyVersion:number`, `intentHash:string`; strict schema fields required | Canonical domain value. No status, owner, request ID, or idempotency field exists. |
| `ChallengeRecord` | `supabase/functions/session/index.ts:38-44` | `nonceHash:string`, `wallet:string`, `message:string`, `expiresAtMs:number`, `consumedAtMs:number|null` | Current runtime authority. No `issuedAtMs` or `revokedAtMs`. |
| `SessionRecord` | `supabase/functions/session/index.ts:46-54` | `id:string`, `tokenHash:string`, `wallet:string`, `role:"user"`, `issuedAtMs:number`, `expiresAtMs:number`, `revokedAtMs:number|null` | Current runtime authority. `token_hash` is session-only. |
| `SessionStore` | `supabase/functions/session/index.ts:56-59` | `challenges: Map<string, ChallengeRecord>`, `sessions: Map<string, SessionRecord>` | Local fake only; not production schema/authority. |
| `SessionPersistence` | `supabase/functions/session/index.ts:61-67` | `insertChallenge(row):Promise<void>`; `consumeChallenge(nonceHash:string):Promise<ChallengeRecord|null>`; `insertSession(row):Promise<void>`; `findSession(tokenHash:string,wallet:string):Promise<SessionRecord|null>`; `revokeSession(tokenHash:string,wallet:string,nowMs:number):Promise<boolean>` | The only existing session persistence port. No second port is authorized. |
| Existing session SQL | `supabase/migrations/202609080001_sessions_and_intents.sql:25-53` | `session_challenges`: `nonce_hash text PK`, `wallet_address text NOT NULL`, `expires_at timestamptz NOT NULL`, `consumed_at timestamptz NULL`, `created_at timestamptz NOT NULL`; `sessions`: `id text PK`, `token_hash text NOT NULL`, `wallet_address text NOT NULL`, `role text NOT NULL`, `issued_at timestamptz NOT NULL`, `expires_at timestamptz NOT NULL`, `revoked_at timestamptz NULL`, `created_at timestamptz NOT NULL` | Existing schema only. Challenge `message`, challenge `issued_at`, and challenge `revoked_at` are absent. |
| Existing intents SQL | `supabase/migrations/202609080001_sessions_and_intents.sql:55-71`; gateway `supabase/functions/ai-gateway/index.ts:42-43` | `intent_id`, `card_id`, `merchant_id`, `amount_base_units`, `asset`, `purpose`, `confidence`, `provider`, `model`, `policy_version`, `intent_hash`, `status`, `request_id`, `created_at`, `expires_at`, all `NOT NULL`; status is unconstrained `text default 'ready'` | Partially authoritative. No `agent_id`, `idempotency_key`, ownership relation, or transition contract. |
| `OnChainCardSnapshot` | `supabase/functions/agent-executor/chain-client.ts:13-18` | `cardId:string`, `agent:string`, `policyVersion:number`, `chainId:number` | Existing chain DTO only; not a complete card row. |
| Solidity `CardStatus`/`Card` | `contracts/src/PactTypes.sol:4-23`; ABI `packages/pact-sdk/src/abi.ts` | `Issued`, `Active`, `Suspended`, `Closed`; card also has owner, agent, asset, caps, credit, expiry, spent, policy version | On-chain authority. No database conversion is declared. |
| Card persistence | No `cards` table, card store, card DTO, or card RPC exists | No authoritative persisted fields, constraints, or indexes | **BLOCKED.** Earlier card schema text is a proposal, not an existing authority. |

No persistence-local `ChallengeRecord`, replacement `SessionPersistence`,
status-bearing `AgentIntent` replacement, UUID `agent_id`, reduced
`CardSnapshot` used as chain authority, or guessed `cards` schema is accepted.

### 2. G18 method-by-method mapping to existing `SessionPersistence`

| Method | Exact args/return and current columns | Not-found/replay/consume/atomicity/error reconciliation | Future RED/GREEN path |
|---|---|---|---|
| `insertChallenge(row)` | `ChallengeRecord`; `Promise<void>`. `nonceHash -> nonce_hash`, `wallet -> wallet_address`, `expiresAtMs -> expires_at`, `consumedAtMs -> consumed_at`; `message` has no SQL column | Duplicate hash is a DB conflict, but no adapter error union exists. One insert only; no session issuance. **BLOCKED** on message/issued-at ownership and error mapping | `supabase/functions/_shared/test/session-persistence.vitest.test.ts` is absent. Future RED is missing-test-file only; future GREEN must prove hash-only insert and exact mapping. |
| `consumeChallenge(nonceHash)` | One `string`; `Promise<ChallengeRecord|null>`. Existing SQL comment returns only `nonce_hash,wallet_address,expires_at` | Predicate is `nonce_hash=$1 AND consumed_at IS NULL`; no expiry/revocation predicate. Runtime consumes before signature verification at `session/index.ts:210-222`. Atomic adapter/RPC is absent. **BLOCKED** on expiry, revocation, returned message, and invalid-signature semantics | Same absent future path. Future GREEN must prove atomic one-consume and second `null`; it cannot claim expiry/revocation. |
| `insertSession(row)` | `SessionRecord`; `Promise<void>`. `id`, `tokenHash`, `wallet`, `role`, `issuedAtMs`, `expiresAtMs`, `revokedAtMs` map to `sessions` | Hash-only row is compatible; duplicate ID, transaction boundary, and errors are undefined. **BLOCKED** for production semantics | Same future session path; RED absent-file, GREEN must prove no plaintext token and one write. |
| `findSession(tokenHash,wallet)` | Two strings; `Promise<SessionRecord|null>`; `token_hash` plus `wallet_address` and remaining session fields | Missing is `null`; wallet mismatch is not separately represented. Expiry/revocation predicates and RPC are undefined. **BLOCKED** | Same future path; GREEN may prove wallet-scoped lookup only. |
| `revokeSession(tokenHash,wallet,nowMs)` | Two strings plus number; `Promise<boolean>`; writes `sessions.revoked_at` | Current fake returns `true` for a match and for no match (`session/index.ts:185-192`); monotonic SQL is undefined. **BLOCKED** on not-found/atomic semantics | Same future path; GREEN must first capture fake behavior, not invent production behavior. |

`message`, `issued_at`, `token_hash`, `consumed_at`, and `revoked_at` are not
substitutes: message is required by verification but absent from the challenge
table; issued_at exists for sessions but not `ChallengeRecord`; token_hash is
session-only; consumed_at is challenge-only; revoked_at is session-only.
**G18 is BLOCKED** until authoritative adapter, error, transaction, and schema
decisions exist.

### 3. G20 exact RPC/security contract and blockers

> SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: this entire §3 RPC/security-definer contract (table + paragraphs below) is preserved for history only. The sole G20 authority for MVP is Option A server-only PostgREST (Option A §0–§2). No RPC name, `SECURITY DEFINER`/`INVOKER`, `search_path`, or dynamic-SQL contract in this section is authoritative.

No schema-qualified SQL function, RPC name, argument declaration, return type,
role grant, ownership predicate, lock clause, safe `search_path`, or dynamic
SQL rule exists in current source. Exact names cannot be invented.

| Required operation | Exact named SQL operation and required contract | Current blocker |
|---|---|---|
| Issue challenge | **UNDEFINED; no successful definition.** Must eventually state server-derived wallet/message/timestamps, args, return, role, ownership, write table, lock, fixed search path, and no dynamic SQL | Only TS `insertChallenge`; no SQL operation. |
| Read challenge | **UNDEFINED; no successful definition.** Must state whether reads are forbidden, exact args/return, role, and ownership | No read RPC or policy. |
| Consume challenge | **UNDEFINED; no successful definition.** Must state atomic update-return, replay/expiry classification, lock, role, table, fixed search path, and no dynamic SQL | Only SQL comment and `CONSUME_PREDICATE` string. |
| Create intent | **UNDEFINED; no successful definition.** Must state canonical args, server identity/idempotency, card-agent verification, return, transaction and lock | `IntentStore.save(intent)` has no persistence implementation; SQL lacks `agent_id` and `idempotency_key`. |
| Read intent | **UNDEFINED; no successful definition.** Must state ID plus authenticated owner/agent scope, return, role, ownership, and lock | No owner relation or RPC. |
| Update intent/status | **UNDEFINED; no successful definition.** Must state status values/transitions, server time, conditional update, return, role, ownership, and errors | `AgentIntent` has no status; SQL status is unconstrained text. |
| Read active card | **UNDEFINED; no successful definition.** Must state controller/agent args, complete DTO, duplicate handling, ownership, lock, and source table | No cards table, DTO, store, or RPC. |
| Lifecycle transition | **UNDEFINED; no successful definition.** Must state Solidity status conversion, legal transitions, event provenance, stale ordering, lock, active uniqueness, return, and role | No persisted card lifecycle source. |
| Ownership verify | **UNDEFINED; no successful definition.** Must state owner/card/agent args, authoritative relation, return, role, lock, and failure mapping | Existing intents has no agent or owner relation. |

Any future `SECURITY DEFINER` function must be schema-qualified, set a safe
fixed `search_path`, revoke public execute/default privileges, derive authority
fields server-side, use explicit locks, forbid dynamic SQL, and map errors to
the approved closed boundary. `SECURITY INVOKER` is not a substitute without
an evidenced authenticated-role/RLS design. Service-role is not a default.
**G20 is BLOCKED** because functions and RLS policies are absent.
[SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: paragraph above preserved for history; G20 BLOCKED-by-missing-RPC cause is resolved by Option A PostgREST contract; remaining BLOCKED causes (if any) are not silently cleared.]

### 4. Intent status resolution

There is no canonical `AgentIntent.status` or `AgentIntentStatus` declaration.

| Surface | Current values/evidence | Resolution |
|---|---|---|
| Gateway response | Literal `status:"ready"` at `supabase/functions/ai-gateway/index.ts:52-53` | Response-only; not domain or DB status. |
| Existing DB | `intents.status text NOT NULL DEFAULT 'ready'` in existing migration | Unconstrained text; no canonical enum. |
| Payment attempt | `pending`, `broadcast`, `settled`, `failed`, `declined` in `supabase/functions/agent-executor/index.ts:67-208` and migration | Payment-attempt lifecycle; not intent lifecycle. |
| Earlier proposed intent port | `ready`, `expired`, `consumed`, `failed` | Not found in an authoritative declaration; **BLOCKED**, not adopted. |

Invalid DB rows cannot be classified or repaired without an approved canonical
status owner and transition table. Future tests must cover unknown status,
approved transitions, expiry, and rejection of client status input.
**G18/G20 remain BLOCKED; no DB value or transition is resolved here.**

### 5. Card DTO, on-chain conversion, and rejection

The exact existing DTO is:

```ts
type OnChainCardSnapshot = {
  cardId: string;
  agent: string;
  policyVersion: number;
  chainId: number;
};
```

Solidity `Card` additionally contains owner, asset, caps, credit, credit
expiry, spent, card expiry, and `CardStatus`, but no current TypeScript decoder
or persisted DTO maps those fields. Solidity enum order is `Issued`, `Active`,
`Suspended`, `Closed`; no DB strings are authoritative. Reject, do not coerce,
unknown enum ordinals, missing fields, wrong types, invalid addresses, invalid
uints, or statuses outside that enum.

There is no exact new DTO path currently authorized. A future adapter DTO, if
approved, must be Phase 04 persistence-local, losslessly mapped from an
authoritative chain read, and never used as payment authority. No final card
schema can be stated without inventing one. **Card conversion is BLOCKED.**

### 6. Final card schema/lifecycle disposition

| Required item | Authoritative current definition | Status |
|---|---|---|
| Table and primary key | No `cards` table or card key declaration | **BLOCKED** |
| Fields/types/nullability/defaults | None persisted; only four-field `OnChainCardSnapshot` and Solidity `Card` | **BLOCKED** |
| Constraints/indexes | None for card persistence | **BLOCKED** |
| Ownership | On-chain `Card.owner`/`Card.agent` authoritative; no persisted relation | **BLOCKED** |
| Lifecycle/active uniqueness | Solidity values only; no database mechanism | **BLOCKED** |
| Authority boundary | Controller/chain read remains authority; cache cannot authorize payment | Boundary resolved; implementation blocked |

The prior proposed card columns, key, uppercase strings, indexes, and active
uniqueness mechanism remain unaccepted planning options and must not be GREEN.

### 7. G19 future static migration test

Future path: `supabase/test/schema-static.test.ts`.

```bash
corepack yarn vitest run supabase/test/schema-static.test.ts
```

The static test must parse only future
`supabase/migrations/202609120001_persistence_contracts.sql` and assert its
approved additive relationship to
`supabase/migrations/202609080001_sessions_and_intents.sql`, exact tables,
columns/types/nullability, checks, indexes, keys, RLS, no destructive SQL, and
no unapproved service-role dependency. It must not assert unresolved status,
card, RPC, or policy definitions as authoritative. Pre-EXECUTE RED is expected
missing-test-file (`No test files found`, exit 1); it was not run. GREEN is
future evidence only. **G19 is BLOCKED**, not RED or GREEN evidence.

### 8. G20 future security test

> SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: the RPC-names paragraph below is preserved for history only. Authoritative G20 static tests are Option A §5 (`rls-static.test.ts` 16-policy deny matrix + `postgrest-contract-static.test.ts` no-RPC assertion). No RPC-name assertion is authoritative for MVP.

Future path: `supabase/test/rls-static.test.ts`.

```bash
corepack yarn vitest run supabase/test/rls-static.test.ts
```

[SUPERSEDED BY OPTION A — NON-AUTHORITATIVE FOR MVP: paragraph below preserved for history; replaced by Option A §5.] After authoritative RPC names exist, this static test must assert exact
schema-qualified names, args/returns, invoker/definer roles, grants/revokes,
safe `search_path`, no dynamic SQL, ownership predicates, lock clauses, write
tables, RLS enablement, and public/anon denial for sessions/intents/cards. It
must prove browser inputs cannot choose authority fields. It must not connect
remotely. Absent-file RED was not run; GREEN is future evidence.
**G20 is BLOCKED** because no RPC or policy names exist to assert.

### 9. G21 adapters and local/remote boundary

Future paths (all currently unmaterialized):

- `supabase/functions/_shared/persistence-ports.ts`
- `supabase/functions/_shared/session-challenge-store.ts`
- `supabase/functions/_shared/intent-store.ts`
- `supabase/functions/_shared/card-store.ts`
- `supabase/functions/_shared/persistence-composition.ts`
- `supabase/functions/_shared/test/session-challenge-store.vitest.test.ts`
- `supabase/functions/_shared/test/intent-store.vitest.test.ts`
- `supabase/functions/_shared/test/card-store.vitest.test.ts`
- `supabase/functions/_shared/test/composition-roots.vitest.test.ts`

Future focused commands:

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-challenge-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/card-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
```

Each missing test is expected RED only as absent-file and was not run. GREEN
must prove the exact session port, hash-only writes, atomic replay/consume,
canonical intent ownership, status rejection, approved card lifecycle, and
fake/PostgREST composition. Fake/local GREEN proves neither Supabase schema,
RLS, RPC, remote parity, nor deployment. **G21 is BLOCKED** pending G18/G20
and missing card/status definitions.

### 10. G22 hybrid-only hard stop

G22 may run only after G18-G21 acceptance and separate hybrid approval. It is
read-only metadata/schema parity; it must record project/region and redacted
parity, stop on unknown/mismatch, and never migrate, deploy, mutate, access
secret values, call OpenAI/RPC, or run a transaction. `corepack yarn test:db`
remains prohibited because it maps to `supabase db reset --local`. Missing
parity is `UNKNOWN`, never GREEN. **G22 is UNKNOWN/BLOCKED and a hard stop
before H1-H3.**

### 11. G13 immutable provenance

The original V1-V7 and G13 records are immutable. Provenance paths:

- Original V1-V7: `phase-04-ai-gateway-executor_PLAN_08-09-26.md`, `### V1`
  through `### V7`.
- Phase 04 report and historical G13/H records:
  `phase-04-ai-gateway-executor_REPORT_08-09-26.md`, especially lines 17-36,
  54-56, 334-365 and Appendix H.
- G13 deployment-only boundary:
  `phase-04-ai-gateway-executor_PLAN_08-09-26.md:814-822` and `:1358-1381`.

No byte, label, result, or status in those records is changed or reinterpreted.
Persistence planning cannot establish G13 success or replace its prior records.

### 12. Exact command matrix and plan-only boundary

| Purpose | Exact command | This pass |
|---|---|---|
| Full Vitest | `corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test` | NOT RUN by instruction |
| Typecheck | `corepack yarn typecheck` | NOT RUN by instruction |
| Lint | `corepack yarn lint` | NOT RUN by instruction |
| AICD | `corepack yarn validate:aicd` | NOT RUN by instruction |
| Secret scan | `node scripts/check-no-secrets.mjs` | Allowed; validation below |
| Diff check | `git diff --check` | Allowed; validation below |
| Deno version/check/bundle | Prior amendment's Deno 2.9.6 commands | NOT RUN by instruction |
| DB/reset/migration | `corepack yarn test:db`, `supabase db reset --local`, migration commands | PROHIBITED; not run |
| Services/secrets/deploy | Supabase, OpenAI, RPC, transaction, deployment, secret access | PROHIBITED; not run |

The full matrix is future acceptance evidence, not current evidence. Only the
explicitly allowed artifact, discovery, wiring, secret, diff, and provenance
checks are eligible in this pass.

### Final reconciled disposition

| Gate | Final status |
|---|---|
| G18 | **BLOCKED**: existing `SessionPersistence` and SQL do not reconcile; intent status and card authority are missing |
| G19 | **BLOCKED**: future migration/static test do not exist; schema authority unresolved |
| G20 | **BLOCKED**: no exact SQL RPC, RLS policy, role, ownership, lock, or search-path declarations |
| G21 | **BLOCKED**: no production adapter, card DTO, status contract, or approved composition |
| G22 | **UNKNOWN / HYBRID-ONLY / HARD STOP** |
| G13 | **Preserved immutable historical provenance; not changed or promoted** |
| G14-G17 | **Preserved**; local/fake evidence does not resolve persistence blockers |
| H1-H3 | **Preserved separately approval-gated; NOT READY** |

**Final status:** BLOCKED / READY FOR PVL REVIEW; NOT READY FOR EXECUTE. This
amendment intentionally leaves unresolved every contract for which the current
repository has no authoritative declaration.

---

## Option A PostgREST Architecture Decision Amendment -- Final Server-Only PostgREST Contract (2026-09-12)

**Amendment status:** READY FOR PVL; PLAN ONLY; NOT READY FOR EXECUTE,
migration, reset, deployment, G13, H1-H3, G22, commit, or push.

**Decision locked:** Option A -- Edge Functions use server-only PostgREST
access. No `SECURITY DEFINER` RPC for MVP.

This amendment is appended only. It does not rewrite, reflow, or normalize
the original V1-V7 Validate Contract in
`phase-04-ai-gateway-executor_PLAN_08-09-26.md`, any Phase 04 history, any
G13 evidence, G14-G17, or H1-H3. It supersedes only the ambiguous
RPC-vs-PostgREST statements above: every prior `SECURITY DEFINER` RPC
requirement for G20 is replaced by the exact server-only PostgREST contract
below. Every prior `is_active_assignment` proposal is rejected. Every prior
BLOCKED disposition for G18-G21 caused solely by missing RPC names is
resolved to a defined PostgREST contract READY FOR PVL; no other BLOCKED
cause is silently cleared. No implementation file, migration, report,
evidence artifact, or historical record is changed by this amendment.

### 0. Option A boundary and secret contract

- Persistence runtime paths in `supabase/functions/session/index.ts`,
  `supabase/functions/ai-gateway/index.ts`,
  `supabase/functions/agent-executor/index.ts`, and
  `supabase/functions/_shared/*-store.ts` plus
  `supabase/functions/_shared/persistence-composition.ts` use server-only
  PostgREST over HTTPS. No other runtime may hold persistence credentials.
- `SUPABASE_SERVICE_ROLE_KEY` is required only by those persistence runtime
  paths. It is configured later via Supabase secret management only
  (dashboard/CLI secrets for the deployed function environment). It never
  appears in source, fixtures, logs, tests, chat, browser, edge
  (`apps/edge/`), web (`apps/web/`), domain (`packages/domain/`), evidence
  artifacts, or committed config. Names only in documentation; `.env.example`
  keeps the value empty by design.
- Public/anon has no direct table access. RLS deny remains: RLS is enabled
  on `session_challenges`, `sessions`, `intents`, and `cards`, with deny-only
  public policies (see G20 static matrix). There is no public allow policy.
- No `SECURITY DEFINER` function, no `SECURITY INVOKER` substitute, no
  `/rest/v1/rpc/*` call, and no `search_path` contract exists for MVP. The
  tokens `SECURITY DEFINER`, `SECURITY INVOKER`, and `/rest/v1/rpc/` must not
  appear in the future migration, adapters, or static tests except in an
  explicit rejection assertion.
- The browser/edge may call only the HTTP session/intent/preflight/execute
  routes. It may not call PostgREST, may not choose `nonce_hash`,
  ownership, role, timestamps, consumed state, revocation state, owner,
  agent, status, policy, source provenance, or active assignment.

### 1. G20 exact server-only PostgREST contract (replaces RPC)

**Exact env inputs (names only, values never in repo):** `SUPABASE_URL`
(`https://<ref>.supabase.co`) and `SUPABASE_SERVICE_ROLE_KEY`. These are
the only persistence-transport inputs. `SUPABASE_ANON_KEY` is not a
persistence input. `SUPABASE_FUNCTION_REGION` and `TARGET_CHAIN_ID` remain
routing/chain-assertion inputs, not transport credentials.

**Allowed tables only:** `session_challenges`, `sessions`, `intents`,
`cards` (future), `payment_attempts` (existing, unchanged; executor-owned).
No other table, view, function, or RPC endpoint is allowed.

**Allowed HTTP methods only:** `GET` (scoped read), `POST` (single-row
insert with `Prefer: return=representation`), `PATCH` (single conditional
update with `Prefer: return=representation`). `DELETE`, `PUT`, `UPSERT`
with client resolution, and any `POST /rest/v1/rpc/*` are forbidden.

**Exact REST paths:**

```text
/rest/v1/session_challenges
/rest/v1/sessions
/rest/v1/intents
/rest/v1/cards
/rest/v1/payment_attempts
```

Query params use PostgREST filters only (`eq.`, `is.`, `gt.`, `lt.`,
`select=`, `limit=`, `order=`). No embedded resources, no full-text
operators, no client-supplied ordering beyond the fixed `order=` values in
§2.

**Selected/updated columns (exact, per operation):**

- Challenge issue `POST`: `nonce_hash`, `wallet_address`, `message`,
  `issued_at`, `expires_at`.
- Challenge consume `PATCH`: set `consumed_at` only; return `nonce_hash`,
  `wallet_address`, `message`, `issued_at`, `expires_at`, `consumed_at`.
- Challenge classify `GET`: `nonce_hash`, `wallet_address`, `expires_at`,
  `consumed_at`, `revoked_at`.
- Session create `POST`: `id`, `token_hash`, `wallet_address`, `role`,
  `issued_at`, `expires_at`.
- Session read `GET`: `id`, `token_hash`, `wallet_address`, `role`,
  `issued_at`, `expires_at`, `revoked_at`.
- Session revoke `PATCH`: set `revoked_at` only; return `id`.
- Intent create `POST`: `intent_id`, `card_id`, `agent_id`, `merchant_id`,
  `amount_base_units`, `asset`, `purpose`, `confidence`, `provider`,
  `model`, `policy_version`, `intent_hash`, `status`, `request_id`,
  `idempotency_key`, `expires_at`.
- Intent read `GET`: all intent columns above for the scoped row.
- Intent mark-status `PATCH`: set `status` (and `updated_at` if the column
  is approved) only; predicate includes `intent_id` plus ownership scope.
- Card record `POST`: all `CardRecord` columns in §4.
- Card read `GET`: all `CardRecord` columns for the scoped row.
- Card transition `PATCH`: set `status`, `source_block`, `source_tx_hash`,
  `updated_at` only.

No adapter may `select=*` outside this list and no adapter may write a
column outside the `POST`/`PATCH` set for that operation.

**Exact headers (server-only):**

```text
apikey: <SUPABASE_SERVICE_ROLE_KEY>
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
Content-Type: application/json
Accept: application/json
Prefer: return=representation
```

Single-object reads additionally send
`Accept: application/vnd.pgrst.object+json`. Mutating requests set an
`AbortController` timeout (see below). No header, log, error, or fixture
may contain a key value; tests assert header names only via a fake
transport.

**Response shapes:**

- Insert/update success: `201`/`200` with a one-element JSON array
  (object form when the single-object `Accept` is used).
- Zero-row conditional update: `200` with `[]`. Empty array is the
  affected-row-count signal: length `1` means applied, length `0` means
  not applied. Array length `>1` on a supposedly single-row predicate is
  `INVALID_ROW` fail-closed.
- Reads: `200` with `[]` (missing) or one-element array (found). More than
  one row on a unique-key read is `INVALID_ROW`, except active-card lookup
  where `>1` is `DUPLICATE_ACTIVE_CARD`.
- Conflict: `409` on primary-key/unique violation (`nonce_hash`,
  `intent_id`, `intent_hash`, `idempotency_key`, `card_id`,
  `cards_agent_active_uidx`). `400` on malformed filter. `401`/`403` on
  credential/RLS failure (fail closed, never retry as anon).

**Error mapping (PostgREST/HTTP to closed union, never raw passthrough):**

| Transport signal | Persistence code (`retryable`) | API surface |
|---|---|---|
| `201`/`200` length 1 | success | success |
| `200` `[]` on consume | `REPLAYED`/`EXPIRED`/`REVOKED` via classify GET (`false`) | `AUTH_INVALID`/`AUTH_EXPIRED` |
| `200` `[]` on scoped read | `null` (missing) | caller maps to `AUTH_INVALID`/`INPUT_INVALID` |
| `200` `[]` on revoke | `false` (already revoked/missing) | `{ revoked: false }` semantics |
| `200` `[]` on mark-status/transition | `NOT_FOUND` or `CONFLICT` via classify GET | stable code |
| `409` duplicate hash/id | `CONFLICT` (`false`); intent idempotency path classifies equal-replay vs `IDEMPOTENCY_CONFLICT` | mapped code |
| `409` on `cards_agent_active_uidx` | `DUPLICATE_ACTIVE_CARD` (`false`) | `CARD_NOT_ELIGIBLE` |
| `400`/invalid row | `INVALID_ROW` (`false`) | `INPUT_INVALID` |
| ownership predicate mismatch | `OWNERSHIP_DENIED` (`false`) | `AUTH_INVALID` |
| `401`/`403` | `UNAVAILABLE` (`false`, alert) | `PROVIDER_UNAVAILABLE`-class mapped error, never raw |
| timeout/network/5xx | `UNAVAILABLE` (`retryable` per §1 retry rule) | retryable mapped error |
| `>1` rows on unique read | `INVALID_ROW` (`false`) | fail closed |

The closed persistence error set remains `NOT_FOUND`, `INVALID_ROW`,
`OWNERSHIP_DENIED`, `REPLAYED`, `EXPIRED`, `REVOKED`,
`IDEMPOTENCY_CONFLICT`, `DUPLICATE_ACTIVE_CARD`, `CONFLICT`, `UNAVAILABLE`.
Adapters map every PostgREST/SQL failure into this set plus the existing
15-code API mapper; raw bodies, headers, and PostgREST error objects never
leave the server boundary.

**Timeout/retry (exact):** one `AbortController` timeout of `5000ms` per
PostgREST request. Mutating `POST`/`PATCH` are attempted once; no automatic
retry except an idempotency-keyed intent `POST` retried once with the
identical key/body on timeout/network failure only. Safe `GET` may retry
once only on `429`/`502`/`503`/timeout with identical params and
correlation ID. Never retry `400`/`401`/`403`/`404`/`409`. Timeout maps to
`UNAVAILABLE` with `retryable` true only for the safe-GET and
identical-key-POST cases; all other timeouts are `UNAVAILABLE` with
`retryable: false` plus an alert-shaped server log (names only).

**Server-only boundary:** PostgREST transport code lives only in
`supabase/functions/_shared/*-store.ts` and
`supabase/functions/_shared/persistence-composition.ts`, injected into the
session/gateway/executor composition roots. `packages/domain`,
`apps/edge`, `apps/web`, test fixtures, logs, and evidence never import,
construct, or record the transport, URL, or key.

### 2. Atomic operations -- exact predicates, counts, no read-then-write race

`<now>` is the server ISO instant for the request. All timestamps are
canonical UTC. Every `PATCH` below is the single authority; any follow-up
`GET` is read-only error classification and never write authority. A
client-side select followed by update is invalid.

- Challenge issue: `POST /rest/v1/session_challenges` body
  `{ nonce_hash, wallet_address, message, issued_at: <issued>,
  expires_at: <issued+5min> }`. `409` means `CONFLICT`; no session issued.
- Challenge consume: `PATCH
  /rest/v1/session_challenges?nonce_hash=eq.<hex>&consumed_at=is.null&revoked_at=is.null&expires_at=gt.<now>`
  body `{ consumed_at: <now> }`, `Prefer: return=representation`. Length
  `1` returns the consumed row. Length `0` returns no session; a scoped
  classification `GET` maps to `REPLAYED` (consumed), `REVOKED`
  (revoked), or `EXPIRED` (expired/missing) and the caller maps replay to
  `AUTH_INVALID`, expired to `AUTH_EXPIRED`, never issuing a session.
- Session create: `POST /rest/v1/sessions` body `{ id, token_hash,
  wallet_address, role: 'user', issued_at: <now>,
  expires_at: <now+30min> }`. One insert; hash-only; `409` is `CONFLICT`.
- Session read: `GET
  /rest/v1/sessions?id=eq.<id>&wallet_address=eq.<lower>&revoked_at=is.null&expires_at=gt.<now>&select=<§1
  columns>`. Length `1` is the row; `0` is `null`; `>1` is `INVALID_ROW`.
- Session revoke: `PATCH
  /rest/v1/sessions?token_hash=eq.<hash>&wallet_address=eq.<lower>&revoked_at=is.null`
  body `{ revoked_at: <now> }`. Length `1` is newly revoked (`true`);
  length `0` is already revoked/missing (`false`). Monotonic
  null-to-timestamp only.
- Intent create: server first resolves the authoritative card row
  (`GET /rest/v1/cards?card_id=eq.<cardId>&select=card_id,agent_id,owner_address,status`),
  rejects on missing/inactive/agent-mismatch, then `POST
  /rest/v1/intents` with the §1 body (`status: 'ready'`). `409` triggers a
  scoped `GET` by `idempotency_key` plus owner/card scope: byte-equal
  canonical/card/agent/authority fields mean replay-safe read; any
  difference means `IDEMPOTENCY_CONFLICT`, never overwrite. Cross-table
  enforcement is fail-closed application ordering plus `UNIQUE
  (intent_hash)`, `UNIQUE (idempotency_key)`, and `FOREIGN KEY
  (card_id) REFERENCES cards(card_id)`; no multi-table REST transaction is
  claimed.
- Intent read: `GET
  /rest/v1/intents?intent_id=eq.<id>&card_id=eq.<serverCard>&agent_id=eq.<serverAgent>&select=<§1
  columns>`. Unscoped or cross-owner/agent read is `OWNERSHIP_DENIED`;
  missing is `null`. The card scope comes from the server card lookup,
  never from client input.
- Intent mark-status: `PATCH
  /rest/v1/intents?intent_id=eq.<id>&card_id=eq.<serverCard>&agent_id=eq.<serverAgent>&status=eq.<from>`
  body `{ status: <to> }` where the only legal transitions are
  `ready -> expired | consumed | failed` (all terminal; no exit from a
  terminal state; no client-chosen status outside this table). Length `1`
  is success; `0` is `NOT_FOUND`/`CONFLICT` via classify `GET`.
- Active-card lookup: `GET
  /rest/v1/cards?agent_id=eq.<lower>&status=eq.ACTIVE&select=<§1 columns>`.
  Count `0` is `null`; `1` is the row; `>1` is `DUPLICATE_ACTIVE_CARD`
  fail-closed.
- Card getById: `GET /rest/v1/cards?card_id=eq.<decimal>` plus at least one
  server identity scope (`owner_address=eq.<lower>` and/or
  `agent_id=eq.<lower>`). Missing is `null`; scope mismatch is
  `OWNERSHIP_DENIED`.
- Lifecycle transition: `PATCH
  /rest/v1/cards?card_id=eq.<id>&status=eq.<from>&source_block=lt.<newBlock>`
  body `{ status: <to>, source_block: <newBlock>,
  source_tx_hash: <newHash>, updated_at: <now> }` with `<from> -> <to>`
  restricted to the §4 lifecycle table. Length `1` is success; `0` is
  `CONFLICT` (illegal transition/stale event/duplicate) or `NOT_FOUND`
  via classify `GET`. Stale `source_block` is always rejected.

### 3. G18 source-exact method-by-method mapping (no substitutes)

The only existing session persistence port is
`SessionPersistence` at `supabase/functions/session/index.ts:61-67`. The
only existing gateway intent port is `IntentStore.save` at
`supabase/functions/ai-gateway/index.ts:42-43`. No second port with the
same responsibility is authorized. Any `SessionChallengeStore` facade is a
named adapter over `SessionPersistence`, never a replacement.

| Existing method | Exact input/return today | Option A PostgREST mapping | Null/error cases |
|---|---|---|---|
| `SessionPersistence.insertChallenge(row: ChallengeRecord)` | `ChallengeRecord` (`nonceHash`, `wallet`, `message`, `expiresAtMs`, `consumedAtMs`) at `session/index.ts:38-44`; `Promise<void>` | §2 challenge-issue `POST`; `message` maps to the future `message` column, `nonceHash -> nonce_hash`, `wallet -> wallet_address`, `expiresAtMs -> expires_at`, server `issued_at` derived at insert | Invalid row `INVALID_ROW`; duplicate hash `CONFLICT`; transport `UNAVAILABLE`; no raw detail |
| `SessionPersistence.consumeChallenge(nonceHash: string)` | One lowercase 64-hex string; `Promise<ChallengeRecord \| null>` | §2 challenge-consume `PATCH` with server `<now>` as both predicate time and `consumed_at` value. A `{ nonceHash, now }` facade input, if used, maps exactly to this call: `nonceHash` is the filter, `now` is the `<now>` instant; it adds no ownership, role, or timestamp authority | `null` for missing/consumed/revoked/expired; caller maps replay to `AUTH_INVALID`, expired to `AUTH_EXPIRED`; no session on `null`; invalid input `INVALID_ROW` |
| `SessionPersistence.insertSession(row: SessionRecord)` | `SessionRecord` (`id`, `tokenHash`, `wallet`, `role: 'user'`, `issuedAtMs`, `expiresAtMs`, `revokedAtMs`) at `session/index.ts:46-54`; `Promise<void>` | §2 session-create `POST`; hash-only; `tokenHash -> token_hash` | Invalid `INVALID_ROW`; duplicate id `CONFLICT`; transport `UNAVAILABLE` |
| `SessionPersistence.findSession(tokenHash: string, wallet: string)` | Two strings; `Promise<SessionRecord \| null>` | §2 session-read `GET` with `token_hash` (or `id` per approved key) plus `wallet_address` scope and `revoked_at is null` / `expires_at gt <now>` predicates | Missing/expired/revoked `null`; wallet mismatch `null` classified as `OWNERSHIP_DENIED` by caller contract; `>1` rows `INVALID_ROW` |
| `SessionPersistence.revokeSession(tokenHash: string, wallet: string, nowMs: number)` | Two strings plus number; `Promise<boolean>`; current fake returns `true` even on no match at `session/index.ts:185-192` | §2 session-revoke `PATCH`; production semantic is `true` only for a newly revoked row, otherwise `false`; EXECUTE must capture the fake behavior in a test before enforcing the stricter production semantic | Invalid `INVALID_ROW`; DB failure `UNAVAILABLE` |
| `IntentStore.save(intent: AgentIntent)` | Canonical `AgentIntent` at `packages/domain/src/types.ts:1-16`; `Promise<void>` | §2 intent-create `POST` after server card/agent resolution; `agentId` is the EVM address string, `cardId` canonical decimal text, asset `native-testnet-ctc`; adapter never recomputes the canonical hash | Equal-idempotency replay is a safe read; differing canonical/card/agent fields `IDEMPOTENCY_CONFLICT`; invalid `INVALID_ROW`; owner mismatch `OWNERSHIP_DENIED` |
| `StoredIntent` / `AttemptRecord` / `ExecutorStore` / `PaymentClient` / `ReadOnlyRpcPaymentClient` | `agent-executor/index.ts:24-48`, `chain-client.ts:13-43,45-94` | Unchanged authorities; persistence supplement adds no second executor store and no signer path; `payment_attempts` first-claim/row-lock/store-before-wait/reconcile pins remain verbatim | Any weakening is a hard stop |

All port calls receive server-normalized values only. Raw nonce,
signature, bearer token, client-selected owner/agent/card/asset/recipient,
private key, provider body, and database payload are never port inputs or
outputs. `message`, `issued_at`, `token_hash`, `consumed_at`, and
`revoked_at` are not substitutes for one another.

### 4. Card authority, exact CardRecord, mapping, lifecycle, ownership, lookup

Contract authority: `PactCardController` plus `PactTypes.sol:4-23` and the
generated ABI at `packages/pact-sdk/src/abi.ts` are authoritative for
`card_id`, on-chain status, credit, and spending. The DB `CardRecord` is an
operational metadata index for server lookups. `OnChainCardSnapshot` at
`supabase/functions/agent-executor/chain-client.ts:13-25` is the chain
projection for gateway/executor reads and is not required to be lossless.
Three separate types exist and must not be merged: Solidity `Card`
(authority), `OnChainCardSnapshot` (projection), `CardRecord` (DB index
DTO, Phase 04 persistence-local only, never in `packages/domain`).

Explicit Solidity `CardStatus` mapping (only valid rows; unsupported
rejected, never coerced):

| Solidity enum (ordinal) | DB `status` | Notes |
|---|---|---|
| `Issued (0)` | `ISSUED` | Created, not yet active |
| `Active (1)` | `ACTIVE` | Only status eligible for payment with all other checks |
| `Suspended (2)` | `SUSPENDED` | Temporarily ineligible |
| `Closed (3)` | `CLOSED` | Terminal; no exit |

Unknown ordinals, missing fields, wrong types, invalid addresses/uints,
lowercase statuses (`issued`, `active`, ...), additional statuses, and any
DB-to-chain status override are rejected with `INVALID_ROW`. The DB must
not override the chain: payment eligibility always re-reads chain state
(active/non-expired card, matching agent, native asset, allowlisted
merchant, current policy/hash); a DB `ACTIVE` row alone never authorizes
payment.

Exact `CardRecord` fields (future `cards` table; additive migration only):

| Column | PostgreSQL type | Null/default and contract |
|---|---|---|
| `card_id` | `text` | `NOT NULL PRIMARY KEY`; canonical unsigned decimal `^(0\|[1-9][0-9]*)$` |
| `controller_address` | `text` | `NOT NULL`; lowercase EVM `^0x[0-9a-f]{40}$`; provenance value, never client supplied |
| `owner_address` | `text` | `NOT NULL`; lowercase EVM address |
| `agent_id` | `text` | `NOT NULL`; lowercase non-zero EVM address; equals `AgentIntent.agentId` lowercased |
| `asset` | `text` | `NOT NULL CHECK (asset = 'native-testnet-ctc')`; chain maps to `address(0)` |
| `status` | `text` | `NOT NULL CHECK (status IN ('ISSUED','ACTIVE','SUSPENDED','CLOSED'))` |
| `owner_configured_cap` | `numeric(78,0)` | `NOT NULL`, non-negative uint256 decimal |
| `per_transaction_limit` | `numeric(78,0)` | `NOT NULL`, non-negative uint256 decimal |
| `verified_credit` | `numeric(78,0)` | `NOT NULL DEFAULT 0`, non-negative uint256 decimal |
| `verified_credit_expires_at` | `timestamptz` | Nullable; null/expired means no spendable credit |
| `spent` | `numeric(78,0)` | `NOT NULL DEFAULT 0`, non-negative uint256 decimal |
| `expires_at` | `timestamptz` | `NOT NULL`; chain card expiry |
| `policy_version` | `integer` | `NOT NULL CHECK (policy_version >= 0)` |
| `allowlist_hash` | `text` | `NOT NULL`; authoritative merchant-allowlist snapshot hash |
| `source_block` | `bigint` | `NOT NULL CHECK (source_block >= 0)`; chain provenance |
| `source_tx_hash` | `text` | `NOT NULL`; lowercase `0x` transaction hash |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

`OnChainCardSnapshot` fields (existing, unchanged): `cardId: string`,
`agent: string`, `policyVersion: number`, `chainId: number`. Mapping to
`CardRecord`: `cardId -> card_id`, `agent (checksum or lower) ->
agent_id (lowercase)`, `policyVersion -> policy_version`, `chainId`
asserts against `TARGET_CHAIN_ID` and selects `controller_address`; the
projection is not lossless and full `Card` fields (owner, caps, credit,
expiry, spent, status) arrive only from the authoritative chain read.

Lifecycle table (only valid transitions; event-provenance required):

```text
ISSUED -> ACTIVE
ACTIVE -> SUSPENDED
SUSPENDED -> ACTIVE
ISSUED|ACTIVE|SUSPENDED -> CLOSED (terminal)
```

No other transition is valid. `createOrRecord` is idempotent on
`(card_id, source_tx_hash)` event identity. `transitionStatus` and `close`
enforce the table plus `source_block` monotonicity in the §2 `PATCH`
predicate. `close` is a transition to `CLOSED`, not a delete.

Ownership predicates: card reads are scoped by at least one server
identity (`owner_address` and/or `agent_id`); intent operations additionally
scope by `card_id` plus the server-resolved card agent/owner; no anonymous
or browser-wide lookup exists. No client may set owner, agent, status,
policy, source provenance, or assignment.

Lookup/index (exact): primary key on `card_id`; partial unique index
`cards_agent_active_uidx ON (agent_id) WHERE status = 'ACTIVE'` as the only
active-assignment guard; indexes `cards_owner_updated_idx ON
(owner_address, updated_at DESC)`, `cards_agent_updated_idx ON (agent_id,
updated_at DESC)`, `cards_status_expiry_idx ON (status, expires_at)`,
`cards_controller_block_idx ON (controller_address, source_block)`; checks
for address format, uint bounds, status vocabulary, `expires_at >
created_at`, valid source hash, and non-negative policy. `FOREIGN KEY
(intents.card_id) REFERENCES cards(card_id)`; `intents.agent_id text NOT
NULL` validated equal to `cards.agent_id` in the §2 ordering. No
`is_active_assignment` column, no composite primary key, no UUID agent
field, no `now()` index predicate.

Rejected alternatives (must not appear): composite `(controller_address,
card_id)` primary key, `is_active_assignment` boolean plus its partial
index, lowercase status strings, UUID `agent_id`, guessed/default agent,
plaintext nonce/signature/bearer columns, client authority fields, silent
backfill loss, destructive rollback, and any `SECURITY DEFINER`/`INVOKER`
or RPC object.

### 5. G19/G20 static tests -- exact files, commands, RED/GREEN

Future files (all currently unmaterialized; `supabase/test/` does not yet
exist):

- `supabase/migrations/202609120001_persistence_contracts.sql` (additive
  only; must not edit `202609080001_sessions_and_intents.sql`).
- `supabase/test/schema-static.test.ts` (G19: migration structure).
- `supabase/test/rls-static.test.ts` (G20 RLS deny matrix).
- `supabase/test/postgrest-contract-static.test.ts` (G20 PostgREST
  contract, no-RPC assertion).

Exact commands:

```bash
corepack yarn vitest run supabase/test/schema-static.test.ts
corepack yarn vitest run supabase/test/rls-static.test.ts
corepack yarn vitest run supabase/test/postgrest-contract-static.test.ts
```

Assertions: exact filename and additive ordering; tables
`session_challenges`, `sessions`, `intents`, `cards` (plus unchanged
`payment_attempts`); exact columns/types/`NOT NULL`; `cards.card_id` as
sole primary key; `intents.card_id` FK to `cards(card_id)`;
`cards_agent_active_uidx` with predicate `status = 'ACTIVE'`; all §4
indexes/checks; `intents.agent_id text NOT NULL`; RLS enabled on all 4 tables with all
16 deny-only policies (`session_challenges`/`sessions`/`intents`/`cards` × SELECT/INSERT/UPDATE/DELETE, role `public`, `USING`/`WITH CHECK` as per G20 matrix) asserted by exact policy-name/table/operation/role/predicate and zero
public allow policies with explicit rejection of any missing policy (fail-closed on absent name/table/operation); PostgREST env/method/path/column/header contract
per §1; absence of the tokens `SECURITY DEFINER`, `SECURITY INVOKER`,
`/rest/v1/rpc/`, and `is_active_assignment`; absence of `DROP TABLE`,
`TRUNCATE`, destructive operations, UUID agent fields, and unapproved
service-role dependencies; backfill fail-closed invalid-row behavior. The
tests parse migration/adapter text only and never connect to Postgres.

RED/GREEN: pre-EXECUTE RED is genuine absent-file RED only -- each command
reports the runner result `No test files found` with exit `1` because the
exact future files do not yet exist. This RED was not run or claimed here.
Post-EXECUTE GREEN is the same command with exit `0` and the actual Vitest
file/test summary, recorded separately per file. Static GREEN never proves
remote parity, deployment, or H-readiness.

### 6. G21 adapter tests -- exact files, commands, fake PostgREST local-only

Exact future adapter files:

- `supabase/functions/_shared/persistence-ports.ts` (binding port types,
  re-exporting canonical types, no duplicate domain type).
- `supabase/functions/_shared/session-challenge-store.ts` (PostgREST
  adapter over `SessionPersistence`).
- `supabase/functions/_shared/intent-store.ts` (server-only PostgREST
  `IntentStore` adapter).
- `supabase/functions/_shared/card-store.ts` (server-only PostgREST
  `CardStore` adapter plus `CardRecord` mapping).
- `supabase/functions/_shared/persistence-composition.ts` (explicit fake
  vs PostgREST selection; no environment-based production fallback).

Exact future test files and commands:

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-challenge-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/card-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
```

G21 tests use deterministic in-memory fakes and a fake PostgREST transport
only. The fake records request method/path/body/headers-by-name and proves
the §1/§2 atomic shapes (conditional `PATCH`, affected-count handling,
conflict mapping, ownership scope, timeout/retry rule); it never calls
Supabase. Tests prove hash-only writes, atomic consume/replay/revoke,
intent agent binding with equal/conflicting idempotency, card mapping with
`ISSUED -> ACTIVE -> SUSPENDED -> ACTIVE -> CLOSED`, duplicate-active and
stale-event rejection, executor chain re-read before payment, and fake-only
vs PostgREST-only composition selection. RED is missing-test-file
(`No test files found`, exit `1`), not run here. GREEN is exit `0` with
actual counts after EXECUTE. Fake GREEN is local adapter evidence only; it
is not Supabase, hosted, RPC, OpenAI, deployment, or parity evidence, and
no remote parity claim may be inferred.

### 7. G22 HYBRID-ONLY -- acceptable read-only evidence and hard stop

G22 runs only after G18-G21 are green and under a separate explicit hybrid
approval naming the disposable project. Acceptable evidence is read-only
metadata only: the approved project ref/region, table presence via
read-only `information_schema` or `GET /rest/v1/<table>?select=<key>&limit=1`
with the lane-scoped credential, and a redacted column/index/RLS-presence
checklist. It records project/region plus match/mismatch per table and
stops on unknown or mismatched schema. It must not migrate, deploy,
mutate, access secret values beyond the lane credential, call OpenAI/RPC,
run a transaction, reset, or write evidence containing secrets, tokens, or
raw bodies. `corepack yarn test:db` is explicitly prohibited because it
runs `supabase db reset --local`; `supabase db reset`, `db push`, and any
mutation remain out of scope. Missing verifier output is `UNKNOWN`, never
GREEN. While parity is `UNKNOWN`, H1-H3 approval handoff, provider calls,
and readiness claims are hard-stopped.

G14-G17 remain preserved with their local/fake evidence and schema
prerequisites. G13 remains separate deployment-only provenance. H1-H3
remain separately approval-gated and are not advanced by G18-G22.

### 8. Staging secret contract and immutable provenance

Staging secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, plus the
existing lane names) are provisioned later by the operator via Supabase
secret management (dashboard/CLI) in the disposable/staging project only.
They are never written to source, fixtures, tests, logs, evidence, chat,
or browser bundles. Validation records names and redacted digests only;
any secret-shaped value in a diff, fixture, or artifact is a hard stop.

Provenance refs (immutable, byte-preserved):

- Original V1-V7: `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`,
  `### V1` through `### V7` (HEAD lines 436–511, byte-identical; V1-V7 text, G13 provenance, history, and impl/migrations preserved unchanged).
  - Baseline commit: `a23d5b8a979103c09dbb534f8563817f943180d0` (`docs(phase-04): close AI gateway and executor phase`).
  - Baseline source: committed blob `a23d5b8a979103c09dbb534f8563817f943180d0:process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`, range `sed -n '436,511p'` (from `### V1 — Pre-check` heading through V7 body `Hybrid H1–H3 require a second explicit approval.`, exclusive of trailing `What This Coverage Does NOT Prove` / Net gate / Hard stops).
  - Full 64-char SHA-256: `8241c2256fc9948193cd1f87e9f19660152ee93c687f157d1e1af6102428b6d0`.
  - Reproduction: `git show a23d5b8a979103c09dbb534f8563817f943180d0:process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md | sed -n '436,511p' | sha256sum` must print the hash above.
  - Superseded invalid value: `f288ee56b25c9dd9` (16-hex truncated, nonexistent in repo history, no commit/path source) is rejected and replaced by the hash above. If reproduction fails, disposition remains BLOCKED, never invented. Staged working-tree docs were not used as baseline.
- Phase 04 report/G13 history:
  `phase-04-ai-gateway-executor_REPORT_08-09-26.md` lines 17-36 (bundle
  supplement EVL), 54-56 (bare-ethers failure preserved, G13/H NOT RUN),
  334-365 (G14-G17 EVL green record with post-runtime G13 redeploy
  pending).
- Existing authorities: `packages/domain/src/types.ts:1-16`
  (`AgentIntent`), `supabase/functions/session/index.ts:38-67`
  (`ChallengeRecord`, `SessionRecord`, `SessionStore`,
  `SessionPersistence`), `supabase/functions/ai-gateway/index.ts:42-43`
  (`IntentStore.save`), `supabase/functions/agent-executor/chain-client.ts:13-25`
  (`OnChainCardSnapshot`), `contracts/src/PactTypes.sol:4-23`
  (`CardStatus`/`Card`), `supabase/migrations/202609080001_sessions_and_intents.sql:25-96`
  (existing schema, no RLS/RPC).
- A future G13 rerun must append a new immutable record with its exact
  commit SHA, plan path, command/output artifact path, and sha256 content
  hashes for the redacted output. No historical rewrite, merge, relabel,
  or reinterpretation is permitted. Staged working-tree docs must not be
  used as a baseline via HEAD comparison; the baseline is the committed
  section/content hash recorded at PVL time.

### 9. Reconciled gate disposition and PVL acceptance

| Gate | Reconciled disposition | Required evidence |
|---|---|---|
| G18 | Defined server-only PostgREST port/mapping contract, READY FOR PVL, NOT RUN here | §3 source-exact map, §1/§2 atomic/error semantics, no substitutes, future adapter tests |
| G19 | Binding local/static, READY FOR PVL, NOT RUN here | Exact migration filename, §4/§5 schema-static RED/GREEN, additive/no-destructive assertions |
| G20 | Binding local/static server-only PostgREST + RLS deny, READY FOR PVL, NOT RUN here | §1 exact env/method/path/column/header/shape/error/timeout contract, RLS deny matrix, postgrest-contract-static RED/GREEN, no RPC/DEFINER |
| G21 | Binding local fake PostgREST-shaped, READY FOR PVL, NOT RUN here | §6 exact adapter/test files, RED/GREEN commands, lifecycle/atomicity/composition assertions |
| G22 | HYBRID-ONLY, UNKNOWN, hard stop before H1-H3 | §7 approved read-only metadata verifier only after G18-G21; no `test:db` |
| G13 | Historical append-only records, baseline preserved/noncomparable for persistence | Future rerun requires immutable commit/path/output/hash record; no rewrite |
| G14-G17 | Preserved | Existing local/fake evidence and prior boundaries unchanged |
| H1-H3 | Preserved separately approval-gated | No readiness or evidence inferred from G18-G22 |

PVL acceptance requires that this amendment is the only edited artifact,
all future commands are explicit and unclaimed, the card model is exactly
the single-key/uppercase-status/no-`is_active_assignment` model with
contract-authoritative mapping, the transport is exactly server-only
PostgREST with RLS deny and no RPC/DEFINER, and no original V1-V7, Phase 04
report/evidence, or G13 record changes. Net state remains **CONDITIONAL /
READY FOR PVL, NOT READY FOR EXECUTE**.

**Preservation statement:** original V1-V7 bytes unchanged; Phase 04
plan/report histories unchanged except additive supplements; G13
failure/success records preserved; G14-G17 local evidence preserved as
local-only; H1-H3 NOT RUN; no remote parity, deployment, migration, reset,
secret, provider, RPC, transaction, commit, or push performed or claimed by
this amendment.

---

## EVL Closeout Amendment -- Option A Persistence Foundation GREEN (2026-09-12)

**Amendment status:** EVL GREEN (local/static only) — OPTION A PERSISTENCE
FOUNDATION CLOSEOUT COMPLETE. PLAN ONLY FOR CLOSEOUT; NOT A STAGING
MIGRATION, G13, G22, H1-H3, DEPLOYMENT, RESET, SECRET, PROVIDER, RPC,
TRANSACTION, COMMIT, OR PUSH AUTHORIZATION.

This amendment is appended only. It does not rewrite, reflow, append to, or
normalize the original V1-V7 Validate Contract in
`phase-04-ai-gateway-executor_PLAN_08-09-26.md`, any original G13
failure/success evidence, G14-G17 records, H1-H3 records, or any prior
amendment text above. Prior BLOCKED/READY-FOR-PVL dispositions above are
preserved as historical planning records; the reconciled EVL disposition
below is the current closeout state.

### 1. Recorded EVL GREEN (reported persistence-foundation evidence)

- Focused persistence suites: **7 files / 49 tests GREEN**.
- Full relevant Vitest: **29 files / 171 tests GREEN**.
- G18 GREEN; G19 GREEN; G20 **16/16 GREEN**; G21 GREEN (recorded as
  `G18/G19/G20 16/16/G21 GREEN` per EVL handoff).
- G22 **UNKNOWN / HYBRID-ONLY** (no remote parity claimed).
- G1-G6/G8 GREEN; G7 CI-only/non-binding; G12a 6/6 GREEN; G12b GREEN under
  Deno `2.9.6` (`3+3` per-function check/bundle).
- `typecheck` / `lint` / `validate:aicd` GREEN.
- Secret scan **989 scanned / 0 findings**; `git diff --check` GREEN.
- No `deno.lock`; signer (`AGENT_SIGNER_PRIVATE_KEY`) absent by name.
- V1 staleness is **doc-only** (no code/behavior claim; no V1 rewrite).

### 2. Migration and staging boundary (CRITICAL)

- Future migration `supabase/migrations/202609120001_persistence_contracts.sql`
  is **created/static-only, NOT applied**. No `supabase db reset`, `db push`,
  migration execution, or remote mutation occurred or is claimed.
- Staging is **unchanged**; current staging does not reflect the new
  persistence foundation.
- G13 evidence is **preserved but predates the foundation**: the historical
  G13 failure record and the historical deployment-only success record remain
  byte-identical and are not relabeled as persistence/schema proof.
- Required next: **post-foundation migration + G13 redeploy under separate
  explicit staging approval before H1-H3**. H1-H3 remain gated and NOT RUN.
- Remote schema parity is **UNKNOWN / HYBRID-ONLY**; G22 remains the sole
  hybrid-only parity lane and is a hard stop before H1-H3.

### 3. Preservation and provenance

- V1-V7 preserved (baseline commit
  `a23d5b8a979103c09dbb534f8563817f943180d0`, range `sed -n '436,511p'`,
  SHA-256 `8241c2256fc9948193cd1f87e9f19660152ee93c687f157d1e1af6102428b6d0`).
- G13 failure/success histories preserved; no merge, relabel, or
  reinterpretation as persistence proof.
- G14-G17 local/fake evidence preserved as local-only; it does not resolve
  persistence blockers and is not promoted to remote parity.
- Option A remains the sole MVP transport authority: server-only PostgREST
  with RLS deny; no RPC / `SECURITY DEFINER` / `SECURITY INVOKER` /
  `/rest/v1/rpc/*` object is authoritative for MVP.
- No implementation file was modified by this closeout amendment; no
  deployment, migration execution, DB reset, OpenAI/RPC call, secret access,
  commit, or push was performed or is claimed here.

### 4. Reconciled closeout disposition

| Gate | Closeout disposition |
|---|---|
| G18-G21 | **GREEN (local/static + fake-PostgREST-shaped)**; foundation closeout complete |
| G22 | **UNKNOWN / HYBRID-ONLY**; hard stop before H1-H3 |
| G13 | **Preserved; predates foundation**; post-foundation redeploy required under separate approval |
| G14-G17 | **Preserved** local-only |
| H1-H3 | **Gated; NOT RUN**; require post-foundation migration + G13 redeploy first |
| Remote | **UNKNOWN / HYBRID-ONLY**; staging unchanged |

**Next valid states (separate explicit approvals required):** staging
migration approval for `202609120001_persistence_contracts.sql`; G13 staging
redeploy approval; G22 hybrid-only parity lane; H1-H3 hybrid lanes. No
implicit advance is authorized by this closeout.
