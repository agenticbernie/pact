---
phase: phase-04-ai-gateway-executor
date: 2026-09-10
status: COMPLETE_WITH_GAPS
feature: pact
plan: process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md
---

# Phase 04 — AI Gateway & Agent Executor: Execution Report (Tasks 1–6, local EXIT)

**Branch:** `main` · **Contract:** CONDITIONAL accepted (C-SESSION, C-DDL, C-MODEL, C-TOOL) · **Mode:** supervised EXECUTE.
Tasks 1–6 RED → GREEN complete; binding local gates G1–G6 plus G8 GREEN (reported evidence, see below).
G7 Deno/Supabase is CI-only and non-binding locally (CLIs absent).
H1–H3 live hybrid lanes NOT executed — separate explicit approval required.
No push performed for the implementation commits in this closeout.

## Hosted Bundle-Resolution Supplement EVL (2026-09-11)

The hosted bundle-resolution supplement is **VERIFIED**. This covers the
deterministic local equivalent of hosted resolution and does not claim a hosted
deployment. The original failed G13 evidence remains unchanged in the Phase 04
plan.

- Deno `2.9.6` and Supabase CLI `2.117.0` verified.
- Function-local compatibility test: `6/6` passed.
- `session`, `ai-gateway`, and `agent-executor` function-local `deno.json`
  files verified with the exact pinned `ethers@6.17.0` and `zod@3.25.76` maps.
- Per-function `deno check` and `deno bundle` passed for all three entrypoints.
- G1-G4/G5/G6/G8/G12a/G12b GREEN; secret scan `970` scanned, `0` findings.
- No generated `deno.lock` remains; `AGENT_SIGNER_PRIVATE_KEY` was absent;
  `SUPABASE_REGIONAL_FUNCTION_URL` was absent by design as a post-deployment
  output.
- Local Supabase serve was **NOT RUN**.
- G13 retry and H1/H2/H3 remain pending and separately approval-gated. No
  deployment, migration, OpenAI/RPC call, transaction, or secret access
  occurred.

## G12b Crypto-Typing Fix Verification (2026-09-11)

Independent verification confirmed the ambient `randomUUID` crypto typing fix.
This is a typing-only correction with no runtime or business-behavior drift.

- Deno `2.9.6`; focused `ai-gateway` check GREEN.
- Per-function checks: `3/3` GREEN.
- Per-function bundles: `3/3` GREEN with the supported command shape
  `deno bundle --no-lock -c <function>/deno.json -o <output> <entrypoint>`.
- G12a `6/6`; full Vitest `145/145`; typecheck, lint, and AICD GREEN.
- Secret scan: `970` scanned, `0` findings. `git diff --check` GREEN.
- `deno.lock` absent; `AGENT_SIGNER_PRIVATE_KEY` absent by name.
- Implementation fix scope was limited to
  `supabase/functions/ai-gateway/index.ts` and
  `supabase/functions/agent-executor/index.ts`.

The original G13 bare-ethers failure remains preserved unchanged. G13, H1, H2,
and H3 remain **NOT RUN**. No deployment, OpenAI/RPC call, migration,
transaction, secret-value access, commit, or push occurred.

## What Was Done

Verified the function-local Deno configuration supplement and its compatibility,
typecheck, and bundle evidence. Updated Phase 04 process state without changing
implementation source or the original V1-V7 contract.

## What Was Skipped or Deferred

G13 hosted deployment retry, H1 live model access, H2 regional static-call
evidence, and H3 deployed URL/region confirmation remain pending. Local
Supabase serve was not run. No migration, external call, secret access, commit,
or push was performed in this update pass.

## Test Gate Outcomes

The compatibility test passed `6/6`; all three entrypoints passed Deno check and
bundle under Deno `2.9.6` with Supabase CLI `2.117.0` recorded. G1-G4, G5, G6,
G8, G12a, and G12b are GREEN. Secret scan reported `970` scanned and `0`
findings. No generated Deno lockfile remains.

## Plan Deviations

The plan remains in `active/` because G13 and H1-H3 are still approval-gated.
The hosted supplement is verified without changing the original V1-V7 contract
or the original failed G13 evidence.

## Test Infra Gaps Found

The local Supabase serve check was not run because the local Supabase stack was
not started. Hosted deployment and regional URL derivation remain unverified.

## SPEC Achievement

- Bundle-resolution compatibility: **met** (compatibility test `6/6` and six
  per-function Deno check/bundle commands passed).
- Local Phase 04 behavior guards: **met** (G1-G6, G8, G12a, G12b, and secret
  scan `970/0`).
- Hosted deployment and regional runtime behavior: **unmet -> pending G13/H1/H2/H3**.

## SPEC Gaps

G13 hosted deployment acceptance, H1 live model call, H2 regional preflight,
and H3 fixed URL/region confirmation remain open. Existing approval-gated
follow-ups already own these gaps; no duplicate backlog note is created.

## Closeout Packet

1. **Selected plan path:** `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`
2. **Closeout classification:** `Keep in active/ — needs further testing`
3. **What was finished:** Hosted bundle-resolution supplement verified locally;
   function-local configs, compatibility, Deno checks, and bundles are green.
4. **Verified vs unverified:** G1-G6/G8/G12a/G12b and secret scan are green;
   G13/H1/H2/H3 remain unverified. The original V1-V7 contract is preserved.
5. **Cleanup:** Report, plan handoff, umbrella state, backend context, and
   live-lane routing updated; hosted deployment approval remains needed.
6. **Single best next valid state:** Explicitly approve the G13 staging-only
   retry after confirming the exact toolchain; keep H1-H3 separately gated.
7. **Commit checkpoint:** Invoke `vc-git-manager` after review; do not commit or
   push in this session.
8. **Regression status:** G1-G6/G8/G12a/G12b and reported Phase 02/03
   regression surfaces remain green; no implementation source changed here.
9. **SPEC achievement:** Bundle-resolution criterion met by the `6/6` test and
   per-function checks/bundles; hosted/live criteria remain pending.

## Forward Preview

### Test Infra Found

Function-local `deno.json` files provide a deterministic hosted-resolution
equivalent. Local Supabase serve remains not run.

### Blast Radius Changes

No implementation blast-radius change in this update pass. Process and context
artifacts only.

### Commands to Stay Green

`corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts`
plus the three per-function Deno `check`/`bundle` command pairs from the hosted
bundle-resolution supplement and G1-G6/G8.

### Dependency Changes

Downstream work may rely on the three function-local config boundaries and the
verified Deno `2.9.6` / Supabase CLI `2.117.0` toolchain. Hosted deployment and
regional URL facts are not available yet.

## Update Process Handoff

Phase 04 remains active with `COMPLETE_WITH_GAPS`: the hosted bundle-resolution
supplement is verified, while G13 retry and H1-H3 remain pending. Do not archive
the plan or advance to Phase 05 on this supplement alone.

## Toolchain (recorded)

- Node `v24.17.0` + Yarn Classic `1.22.22` via Corepack; Vitest `3.2.4`; Foundry `1.7.1`;
  `wrangler` present; `deno` + `supabase` CLIs absent (G7 non-binding by contract).
- No `openai` npm dependency added (S1 forbids it); raw-fetch-behind-port only.

## Pins applied before first GREEN (V3 defaults, verbatim in code+migration+tests)

- **C-SESSION:** challenge TTL 5 min (`expires_at = now()+5min`); session TTL 30 min
  (HMAC `exp`, `expires_at = now()+30min`); sha256-hex-only `nonce_hash`/`token_hash`
  (TEXT CHECK 64-hex + indexes, NO plaintext columns); atomic one-time consume
  `UPDATE … WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING` (second verify
  → `AUTH_INVALID`); function-only `SESSION_HMAC_SECRET` with versioned rotation
  (verify-accept-old-for-one-session-TTL overlap then destroy; rotation statement
  reserved for a future hybrid-lane report, NOT claimed here).
- **C-DDL:** `payment_attempts(intent_id, idempotency_key, status, tx_hash, card_nonce)`
  with `PRIMARY KEY(intent_id, idempotency_key)`, `UNIQUE(idempotency_key)`, `tx_hash`
  index; first-claim `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`;
  store-`txHash`-before-wait ordering invariant (test-asserted call order);
  `findByNonce` + receipt reconcile before any retry; never second-submit;
  `settled` only on `receipt.status==1` (never-settled-on-uncertain).
- **C-MODEL:** `config/ai/model-config.json` is the ONLY model truth
  (`{provider:openai, model:gpt-5.6-luna, allowFallback:false}`) loaded via
  `loadOpenAIConfig` + `resolveOpenAIModel` with pre-call `allowFallback===false`
  assert; existing `config/ai/openai.json` kept with assert-equal test
  (`model-config.json` authoritative); no `openai` package; no env substitution;
  Responses `store:false` + strict schema `pact_agent_intent`; retry once only on
  502/503/429, never as a new payment.

## Task RED → GREEN status (reported evidence from EXECUTE lane)

- **Task 1 DONE:** domain API contracts RED (5 missing modules) → GREEN 23/23
  (`api-contracts`, `api-error-codes` keys==15 + no-`as string`, `provider-config`,
  `intent-shape`, `session-token`, `payment`).
- **Task 2 DONE:** session RED (module-not-found) → GREEN 4/4 (expiry, one-time
  consume, wrong signature/address, expired/revoked token, wallet binding).
- **Task 3 DONE:** gateway RED → GREEN 4/4 incl. `sendPayment==0` on all 9
  fail-closed cases (401/429/5xx, malformed JSON, model-unavailable,
  region-mismatch, shape/catalog, oversize prompt, model-recipient),
  `store:false` + `pact_agent_intent` shape, retry-once policy.
- **Task 4 DONE:** edge RED → GREEN 5/5 (64KB/method/path/auth/rate-limit/
  correlation/timeout/upstream mapping; secret scanner over `apps/edge` clean).
- **Task 5 DONE:** executor RED → GREEN 5/5 (one-send, store-before-wait ordering
  proof, timeout-reconcile-no-resubmit, receipt-status-0-not-settled, no signer
  in fixtures, gateway↛signer import graph).
- **Task 6 DONE:** smoke RED (module-not-found) → 17/17 checks ok with correlated
  IDs and zero live calls; runbook `docs/runbook/local-runtime.md` written.

Two genuine TDD catches during GREEN (fixed before exit): harness passed
`{provider:{…}}` instead of the provider object (masked silent
TypeError→PROVIDER_UNAVAILABLE); `as string[]` casts tripped the G6 pin grep
(removed; pins re-verified at zero hits on Phase 04 surface).

## Gate results (reported evidence; not independently rerun in this closeout)

- G1 `vitest run packages/domain/test`: 13 files, 91 tests PASS.
- G2 `vitest run apps/edge/test/edge.test.ts`: 5 PASS.
- G3 `vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts`: 4 PASS.
- G4 `vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts`: 5 PASS.
- G5 `typecheck` clean; `lint` clean; `validate:aicd` 0 failures.
- G6 `check-no-secrets` 954 scanned, 0 findings; `git diff --check` clean;
  `as string` 0 hits on Phase 04 surface (only pre-existing
  `aicd-fixture.test.ts` + the guard-test's own regex); no `openai`
  imports/package; `gpt-5*` only the pinned `gpt-5.6-luna`.
- G7 non-binding, recorded: `deno`/`supabase` CLIs absent; Deno suites exist as
  CI refs with `@ts-nocheck` + eslint carve-out; never failed local green.
- G8 error-copy review note: `ApiError` messages are fixed per-code generics
  (never echo bodies/prompts/keys; `redaction.ts` strips sk-/JWT/key/URL shapes);
  `retryable:true` only on `PROVIDER_UNAVAILABLE` / `PAYMENT_BROADCAST_TIMEOUT` /
  `RATE_LIMITED`; `requestId` required at every boundary (`x-request-id`
  generated + propagated when absent); demo token (`x-demo-token`) passes edge
  shape only — intent/preflight/execute require the HMAC wallet-bound token via
  `requireSession`, so the demo path cannot reach secrets.
- Regressions (reported): full `yarn test` 22 files / 139 PASS;
  `forge test --root contracts` 101 PASS.

## Files and commits (implementation, already committed — see integrity notes)

- `8c5e23c` feat(phase-04): domain API/session/payment/model contracts + unit
  tests (11 files: `packages/domain/src/{api,model-config,payment,session-token}.ts`
  + `index.ts` re-exports + 6 test files).
- `77e5d25` feat(phase-04): supabase AI gateway/session/agent-executor functions
  + migration (23 files: `_shared/` 8 modules, `ai-gateway/` + `session/` +
  `agent-executor/` handlers with Vitest mirrors + Deno CI refs,
  `202609080001_sessions_and_intents.sql`).
- `ad6d50b` feat(phase-04): edge gateway app + wiring config, catalog, scripts,
  runbook (15 files: `apps/edge/` app + tests + `wrangler.toml`,
  `config/ai/{model-config,merchant-catalog}.json`, `docs/runbook/local-runtime.md`,
  `scripts/{smoke-edge-gateway,test-session-flow}.mjs`, `tsconfig`/`vitest`/`eslint`
  wiring). NOTE: closeout instruction text cites `ad6d50e`; that revision does not
  exist — the verified commit is `ad6d50b` (correction recorded here).
- Modified wiring (in `ad6d50b`): `tsconfig.json` (`allowImportingTsExtensions` +
  `apps/edge`/`supabase` includes for G5 coverage), `vitest.config.ts`
  (edge+supabase includes), `eslint.config.js` (Buffer global for scripts only).
- Untouched per contract: Phase 01 `schemas`/`canonical-hash`/`errors`,
  `config/ai/openai.json` (kept + assert-equal), Phase 02/03 contracts and hooks.

## SPEC mapping (local scope)

AC-06 (merchant-ID-only intent shape), AC-07/AC-08 (pinned model, no fallback,
attribution), AC-10/AC-11 (preflight/executor chain-client shape, fake-proven),
AC-12 (15-code fail-closed mapping) met by passing local gates; live halves
(H1 model call, H2 regional preflight, H3 URL/region record) are hybrid-only and
pending. AC-17 unaffected (no AICD component changes; validator 0 failures).

## Plan deviations (in-blast-radius)

1. Per-task "Commit …" checklist steps satisfied in grouped form (3 dependency-
   boundary commits) rather than 6 per-task commits; content identical.
2. `openai.json` kept (not deleted) with assert-equal test; `model-config.json`
   authoritative per C-MODEL rule.
3. Live EIP-191 `verifyMessage` wired as injectable default (`ethersVerify`) with
   fake in tests — live signature verification proof deferred to hybrid lane.
4. `SESSION_HMAC_SECRET` rotation statement deferred (overlap param implemented).

## Hybrid backlog (explicit approval required — NOT executed)

- H1 live `gpt-5.6-luna` structured-output call (redacted log only).
- H2 regional `preflightPay` static-call evidence (decision/reasonCode/chainId).
- H3 fixed `SUPABASE_REGIONAL_FUNCTION_URL` + region confirmation record.
- Any H-failure fails closed per S1/S5 hard stops; no fallback permitted.

## Integrity notes (git reconciliation, read-only 2026-09-10)

- `origin/main` moved to `85a65c3` (merge of `44886a4` + `4eb7806`; `4eb7806` is the
  GitHub PR #3 merge that carried Phase 03 closeout into `main`).
- `85a65c3` is an undisclosed merge created in this clone during the split window
  (reflog: "merge origin/main: Merge made by the 'ort' strategy"; clean empty
  diff); remote-tracking reflog records an `origin/main` "update by push" from
  this clone covering that merge. The split report's "no push" claim is therefore
  corrected here: a push of the merge occurred; the three implementation commits
  below remain local and unpushed (verified: `ahead 3`, server `main` = `85a65c3`).
- `44886a4` ("Phase 04: AI Gateway executor planning", same workdir, 21:50) is the
  commit that captured the PVL Validate Contract working-tree write (+98/−1 replacing
  the placeholder); the contract text is byte-identical from `44886a4` through HEAD
  (verified: empty diff on the plan file across that range).
- The three implementation commits contain zero `process/` paths (verified).
- No work appears lost after reconciliation: supplement (S1–S7), Validate Contract
  (V1–V7 CONDITIONAL), all implementation files, and all process artifacts accounted
  for; working tree was clean at reconciliation time.

## No-push statement

No push was performed in this UPDATE PROCESS session. The three implementation
commits (`8c5e23c`, `77e5d25`, `ad6d50b`) remain local. Only a process-only docs
commit is created below, also unpushed.

## Appendix H — Hybrid lane STOPPED at Step 0 (2026-09-10, redacted)

- Verdict: STOPPED at Step 0 (presence-by-name). Zero live calls. Never green.
- Entry gates (read from this report, no re-run, no Deno): G1–G6 + G8 GREEN
  reported 2026-09-10; G7 CI-only/non-binding (Deno/Supabase CLIs absent, recorded).
  Implementation commits `8c5e23c`, `77e5d25`, `ad6d50b` present locally (verified).
- Step 0 presence-by-name (names only, zero values): server secret names 1/4 set
  (1/3 excluding service-role-if-unused); operational input names 1/5 set;
  `AGENT_SIGNER_PRIVATE_KEY` ABSENT by name enumeration (required absent, holds).
  Abort per §3/§6 — required names missing in lane shell. No values checked.
- Pre-call asserts (§4): NOT EXECUTED (lane aborted before Step 1). File pin
  observed but not claimed as lane evidence: `config/ai/model-config.json`
  parses as pinned shape (no lane assert run, no network).
- H1: NOT EXECUTED. Log shape only (no IDs, no latency, no bodies):
  `{provider:"openai", model:"gpt-5.6-luna", providerRequestId:"<not-run>", latencyMs:"<not-run>", decision:"<not-run>", storeConfirmed:"<not-run>", allowFallbackAsserted:"<not-run>"}`.
  Billable calls used: 0/3. Retries used: 0 (policy: once only on 502/503/429).
- H2: NOT EXECUTED. Evidence shape only:
  `{decision:"<not-run>", reasonCode:"<not-run>", chainId:"<not-run>", checkedAt:"<not-run>", correlationIds:{requestId:"<not-run>", intentId:"<not-run>"}}`.
  Read-only RPC attempts used: 0/3. Transactions: 0. Gas: 0. Signer ops: 0.
  No mainnet chain ID anywhere in lane commands/evidence/appendix.
- H3: NOT EXECUTED. Record shape only:
  `{regionalUrl:"<not-run>", expectedRegion:"<not-run>", actualRegion:"<not-run>", regionsMatch:"<not-run>", wranglerBindings:["SUPABASE_REGIONAL_FUNCTION_URL","ALLOWED_ORIGIN","RATE_LIMITER"], health:{requestId:"<not-run>", chainId:"<not-run>", provider:"openai", modelAvailable:"<not-run>"}}`.
  Repo `wrangler.toml` holds empty/placeholder binding values only (no secret).
- Cleanup (§9): lane-created sessions/intents 0 → revoked 0, expired 0, deleted 0;
  demo credential revocations 0 (none issued); final row counts 0/0;
  `SESSION_HMAC_SECRET` untouched (no lane rotation; operator out-of-lane only).
- Verification: `node scripts/check-no-secrets.mjs` 0 findings;
  `git status` clean-of-secrets (only untracked hybrid-gate-pack file, no key
  material); `git diff --check` clean; no `openai` SDK import added (raw-fetch
  port only); no fallback, no retry, no arbitrary upstream, no signer demand.
- Blocker (bounded): disposable lane env absent in lane shell per §3.
  Safe next action: operator provisions staging/disposable env via dashboard/CLI
  (never repo), confirms §3 input contract + §2 prerequisites, then re-opens the
  lane with a new explicit approval. Do not use production keys. No commit/push.

## EVL Green Record — G14-G17 Runtime Wiring (2026-09-11)

This is a process-only record of the post-implementation local EVL. Earlier
report sections and all historical V1-V7/G13 evidence remain unchanged.

### Evidence

- Genuine RED was captured for each G14-G17 focused test before implementation.
- Focused G14-G17 tests: **4/4 GREEN**.
- Relevant Vitest suite: **119/119 GREEN**.
- Function regression: **13/13 GREEN**.
- G1-G6 and G8: **GREEN**.
- G7: **CI-only/non-binding**.
- G12a: **6/6 GREEN**.
- G12b: **GREEN under Deno 2.9.6**.
- Typecheck, lint, AICD, and `git diff --check`: **GREEN**.
- Secret scan: **975 scanned / 0 findings**.
- `deno.lock` absent; `AGENT_SIGNER_PRIVATE_KEY` absent by name.
- Local session, gateway, executor, and health behavior verified.
- Remote schema parity remains **UNKNOWN / HYBRID-ONLY**.

### Deployment and Approval Boundary

The prior G13 deployment-only success remains preserved. The newly implemented
G14-G17 runtime wiring has **not** been deployed, and current staging does not
reflect the new runtime wiring. A post-runtime G13 staging redeploy is required
before H1-H3. H1, H2, and H3 are **NOT RUN** and remain separately
approval-gated. No deployment, migration, OpenAI/RPC call, transaction, secret
access, commit, or push occurred in this EVL/update pass.

**EVL classification:** LOCAL G14-G17 GREEN; post-runtime G13 redeploy
PENDING; H1-H3 NOT RUN; remote schema parity UNKNOWN/HYBRID-ONLY.

## EVL Green Record — Option A Persistence Foundation (2026-09-12)

This is a process-only closeout record for the Phase 04 persistence
supplement (`phase-04-session-intent-card-persistence-supplement_PLAN_12-09-26.md`,
Option A server-only PostgREST). Earlier report sections and all historical
V1-V7/G13/G14-G17 evidence remain unchanged.

### Evidence (reported persistence-foundation EVL)

- Focused persistence suites: **7/49 GREEN**.
- Full relevant Vitest: **29/171 GREEN**.
- G18 GREEN; G19 GREEN; G20 **16/16 GREEN**; G21 GREEN.
- G22 **UNKNOWN / HYBRID-ONLY** (no remote parity claimed).
- G1-G6/G8 GREEN; G7 CI-only/non-binding; G12a 6/6 GREEN; G12b GREEN under
  Deno `2.9.6` (`3+3` per-function check/bundle).
- Typecheck, lint, AICD GREEN; secret scan **989/0**; `git diff --check`
  GREEN.
- No `deno.lock`; `AGENT_SIGNER_PRIVATE_KEY` absent by name.
- V1 staleness is **doc-only** (no V1 rewrite; no behavior claim).

### Migration and Approval Boundary (CRITICAL)

- Migration `supabase/migrations/202609120001_persistence_contracts.sql` is
  **created/static-only, NOT applied**. No migration execution, DB reset,
  `db push`, deployment, OpenAI/RPC call, transaction, or secret access
  occurred or is claimed.
- Staging is **unchanged** and does not reflect the new persistence
  foundation.
- G13 evidence is **preserved but predates the foundation**: the historical
  G13 failure record and the historical deployment-only success record remain
  byte-identical and are not persistence/schema proof.
- Required next before H1-H3: **post-foundation migration + G13 staging
  redeploy under separate explicit approvals**. H1-H3 remain gated and
  NOT RUN.
- Remote schema parity is **UNKNOWN / HYBRID-ONLY**; G22 is the sole
  hybrid-only parity lane and is a hard stop before H1-H3.

**EVL classification:** OPTION A PERSISTENCE FOUNDATION GREEN (local/static
only); STAGING MIGRATION APPROVAL PENDING; G13 REDEPLOY PENDING; H1-H3 NOT
RUN; remote UNKNOWN/HYBRID-ONLY.
