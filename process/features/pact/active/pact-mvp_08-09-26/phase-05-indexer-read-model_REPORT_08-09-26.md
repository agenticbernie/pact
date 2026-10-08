---
phase: phase-05-indexer-read-model
date: 2026-10-08
status: CODE DONE — local EVL green; hosted-migration + freshness gates pending
feature: pact
plan: process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md
---

# Phase 05 — Indexer / Read Model: Implementation Report

**Goal:** make Pact show what the chain already settled without ever letting the
read model become a payment authority.

**Authority rule honoured:** the read model is derived data. It cannot
authorize, settle, raise credit, or override a contract result; `settled` needs
both a confirmed receipt and a matching indexed `PaymentSettled` (AC-14).

## What was built

Adapted from the Phase 05 plan's Supabase shape to this repo's live stack (Neon
lane: Postgres + Node functions + ethers + Vitest), keeping the plan's semantics
(unique `chainId+txHash+logIndex`, cursor-after-full-range, two-signal receipt
truth, address allowlist).

- `neon/migrations/0003_read_model.sql` — `chain_events` (append-only ledger,
  unique `(chain_id, tx_hash, log_index)`, deterministic `payload_hash`) and
  `indexer_state` (cursor), with RLS deny-only policies matching the 0001
  baseline. Applied by the existing one-shot `migrate` compose service.
- `supabase/functions/indexer/{types,event-decoder,cursor-store,chain-reader,indexer}.ts`
  — allowlisted decoder, idempotent upsert, read-only chain reader, and the tick
  (confirmation window, cursor-advance-only-on-success, reorg rewind).
- `packages/domain/src/read-model.ts` — `deriveReceiptTruth` (AC-14 state
  machine), exported from the domain index.
- `supabase/functions/read-api/{read-store,index}.ts` —
  `GET /v1/config`, `/v1/cards/:cardId`, `/v1/cards/:cardId/activity`,
  `/v1/payments/:paymentId`, owner-scoped by the wallet-bound session.
- `neon/functions/readapi/index.ts` + `neon/dev-host.ts` — Neon entry and the
  port-3000 route wiring.
- `docs/runbook/indexer.md`.

## Verification (evidence)

**Automated (local, this change):**

- New focused suites: `28 passed` (read-model 6, event-decoder 8, indexer 5,
  read-api 9).
- Full regression `corepack yarn test`: **362 passed | 10 skipped** (59 files
  passed | 2 skipped).
- `corepack yarn typecheck` clean; `corepack yarn lint` clean;
  `validate:aicd` 0 failures (11 components, 6 flows, 17 scenarios).
- Migration applied to the local compose Postgres;
  `\d chain_events` shows the unique key, checks, indexes and deny-only policies.

**Hybrid — real Arc events indexed (the real Phase 04 E2E transaction):**

The indexer was run as a live tick against Arc testnet over the block range
containing the Phase 04 settlement. It read and decoded the **real** tx
`0x947a925d5677d6267d8bdba089fe715585e40b6324b4549928c8c8b2bffdc72f`
(block `66170486`):

- `PaymentSettled` — `cardId: "2"`, `amount: "5000000000000000"`, `nonce`,
  `intentHash`, `merchantId`.
- `MerchantPaymentReceived` — same tx, `amount: "5000000000000000"`.

Idempotency on real data: re-running the same range reported
`inserted: 0, duplicates: 2` and `chain_events` stayed at 2 rows (AC-15).

**Hybrid — read API end-to-end (handler + real SQL + live Arc receipt):**

With a local fixture attempt bound to the real tx hash (fixture rows removed
afterwards; `chain_events` are real, not seeded):

- `GET /v1/config` → `200` (`chainId 5042002`, real controller/pool/merchant,
  `latestIndexedBlock 66173848`).
- `GET /v1/cards/2` without a session → `401 AUTH_REQUIRED`.
- `GET /v1/cards/2` with the owner session → `200` card projection,
  `stale:false`, `chainReadAt`.
- `GET /v1/cards/2/activity` → `200` with the real `PaymentSettled` event.
- `GET /v1/payments/<key>` → `200` `status:"settled"` with
  `receiptConfirmed:true` **and** `indexedPaymentEvent:true` — the receipt was
  fetched **live from Arc** for the real tx hash and matched against the indexed
  event.

**Over the preview port (curl, `localhost:3000`):** `/health` `200`;
`/v1/cards/2` `401 AUTH_REQUIRED`; `/v1/config` `503` because the sandbox
runtime's `DATABASE_URL` is the hosted Neon secret and that branch does not yet
carry migration `0003` (see gaps).

## Known gaps / not claimed

- **Hosted Neon not migrated**: `0003_read_model.sql` has not been applied to
  the hosted branch (out-of-band, approval-gated, same policy as 0001/0002), so
  the read API answers `503` in the sandbox preview until then.
- **Hosted prefix normalization** (`/functions/v1/read-api/...`) not wired; the
  handler serves bare paths.
- **No scheduled runner / indexer health surface** yet — ticks are explicit.
- **Activity pagination** is a fixed `limit 50`.
- The Phase 05 plan's Validate Contract remains a placeholder; this report
  records implementation + local EVL only, not a formal ✅ VERIFIED promotion.

## Deviations from the plan

1. Deno `deno test` suites in the plan were implemented as Vitest suites
   (`.vitest.test.ts`) because the repo's runtime/tests are Node/Vitest and the
   Deno/`supabase` CLIs are absent locally (the plan itself records G7 as
   CI-only/non-binding).
2. Postgres migration paths follow `neon/migrations/*` (the repo's live apply
   target) rather than `supabase/migrations/*`.
3. One **bug fix outside the plan was required**: `ARC_LANE_POOL` in
   `packages/domain/src/arc-lane.ts` was 39 hex chars (a truncated address), so
   any `getLogs` address filter failed with an ethers ENS error. Corrected to
   the 40-char value in `config/deployments/arc-testnet.json`
   (`0x5e1771de29bd1a084900d032fd4db2ac7cf7528b`).

## Next

Apply `0003_read_model.sql` to the hosted Neon branch (out of band), then wire
hosted prefix normalization and a scheduled tick + indexer health surface.
Phase 06 UI may consume the read routes, but must render the read API's truth —
never derive `settled` from an executor response.
