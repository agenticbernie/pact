# Neon Runtime Migration Plan (2026-09-19) — PLAN ONLY

Date: 2026-09-19 (UTC) · Branch: `main` · Steps 1–7 ONLY (never step 8).
Status: DECISION ONLY. No deploy, seed, OpenAI call, H-lane run, secret
change, commit, or push is authorized by this document; each later step
runs under the task's own approvals. H1/H2/H3 are NOT RUN here; OpenAI
is NEVER called here.

Governance: AGENTS.md / CLAUDE.md / routers / gates read fully in prior
passes on this worktree and unchanged since (no modifications in `git
status`); fresh reads for this task: `neon/README.md`, baseline SQL +
review + applied evidence, Supabase ports/stores/compositions, `neonctl`
helps, official Neon Functions docs (fetch-export contract). Prior
reports/history are read-only and unrewritten.

## 1. Positions (locked)

- Supabase stays LIVE as fallback/reference. Nothing there is deleted,
  deactivated, migrated away, or written by Neon work. Supabase counts
  are re-verified unchanged after every Neon step.
- Neon is the new staging execution target. Database authority: Neon
  project `polished-dream-04296130`, branch `main`, database `pact`
  (PG17; baseline applied exactly once — prior evidence).
- Arc lane only: chain `5042002` + `arc-testnet-usdc`. CTC rows are
  rejected in the Arc lane at every layer; legacy behavior preserved
  where it exists.
- The OTHER project on this account (`shoo`, ap-southeast-1) is never
  touched; every Neon command scopes `--project-id` + `--branch main`
  explicitly.

## 2. Neon platform reality (verified, not assumed)

- `neon functions deploy <slug> --src <dir|entry> [--env KEY=VALUE]`
  (nodejs24, esbuild bundle, slugs `^[a-z0-9]{1,20}$` — NO hyphens).
  Slugs: `session`, `aigateway`, `agentexecutor`.
- Entry contract: default export with `fetch(request) → Response`
  (object or bare function). No Hono needed.
- `DATABASE_URL` is auto-injected from the linked branch (managed
  binding — the approved mechanism; not passed as a secret flag).
- `neon dev --source` serves entries locally (hot reload) for B3 smoke.
- `neon env` only pulls; deploy-time env is `--env KEY=VALUE`
  (repeatable, no env-file form) — transient ps exposure documented,
  values never logged.
- Data API: NOT used. Rationale: direct `pg` Pool needs no extra
  service, no JWT surface, and keeps the exact PostgREST-equivalent
  query semantics the stores already encode. Revisit only if a lane
  proves Pool unsuitable.
- Beta limits noted: deployed-function logs not retrievable (diagnose
  via `neon dev` + Postgres-side evidence); memory fixed 2048 MiB.

## 3. Adapter design (`_shared/neon-persistence.ts`, new, additive)

- Same domain ports/interfaces: `SessionPersistence`, `IntentStoreAdapter`,
  `CardStore` (full method sets). `payment_attempts` has NO adapter port
  today (executor owns Map-backed attempts) — unchanged; the task's
  attempt-invariants stay executor-tested, documented as boundary.
- `pg` Pool (new `pg` dependency, pinned) with PARAMETERIZED SQL only
  (`$1` placeholders; static lint/test forbids concatenation of user
  input into query text).
- Coverage: owner/agent/lane-scoped SELECTs; challenge insert; atomic
  single-statement `UPDATE … WHERE … RETURNING` consume; session
  insert/read(+expiry/revoked filter)/revoke; intent insert/getById/
  getByIdempotencyKey/markStatus(+terminal guard)/save; card
  getById/getActiveByAgent/createOrRecord/transitionStatus(+monotonic
  block)/close; 409-replay scoped read; duplicate/terminal/conflict
  mappings onto the existing `PersistenceErrorCode` union (no new API
  codes, no envelope change, no invariant change).
- `createNeonPersistenceFromEnv(env, pool?)`: requires
  `PERSISTENCE_BACKEND=neon` (explicit; anything else → throw, no silent
  fallback to Supabase) + `DATABASE_URL` present (missing → throw).
  Fails closed on connection error, absent rows, lane/controller/owner/
  agent/hash mismatch. Logs/errors never carry parameters, token hashes,
  tokens, signatures, URLs, or keys. No Supabase URL/PostgREST/service
  secret anywhere in this path.
- Tests: (a) fake-Pool unit (always green: exact SQL + params + logic),
  (b) docker-PG17 integration (same suites against a temp container
  loaded with the baseline file; skips cleanly without docker, mirroring
  the Deno-gated precedent). Real PG proves atomicity/idempotency/
  ordering; fakes prove shape. Neither claims hosted parity.

## 4. Functions (`neon/functions/<slug>/index.ts`, new, thin)

- Each entry imports the EXISTING `start*Server` factories (no handler
  fork), adapts `serve` (capture → `export default { fetch: handler }`),
  and builds Neon persistence from env (`PERSISTENCE_BACKEND=neon`).
  Deno blocks never execute under Node (`typeof Deno` guards).
- Env kept: `PACT_EXPECTED_REGION=us-east-1`, `ARC_RPC_URL` + lane
  constants, OpenAI key server-side (NEVER called in this task), pin
  `gpt-5.6-luna`, `allowFallback:false`, read-only executor, no other AI
  gateway, no Supabase PostgREST on the neon path, Supabase path intact
  when selector is `supabase`.
- Local `.env`/temp files only for dev; never committed; values never
  printed. Local smoke (B3): health, session challenge/verify shape,
  card/intent reads, read-only preflight composition, counts — against
  LOCAL docker PG for writes; Neon branch read-only for counts. No
  OpenAI, payment, or RPC mutation.

## 5. Deploy + verify + seed (later steps, same approvals as task)

- B5: exactly the 3 slugs via `functions deploy` with the 6 env names
  (`DATABASE_URL` auto-injected; no Data API mutation; no Supabase/
  Cloudflare deploy).
- B6: list/get versions + status, invocation-URL health per function,
  Neon counts still 0 pre-seed, Supabase counts unchanged, zero OpenAI/
  H attempts. Any failure stops the task (no auto-retry, no fallback,
  no secret/model change).
- B7: exactly the 2 rows (card `1`, `intent-req-1`) from Arc provenance
  (same values as the Supabase seed; intent expiry/hash recomputed at
  seed time — never copied blind); idempotent INSERTs; no UPDATE/DELETE;
  no session/challenge/attempt rows; full re-select + FK/agent/policy/
  lane/hash/provenance/counts verification; merchant disclosure stands
  (no on-chain logical preimage exists).

## 6. Files to create / touch

Create: `neon/adapter/neon-persistence.ts` (NOT under
`supabase/functions/_shared/` — the G12a deploy-compat gate requires zero
unmapped bare npm specifiers in the Deno graph, and the adapter imports
`pg`; colocating under `neon/` keeps that binding gate green untouched),
`neon/functions/*/{index.ts}`,
`neon/test/neon-persistence*.test.ts`, `package.json` (+`pg` dep),
evidence docs. Touch (additive only): none in Supabase sources except
nothing — adapter is greenfield; composition reuse needs NO source edits
(injection seam already exists). Preserve: contracts, Supabase
migrations/functions, Arc evidence, CTC legacy, H3/G22, all history.
