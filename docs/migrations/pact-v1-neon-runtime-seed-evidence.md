# Neon Runtime + Seed Evidence — Steps 2–7 (2026-09-20)

Date: 2026-09-20 (UTC) · Branch: `main` · Neon project
`polished-dream-04296130`, branch `main`, DB `pact` (PG17).
Scope: Neon adapter (B2), local runtime + health (B3/B4), deploy + verify
(B5/B6), bounded 2-row seed (B7). Step 8 (H1–H3) NEVER ran; OpenAI NEVER
called. No secret/token/URL/key printed, logged, or persisted. No
commit/push. Supabase stays live as fallback (verified untouched).

## 1. Adapter (B2)

`neon/adapter/neon-persistence.ts` (new): same ports
(`SessionPersistence`, `IntentStoreAdapter`, `CardStore`), parameterized
SQL via `pg` Pool only, atomic single-statement consume/revoke/
transitions, 23505-by-constraint mapping, connection failures to
`UNAVAILABLE`, shared validators/mappers reused (9 additive `export`s in
existing stores — zero behavior change). `requireNeonEnv` demands
`PERSISTENCE_BACKEND=neon` + `DATABASE_URL` (no silent fallback).
`payment_attempts` has no adapter port (executor-owned Map, unchanged —
documented boundary, asserted by test).
TDD: missing-module RED → GREEN. Two genuine TDD catches: unqualified
JOIN columns (ambiguous on real PG) and a partial-unique-index prosecuted
only by the docker suite (one ACTIVE card per agent is real).
`pg@8.23.0` + `@types/pg` added (root, pinned).

## 2. Local runtime + health (B3/B4)

Entries `neon/functions/{session,aigateway,agentexecutor}/index.ts`
(thin, reuse `start*Server`, bare-fetch export, lazy-cached build with
redacted 503 fallback; strict Arc lane + card-1 registry on gateway/
executor). `neon dev` CLI smoke: gateway health 200 Arc shape
(chain 5042002, regions us-east-1). In-process docker smoke (5/5):
health shape, fail-closed backend selection, session challenge shape,
CARD_NOT_ELIGIBLE before provider (zero OpenAI contact), Arc reads +
fail-closed preflight on unreachable RPC. B4 branch reads: counts 0,
lane CHECKs present. Local writes went to disposable docker PG only.

## 3. Deploy + verify (B5/B6)

`neon functions deploy` ×3 (session, aigateway, agentexecutor — hyphen
rule observed), shared HMAC secret generated fresh per single-shell
deploy chain (first two attempts used divergent secrets; immediately
corrected by full redeploy with ONE shared secret — reported honestly;
no secret persists anywhere). Env: PERSISTENCE_BACKEND=neon,
PACT/SB_REGION=us-east-1 (factual runtime region), SESSION_HMAC_SECRET
(fresh), OPENAI_API_KEY/MODEL (server-side, never called), ARC_RPC_URL
(public documented endpoint); DATABASE_URL auto-injected (managed
binding). Data API not used (direct Pool suffices; no extra service).
Verify: all `completed` (session/2, aigateway/2, agentexecutor/1);
gateway health 200 exact shape (chain 5042002, regions us-east-1,
pin intact); session/executor roots 404-enveloped (liveness); Neon
counts 0 pre-seed; Supabase counts 1/1 unchanged; zero OpenAI/H attempts.

## 4. Seed (B7)

Preflight: Neon 0/0, schema/CHECKS green; on-chain card-1 re-read fresh
(identical: owner/agent/cap/limit/spent/status/policy/expiry; credit
expired); merchant logical preimage undisclosed (dictionary probe over
repo names: no match) → lane merchant `arc-demo-merchant` disclosed
(prior seed-scope design; static preflight judges allowlist at H2).
`validateSeedPayloads` (`neon/seed-validator.ts`, 3/3 tests incl. the
real seeded hash pinned) gated the payloads.
Inserts (idempotent, RETURNING): card `1` (all on-chain facts +
creation provenance) + intent `intent-req-1` (agent/policy/asset/chain
bound to card; expiry +2h; hash recomputed via implementation
`0x9673…413a`, independently re-verified via `cast keccak(abi-encode)`)
— then scratch deleted.
Read-back: full rows match verbatim; cross-binds hold (FK, agent,
policy, asset); counts `1/1/0/0/0` (exactly 2 rows added).

## 5. Gates

Vitest 309/309 (incl. 11 fake-pool + 5 docker-PG17 + 5 smoke + 5
baseline + 3 seed-validator + legacy suites; one transient docker flake
passed on clean rerun with no code change), typecheck/lint/AICD green,
secret scan 1141/0, diff-check clean. Forge skipped: zero contract
touches (only `foundry.toml` dims pre-existing, untouched by this task).

## 6. Files

Created: adapter, 3 entries, 4 neon tests, seed-validator (+test),
`package.json` pg deps, this doc + prior decision/supplement docs.
Touched (additive): 9 `export` keywords, `vitest.config.ts` glob,
`neon/README.md` status. Preserved: contracts, Supabase (code+migrations
+functions+fallback), Arc evidence, CTC legacy, H3/G22, all history.
H1/H2/H3: NOT RUN. Next: separate fresh-H1–H3-on-Neon approval only.
