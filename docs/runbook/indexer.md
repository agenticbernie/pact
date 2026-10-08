# Phase 05 — Indexer / Read Model runbook

Derived-data lane: **Arc chain is authoritative**. The indexer and the read API
can only *record* what the chain already settled; they never authorize, settle,
raise credit, or override a contract result.

## Parts

| Component | Path | Role |
|---|---|---|
| Migration | `neon/migrations/0003_read_model.sql` | `chain_events` ledger + `indexer_state` cursor (RLS deny-only) |
| Decoder | `supabase/functions/indexer/event-decoder.ts` | allowlisted Pact/ASC events only; everything else is ignored |
| Cursor store | `supabase/functions/indexer/cursor-store.ts` | SQL upsert + cursor (`ON CONFLICT DO NOTHING`) |
| Chain reader | `supabase/functions/indexer/chain-reader.ts` | read-only ethers provider (`getLogs`/`getBlock`/`getReceipt`) |
| Indexer tick | `supabase/functions/indexer/indexer.ts` | confirmation window, idempotent replay, reorg rewind |
| Read API | `supabase/functions/read-api/index.ts` | `GET /v1/config`, `/v1/cards/:id`, `/v1/cards/:id/activity`, `/v1/payments/:id` |
| Read store | `supabase/functions/read-api/read-store.ts` | owner-scoped SQL over the read model |
| Neon entry | `neon/functions/readapi/index.ts` | composition root (pool + ethers receipt reader) |

Local entry point: `neon/dev-host.ts` mounts the read API on the same port-3000
surface as session/gateway/executor. `/v1/payments/preflight` and
`/v1/payments/execute` stay with the executor; any other `/v1/payments/*` is a
read route.

## Invariants (do not break)

- **Uniqueness** is `(chain_id, tx_hash, log_index)`. Replaying a range must
  insert zero rows (AC-15).
- **The cursor advances only after a whole confirmed range is persisted.** Any
  reader/store failure leaves `next_block` untouched so the next tick
  reprocesses the range.
- **Confirmed blocks only**: never scan past `latestBlock - INDEXER_CONFIRMATIONS`
  (default `1`).
- **Two-signal receipt truth** (AC-14): `settled` requires a successful receipt
  **and** a matching indexed `PaymentSettled`. A database row alone never
  settles.
- **Address allowlist**: only the configured controller/pool/merchant addresses
  are decoded.

## Migrating the database

```bash
# local compose Postgres (disposable) — apply 0003
docker compose -f docker-compose.base44.yml up -d      # one-shot `migrate` reruns, DDL is idempotent
docker compose -f docker-compose.base44.yml exec -T db \
  psql -U pact -d pact -c '\d chain_events'
```

A **hosted** `DATABASE_URL` (Neon branch) is migrated **out of band**, exactly
like migrations 0001/0002 — `migrate` only touches the local compose Postgres.
Until `0003_read_model.sql` is applied to the hosted branch, `/v1/config`,
`/v1/cards/*` and `/v1/payments/*` answer `503 PROVIDER_UNAVAILABLE` there.

## Running a tick

The tick is a plain function (`runIndexerTick`) over injected reader/store, so it
runs in tests without network. For a one-off live run, seed the cursor and call
it with a Node script inside the api container (one-off scripts live in `/tmp`,
never in the repo):

```bash
docker compose -f docker-compose.base44.yml exec -T \
  -e DATABASE_URL=postgres://pact:pact-local-dev@db:5432/pact \
  -e PERSISTENCE_BACKEND=neon \
  -e ARC_RPC_URL=https://rpc.testnet.arc.io \
  api node --experimental-strip-types /tmp/run-indexer-once.ts
```

Read back:

```bash
docker compose -f docker-compose.base44.yml exec -T db psql -U pact -d pact \
  -c "select tx_hash, log_index, block_number, event_type from chain_events order by block_number, log_index"
docker compose -f docker-compose.base44.yml exec -T db psql -U pact -d pact \
  -c "select * from indexer_state"
```

## Verifying

```bash
corepack yarn vitest run packages/domain/test/read-model.test.ts \
  supabase/functions/indexer/test supabase/functions/read-api/test
corepack yarn typecheck && corepack yarn lint && corepack yarn validate:aicd
```

End-to-end against the local compose database (real Arc events, real receipt):

1. Run a tick over the block range that contains a known settlement.
2. Call the read API with a wallet-bound session token
   (`issueSessionToken({sessionId, wallet, role:"user"}, SESSION_HMAC_SECRET)`).
3. `GET /v1/payments/<idempotency-key>` must report `settled` only with
   `receiptConfirmed:true` **and** `indexedPaymentEvent:true`.
4. Unauthenticated card/payment reads must answer `401 AUTH_REQUIRED`.

## Known gaps

- Hosted prefix normalization (`/functions/v1/read-api/...`) is not wired yet;
  the handler serves bare paths (what `neon/dev-host.ts` and the Neon function
  entry do).
- Activity pagination is a fixed `limit 50`; no cursor paging yet.
- No scheduled runner/health surface yet — ticks are invoked explicitly.
