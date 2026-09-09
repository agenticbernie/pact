---
name: plan:pact-mvp-phase-05-indexer-read-model
description: "Pact — Phase 05: Supabase read model, event indexer, receipt truth, and observability"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-05
---

# Phase 05 — Indexer, Read Model & Receipt Truth

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–5 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 05 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build an idempotent Supabase read model and target-chain indexer that lets Pact display cards, evidence, activity, and receipts without ever becoming a payment-authority source.

**Architecture:** The indexer polls confirmed Creditcoin logs from a persisted cursor, decodes only known Pact/ASC events, and upserts by chainId + txHash + logIndex. Read APIs combine indexed data with a latest-confirmed-block marker; settled is displayed only when a successful receipt and matching PaymentSettled event are both present.

**Tech Stack:** Supabase Postgres/migrations, Supabase Edge Functions/Deno, ethers v6, TypeScript, Vitest, local Supabase CLI.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- On-chain state remains authoritative for card policy, credit, merchant, pool, and payment.
- The read model is derived data; it cannot authorize, settle, increase credit, or override a contract result.
- Preserve Phase 04 session/token-hash and intent attribution columns; do not store bearer tokens or raw secrets.
- Event uniqueness is chainId + txHash + logIndex; reprocessing a block range must be safe.
- Index only confirmed target-chain logs and record cursor/block hash; show pending/uncertain when receipt or event evidence is incomplete.
- Read endpoints must not expose private keys, raw prompts containing secrets, provider response bodies, raw proof blobs, or database credentials.
- Schema migrations run against local disposable Supabase only in this phase; live migration requires a later explicitly approved lane.
- Every log includes requestId/intentId/paymentId/cardId/evidenceId/txHash where available and redacts sensitive fields.

---

## Overview

Phase 04 can execute a payment, but the user still needs a trustworthy view of what happened. This phase creates the database schema, indexer cursor, known-event decoder, read APIs, and observability records. It also makes receipt truth explicit: a client response or database row alone can never produce the final SETTLED state.

## Entry Gate

- Phase 04 API and contract event envelopes are committed.
- Read process/context/all-context.md and process/context/tests/backend-tests.md.
- Phase 04 migration exists and local Supabase can reset from a clean checkout.
- packages/pact-sdk contains controller, pool, merchant, and ASC ABIs.
- No production Supabase URL or service-role key is used by tests.

## Phase Loop Progress

- [ ] 1. RESEARCH — inspect Phase 04 migrations/events, SDK ABIs, Supabase local behavior, and expected indexer failure history
- [ ] 2. INNOVATE — choose append-only event ledger plus current read projections; record rejected database-authority and non-idempotent options
- [ ] 3. PLAN-SUPPLEMENT — update migration/indexer touchpoints if event ABI or Supabase constraints differ
- [ ] 4. PVL — vc-validate-agent writes V1–V7 contract with local DB, indexer, read API, and receipt gates
- [ ] 5. EXECUTE — complete Tasks 1–5 and run each section gate immediately
- [ ] 6. EVL — reset local DB, replay logs, test dedupe/cursor/errors, and run Phase 04 regression
- [ ] 7. UPDATE PROCESS — write report, update umbrella/downstream UI plan, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Add the read-model schema without weakening Phase 04 auth

**Files:** Create supabase/migrations/202609080002_read_model.sql, supabase/migrations/202609080003_read_model_indexes.sql, supabase/test/schema.test.ts, docs/runbook/local-database.md. Modify Phase 04 migration only if a backward-compatible foreign key is required.

**Tables and invariants:**

~~~sql
create table public.chain_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null,
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  block_hash text not null,
  event_type text not null,
  payload jsonb not null,
  payload_hash text not null,
  indexed_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

create table public.indexer_state (
  chain_id bigint primary key,
  next_block bigint not null,
  latest_confirmed_block bigint not null,
  latest_block_hash text,
  updated_at timestamptz not null default now()
);
~~~

- [ ] 1.1. Write schema tests that reset local DB, apply migrations, and assert tables/indexes exist.
- [ ] 1.2. Add cards_read_model, agents, payments, credit_evidence, proof_attempts, system_logs, deployment_config, and merchant_catalog tables; keep intents from Phase 04 and add foreign keys by intentId/cardId where safe.
- [ ] 1.3. Add chain_events unique key, indexer_state cursor, payment unique intent/card nonce, evidence unique sourceTxHash/evidenceId, and timestamps.
- [ ] 1.4. Add RLS that denies direct anonymous writes; the read API uses service role server-side and returns filtered fields.
- [ ] 1.5. Add a view or query contract that exposes payment settlementProofStatus = receipt_confirmed + indexed_payment_event, not a client-provided status.
- [ ] 1.6. Run local migration tests.

Run: supabase start && supabase db reset --local && deno test --allow-env --allow-net --allow-read supabase/test/schema.test.ts  
Expected: all migrations apply and schema assertions pass.

- [ ] 1.7. Commit migration and database runbook.

### Task 2 — Implement confirmed-log cursor and idempotent decoder

**Files:** Create supabase/functions/indexer/types.ts, chain-reader.ts, cursor-store.ts, event-decoder.ts, indexer.ts, test/indexer.test.ts, test/event-decoder.test.ts.

**Stable interfaces:**

~~~typescript
type IndexerCursor = {
  chainId: number;
  nextBlock: bigint;
  latestConfirmedBlock: bigint;
  latestBlockHash?: string;
};

interface ChainReader {
  latestBlock(): Promise<bigint>;
  getLogs(fromBlock: bigint, toBlock: bigint): Promise<ReadonlyArray<ChainLog>>;
  getReceipt(txHash: string): Promise<ReceiptResult | null>;
}

interface CursorStore {
  load(chainId: number): Promise<IndexerCursor>;
  save(cursor: IndexerCursor): Promise<void>;
  upsertEvent(event: DecodedPactEvent): Promise<"inserted" | "duplicate">;
}
~~~

- [ ] 2.1. Write decoder tests for CardCreated, CreditVerified/CardCreditUpdated, PaymentSettled, MerchantPaymentReceived, lifecycle events, unknown event, malformed topics, and wrong contract address.
- [ ] 2.2. Write indexer tests for confirmation depth, empty ranges, partial RPC failure, cursor resume, duplicate log replay, and block-hash mismatch.
- [ ] 2.3. Run focused tests before implementation; expect missing-module failures.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/indexer/test/indexer.test.ts supabase/functions/indexer/test/event-decoder.test.ts  
Expected: FAIL before indexer modules exist.

- [ ] 2.4. Implement the decoder with ethers Interface and the generated SDK ABIs; accept events only from configured controller/pool/merchant/ASC addresses.
- [ ] 2.5. Implement confirmation window from INDEXER_CONFIRMATIONS, scan up to latestBlock - confirmations, and advance cursor only after every log in the range is persisted.
- [ ] 2.6. Upsert chain_events by chainId/txHash/logIndex; derive payment/evidence/card projections from the event and use deterministic payload hashes.
- [ ] 2.7. On RPC failure, keep nextBlock unchanged, record redacted error, and retry on the next tick; on block-hash mismatch, rewind by configured reorg window and reprocess idempotently.
- [ ] 2.8. Run decoder/indexer tests and typecheck.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/indexer/test/indexer.test.ts supabase/functions/indexer/test/event-decoder.test.ts && yarn typecheck  
Expected: PASS.

- [ ] 2.9. Commit indexer modules/tests.

### Task 3 — Build receipt reconciliation and read API

**Files:** Create supabase/functions/read-api/index.ts, receipt-reconciler.ts, test/read-api.test.ts, test/receipt-reconciler.test.ts, packages/domain/src/read-model.ts, packages/domain/test/read-model.test.ts.

**Routes:**

~~~text
GET /v1/config
GET /v1/cards/:cardId
GET /v1/cards/:cardId/activity
GET /v1/payments/:paymentId
~~~

**Receipt state:**

~~~typescript
type ReceiptTruth = {
  status: "pending" | "declined" | "failed" | "settled" | "uncertain";
  receiptConfirmed: boolean;
  indexedPaymentEvent: boolean;
  latestIndexedBlock: number;
  txHash?: string;
  explorerUrl?: string;
  reasonCode?: string;
};
~~~

- [ ] 3.1. Write tests for pending broadcast, reverted receipt, successful receipt without indexed event, indexed event without successful receipt, matching receipt/event, wrong chain, and unknown payment.
- [ ] 3.2. Implement receipt-reconciler to fetch receipt status and match paymentId/nonce/intentHash/cardId/merchantId/amount against PaymentSettled.
- [ ] 3.3. Implement read API with server-side auth, cardId ownership filtering, pagination on activity, latest indexed block metadata, and explorer URLs built from verified config.
- [ ] 3.4. Ensure GET /v1/cards/:cardId never returns a database balance as authority; return indexed projection plus chainReadAt/latestIndexedBlock and a stale flag.
- [ ] 3.5. Ensure payment GET returns settled only when receiptConfirmed and indexedPaymentEvent are both true; otherwise return pending/failed/uncertain with reason.
- [ ] 3.6. Run read/receipt tests.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/read-api/test/read-api.test.ts supabase/functions/read-api/test/receipt-reconciler.test.ts && yarn vitest run packages/domain/test/read-model.test.ts  
Expected: PASS.

- [ ] 3.7. Commit read API/reconciliation types.

### Task 4 — Add observability and indexer operations

**Files:** Create supabase/functions/_shared/observability.ts, supabase/functions/indexer/health.ts, scripts/run-indexer-once.mjs, scripts/verify-read-model.mjs, docs/runbook/indexer.md.

- [ ] 4.1. Implement redacted system_logs writes with requestId, component, latency, category, chainId, cursor range, and outcome.
- [ ] 4.2. Add indexer health showing latest chain block, latest confirmed block, cursor, lag, last error category, and read-model timestamp.
- [ ] 4.3. Implement run-indexer-once with explicit local/testnet config and a chain guard; no production URL default.
- [ ] 4.4. Implement verify-read-model to compare selected on-chain card/payment/evidence values with projections and print mismatches without secrets.
- [ ] 4.5. Run the one-shot indexer against local Anvil contracts and verify idempotent second run.

Run: node scripts/run-indexer-once.mjs --rpc http://127.0.0.1:8545 --chain-id 31337 && node scripts/run-indexer-once.mjs --rpc http://127.0.0.1:8545 --chain-id 31337 && node scripts/verify-read-model.mjs --chain-id 31337  
Expected: second run inserts zero duplicate events and verifier reports no mismatch.
- [ ] 4.6. Commit operations/runbook files.

### Task 5 — Full local database and Phase 04 regression

**Files:** Create supabase/test/idempotency.test.ts, docs/runbook/read-model-contract.md. Extend process/context/tests/backend-tests.md and package.json only through an approved plan-supplement, preserving Phase 01 routing and root command semantics.

- [ ] 5.1. Write an integration fixture that inserts/replays the same PaymentSettled log twice and asserts one chain_events row, one payment projection, and one spend projection.
- [ ] 5.2. Write a fixture where receipt status is 1 but event is absent; assert uncertain/pending, never settled.
- [ ] 5.3. Run clean DB reset, all Deno tests, Phase 04 session/gateway/executor tests, and AICD/secret checks.

Run: supabase db reset --local && deno test --allow-env --allow-net --allow-read supabase/test supabase/functions/indexer/test supabase/functions/read-api/test && deno test --allow-env --allow-net --allow-read supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test && yarn validate:aicd && node scripts/check-no-secrets.mjs  
Expected: PASS with idempotency and receipt truth proven.
- [ ] 5.4. Commit test-context and read-model contract updates.

## Acceptance Criteria

- AC-14: settled UI data requires successful receipt plus matching indexed PaymentSettled event.
- AC-15: replaying the same log produces no duplicate record or spend.
- AC-17: indexer/read model authority boundaries and evidence links are represented in AICD.
- Observability constraints: correlation fields, cursor, latency, region, tx/evidence hashes, and redacted failure categories are available.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| Database projection is mistaken for balance authority | Critical | read API labels projections/staleness and reconciles chain values; executor never reads DB balance |
| Replayed or reorged logs duplicate spend | Critical | unique chain event key, payload hash, cursor rewind, idempotent upsert |
| Receipt success without event appears settled | Critical | two-signal ReceiptTruth state machine |
| Supabase migration breaks Phase 04 sessions/intents | High | clean reset plus Phase 04 regression on every gate |
| RPC outage stalls cursor | High | persist cursor only after complete range; retry unchanged nextBlock |
| Untrusted event address is indexed | High | configured contract address allowlist before decoder |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| same log replayed | duplicate result, one projection | automated |
| RPC fails mid-range | cursor does not advance | automated |
| block hash changes | rewind and dedupe | automated |
| receipt status 0 | failed, no settled | automated |
| receipt status 1/no event | uncertain/pending | automated |
| event/no receipt | not settled | automated |
| stale read model | latestIndexedBlock/stale exposed | automated |
| unknown event/address | ignored and logged | automated |
| local reset with old migration | migration fails loudly, no partial claim | hybrid |

## Security Review

STRIDE covers unauthorized reads/writes, event tampering, auditability, secret disclosure, RPC/log flooding, and privilege escalation. RLS blocks anonymous writes; service-role access is function-only; projections never authorize; event payloads are validated against known contract addresses and ABIs.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| schema/migration | supabase db reset --local and schema test | automated | migration output |
| decoder/indexer | Deno indexer tests | automated | Deno output |
| receipt truth | receipt-reconciler tests | automated | state matrix |
| idempotency | supabase/test/idempotency.test.ts | automated | row counts |
| local chain index | Anvil + one-shot indexer + verifier | hybrid | cursor/readback |
| freshness/read UX | inspect stale/uncertain/settled states | agent-probe | review note |

## Touchpoints

- supabase/migrations/202609080002_read_model.sql and indexes
- supabase/functions/indexer, read-api, _shared/observability.ts
- supabase/test and function tests
- packages/domain/src/read-model.ts
- scripts/run-indexer-once.mjs, verify-read-model.mjs, docs/runbook/indexer.md

## Public Contracts

- Read routes and ReceiptTruth shape are fixed for the web UI.
- chain_events uniqueness is chainId + txHash + logIndex.
- payment settled status requires receiptConfirmed and indexedPaymentEvent.
- Database reads never become payment authorization inputs.

## Blast Radius

Supabase migrations/read functions/indexer/domain read types and runbooks change. Phase 04 session, gateway, executor, contract, and AICD public contracts are consumed and regression-tested, not weakened.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| clean migration reset | Automated | read model is reproducible |
| event decoder/cursor | Automated | indexer correctness |
| replay/idempotency | Automated | AC-15 |
| receipt truth matrix | Automated | AC-14 |
| Anvil index/readback | Hybrid | chain-to-read path |
| stale/uncertain UX state review | Agent-Probe | AC-14 |

## Test Procedure

Read process/context/all-context.md, follow process/context/tests/all-tests.md, then read process/context/tests/backend-tests.md. Run:
supabase db reset --local
deno test --allow-env --allow-net --allow-read supabase/test
deno test --allow-env --allow-net --allow-read supabase/functions/indexer/test
deno test --allow-env --allow-net --allow-read supabase/functions/read-api/test
deno test --allow-env --allow-net --allow-read supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
yarn test
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check

## Data Verification

- Unique chain event key prevents duplicate payment/evidence projections.
- Every payment projection includes tx hash, intent hash, card/merchant/amount/nonce, receipt status, indexed block.
- Every evidence projection includes source/proof hashes and status.
- No table stores private keys, bearer tokens, raw proof blobs, or unredacted provider errors.
- Cursor advances only after confirmed range persistence.

## Manual Test

Use local Anvil/contract events and run the indexer twice. Inspect the read API: successful receipt without event is uncertain; matching receipt/event is settled; stale cursor is visible.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All five tasks are checked; migrations reset cleanly; indexer/reconciliation/idempotency tests pass; Phase 04 regression passes; local chain readback exists; agent-probe records truthful receipt states; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase adds the first local database integration gate and a reusable idempotency fixture. Later UI/E2E plans must use read API status, never invent a settlement status from the executor response.

## Exit Gate

~~~bash
supabase db reset --local
deno test --allow-env --allow-net --allow-read supabase/test
deno test --allow-env --allow-net --allow-read supabase/functions/indexer/test
deno test --allow-env --allow-net --allow-read supabase/functions/read-api/test
deno test --allow-env --allow-net --allow-read supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
yarn test
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- Supabase local migrations cannot reproduce from a clean reset.
- Phase 04 session/intent data cannot be preserved without storing secrets.
- Indexer cannot guarantee idempotency or safe cursor recovery.
- Receipt truth cannot distinguish successful receipt from matching indexed event.
- Production database would be required to verify the phase.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; only local disposable DB is allowed.
- On ✅ VERIFIED, continue to phase-06-web-ui_PLAN_08-09-26.md.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
