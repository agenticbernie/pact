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

## H1–H3 Hybrid Lane Appendix — Post-Foundation Run 2026-09-12 (REDACTED)

**Lane approval:** explicit post-foundation H1–H3 approval 2026-09-12.
**Scope:** staging project `myotkovmgzdabuirkqlx` (East US) only. No
production data, keys, or customer credentials in scope.

**Step 0 (names only):** `OPENAI_API_KEY` present; `SESSION_HMAC_SECRET`
present; `SUPABASE_SERVICE_ROLE_KEY` absent (unused, per pack allowance);
`DEMO_TOKEN` present; `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_FUNCTION_REGION` (= `us-east-1`, pinned match), `CREDITCOIN_RPC_URL`
present; `OPENAI_MODEL` pinned-match (`gpt-5.6-luna`);
`AGENT_SIGNER_PRIVATE_KEY` ABSENT (required). `SUPABASE_REGIONAL_FUNCTION_URL`
absent pre-lane → derived via platform convention
(`https://<ref>.supabase.co/functions/v1`) and verified live below.

**Pre-call asserts (local, no network):** pinned config
(`openai`/`gpt-5.6-luna`/`allowFallback:false`) PASS;
`assertModelConfigAllowsCall` PASS; `resolveOpenAIModel` → pinned model PASS;
`store:false` + strict `pact_agent_intent` + merchantId-only schema +
retry-once shape verified in provider source PASS.

**H1 — live model call: BLOCKED (fail-closed, zero provider calls).**
One POST to the regional `ai-gateway` intent route returned HTTP 404
`INPUT_INVALID` with request echo + correlation headers in ~0.5s. The
deployed handler answers, but its exact-path route check does not match the
gateway-prefixed path. No retry (404 non-retryable). Billable OpenAI calls:
0. Payment calls: 0. Redacted log: `{provider:"openai",
model:"gpt-5.6-luna", decision:"INPUT_INVALID", storeConfirmed:false,
allowFallbackAsserted:false}`.

**H2 — regional preflight static-call: BLOCKED (fail-closed, zero chain
calls).** One POST to the regional `agent-executor` preflight route returned
HTTP 404 `INPUT_INVALID` with request echo in ~1.3s (same prefix cause). No
retry. Transactions: 0. Broadcasts: 0. Gas: 0. `AGENT_SIGNER_PRIVATE_KEY`
never present or requested.

**H3 — regional URL + region evidence: PARTIAL.**
Regional base URL is live, routed, and authenticated (lane credential
accepted; unauthenticated calls get gateway 401; authenticated unknown paths
get our function's correlated 404). Function versions observed post-redeploy:
`session` v2, `ai-gateway` v2, `agent-executor` v3, all `ACTIVE`.
Expected-vs-actual region pair: UNKNOWN — the `/health` handler is
unreachable behind the same path-prefix mismatch, so no region payload was
returned. `wrangler.toml`: `SUPABASE_REGIONAL_FUNCTION_URL` blank and
`RATE_LIMITER` binding commented out (edge path out-of-scope for the
Supabase-only deployment, per G17 classification — recorded, unchanged).

**Root cause (bounded blocker):** local composition tests address bare paths
(`/health`, `/v1/agent/intents`, `/v1/payments/preflight`), but the Supabase
gateway preserves the `/functions/v1/<slug>` prefix, so every production
route check misses. Fix requires prefix-aware routing (plus then the
fail-closed dependency composition already documented). No mock-green claim
is made.

**Budgets consumed:** OpenAI billable 0/3; chain reads 0; transactions 0;
migrations 0; secret values printed/persisted 0. No sessions, intents, or
rows created (all requests failed closed before persistence).

**Cleanup:** no lane rows to revoke/expire (nothing created);
`SESSION_HMAC_SECRET` untouched; secret scan 989/0; `git status` shows only
the approved migration syntax fix; lane response bodies deleted from
`/tmp`. Next action: prefix-aware routing fix → local RED-first tests →
post-fix G13 redeploy → H1–H3 re-approval.

## H1-H3 Corrected Live-Lane Appendix (2026-09-13, REDACTED)

This appendix records the approved corrected live lane. All earlier report
sections, including the original H1/H2/H3 appendix, G13, and V1-V7 evidence,
remain preserved and are not reclassified.

### Approved lane and precheck

- Target: `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1`;
  project: `myotkovmgzdabuirkqlx`.
- Precheck versions: `session` v6, `ai-gateway` v6, and `agent-executor` v7,
  all `ACTIVE`.
- `AGENT_SIGNER_PRIVATE_KEY` was absent by name. No secret values were
  printed or accessed.

### Route correction

The previous agent-executor smoke used the invalid path
`/functions/v1/agent-executor/preflight`. The correct public route is
`POST /functions/v1/agent-executor/v1/payments/preflight`. The previous 404 is
preserved as an invalid probe-path result and is not H2 evidence.

### H1 - AI intent route: BLOCKED

- Exact route: `POST /functions/v1/ai-gateway/v1/agent/intents`.
- Payload shape only: `{prompt,cardId}` using the approved local fixture values
  `buy coffee` and `7`.
- Pre-call assertions: model `gpt-5.6-luna`, `allowFallback:false`, and
  `store:false`.
- Two attempts total: the first attempt and the one allowed retry both
  returned HTTP `503`, mapped to `REGION_MISMATCH`.
- Redacted result: final response keys only
  `[code,message,requestId]`; no provider request ID, intent, or store result.
- Classification: **H1 BLOCKED**, not success. No raw response, prompt, body,
  or key is recorded.

### H2 - Payment preflight route: BLOCKED

- Exact corrected route: `POST /functions/v1/agent-executor/v1/payments/preflight`.
- Approved fixture from `prefix-routing.vitest.test.ts`:
  `{intentId:"intent-1",cardId:"7",nonce:"7:1"}`.
- One HTTP attempt returned HTTP `503` `PREFLIGHT_DECLINED`.
- Redacted response keys only: `[code,message,requestId]`.
- No static decision, `reasonCode`, `chainId`, or `checkedAt` was returned;
  no transaction, gas, or signer operation occurred. No static-call result was
  produced, and no server-side RPC count is inferred beyond the fail-closed
  response.
- Classification: **H2 BLOCKED** before usable static-call evidence. H2 is not
  GREEN and no RPC success is claimed.

### H3 - Public health route: PARTIAL

- Exact route: `GET /functions/v1/ai-gateway/health`.
- One HTTP attempt returned HTTP `200`.
- Response keys only:
  `[chainId,configuredRegion,expectedRegion,model,modelAvailable,provider,requestId]`.
- Redacted values: `chainId` `102031`; provider `openai`; `modelAvailable`
  `false`; `configuredRegion` `unknown`; `expectedRegion` `us-east-1`.
- The known session route gate remains HTTP `503` `PROVIDER_UNAVAILABLE` from
  the G13 smoke. Health reachability alone is not region evidence.
- Classification: **H3 PARTIAL**; no region match is claimed.

### Budget and final classification

- HTTP budget used: H1 `2` attempts; H2 `1` attempt; H3 `1` attempt.
- Transactions `0`; gas `0`; signer operations `0`; migrations `0`.
- No secret values were printed or accessed. No H1/H2/H3 implementation
  changes, commit, or push occurred.
- Final classification: **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**.
- Phase 04 is **NOT READY FOR CLOSEOUT**.
- Next action: obtain a new bounded correction/approval for region/runtime
  configuration or valid H2 runtime wiring. Do not rerun this lane without new
  approval.

## G23 Hosted Path Diagnostic Supplement - Blocked Deployment Record (2026-09-13, REDACTED)

This is an append-only record for the approved temporary pathname-only
diagnostic lane. All earlier report sections, G13 history, V1-V7 evidence, and
the H1-H3 dispositions remain unchanged.

### Local Diagnostic Execution

- Exact pre-implementation command:
  `corepack yarn vitest run supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`.
  Result: **20 tests collected, 11 passed, 9 failed**. This was an invalid
  RED, not genuine hosted-only RED: all six new bare/hosted diagnostic success
  cases failed before the new route existed, along with source-presence checks.
  No RED evidence is claimed; the supplement's RED waiver applies.
- Exact post-implementation diagnostic command: **20/20 GREEN** against the
  three `start*Server` production composition roots, with fake dependencies,
  exact five-key bare and hosted bodies, invalid-path and method rejection,
  protected-work ordering, and source-scoped removal coverage.
- Prefix-routing regression: **12/12 GREEN**.
- Deploy-compatibility regression: **8/8 GREEN**.
- Relevant Vitest regression command: **28 files, 180 tests GREEN** while the
  temporary route and test existed.
- Typecheck: **GREEN**.
- Lint: **GREEN** after removing one unused test constant and two unnecessary
  escapes.
- AICD: **GREEN**, 0 failures; 11 components, 6 flows, 17 scenarios.
- Secret scan before cleanup: **995 scanned, 0 findings**.
- `git diff --check` before and after cleanup: **GREEN**.
- Deno `2.9.6` check/bundle: **NOT RUN; `deno` was not installed or
  discoverable in the current shell**.

### Staging Boundary and Smoke

- Approved target: staging project/ref `myotkovmgzdabuirkqlx` only.
- Required pre-mutation ref verification: **NOT RUN** because the `supabase`
  CLI was not installed or discoverable; no local `node_modules/.bin/supabase`
  wrapper was present.
- Required deploy command:
  `supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`.
  **NOT RUN.** No deployment output or fresh function version status was
  obtained in this pass. No substitute CLI, package fetch, or credential
  access was attempted.
- Diagnostic HTTP smoke: **NOT RUN; 0 requests**. No hosted route, health,
  session, intent, preflight, execute, OpenAI, RPC, transaction, migration,
  signer, or secret operation occurred.
- G13 post-fix redeploy remains pending and separately approval-gated.
  H1-H3 remain **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL** and pending; no G13 or
  H1-H3 success is claimed by this supplement.

### Removal Verification

- Removed the temporary diagnostic branch from `session/index.ts`,
  `ai-gateway/index.ts`, and `agent-executor/index.ts`.
- Deleted `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`.
- Exact removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
  **GREEN, zero matches**.
- Post-removal prefix-routing: **12/12 GREEN**.
- Post-removal deploy-compatibility: **8/8 GREEN**.
- Post-removal relevant Vitest regression: **27 files, 160 tests GREEN**.
- Post-removal secret scan: **994 scanned, 0 findings**.
- Post-removal typecheck and lint: **GREEN**.
- Temporary route was not redeployed after removal. Local removal proof only;
  fresh G13 and H1-H3 require separate approval and available toolchains.

### Final Classification

**G23 hosted-path diagnostic: LOCAL DIAGNOSTIC GREEN, TEMPORARY DEPLOYMENT
BLOCKED BY MISSING SUPABASE CLI, HOSTED SMOKE NOT RUN, ROUTE REMOVED.**

Touched during this lane: the three existing function entrypoints (temporary
branch added and removed), the temporary diagnostic test (created, run, and
deleted), and this report append. Existing unrelated worktree changes were
preserved. No commit or push was performed.

## G23 Hosted Path Diagnostic Repeat - Safety-Blocked Smoke (2026-09-13, REDACTED)

This is an append-only redacted record for the repeated approved temporary
pathname diagnostic lane. All earlier report sections, classifications,
deployment histories, and H1-H3 dispositions remain unchanged. The temporary
route was removed immediately after the bounded smoke attempts and was not
redeployed.

### Local Diagnostic Execution

- Exact focused pre-implementation command:
  `corepack yarn vitest run supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`.
  Result: **19 tests collected, 7 passed, 12 failed**. This was the known
  invalid/waived RED: the three source-presence assertions failed and all nine
  bare/hosted diagnostic success assertions failed before the route existed.
  It is not genuine RED evidence.
- Exact focused post-implementation command: **19/19 GREEN** against the
  three `start*Server` production composition roots with fake dependencies and
  the five-key diagnostic response assertions.
- Pre-removal local gates: prefix-routing **12/12 GREEN**;
  deploy-compatibility **8/8 GREEN**; relevant Vitest regression **28 files /
  179 tests GREEN**; typecheck **GREEN**; lint **GREEN**; AICD **GREEN** with
  0 failures and 11 components, 6 flows, 17 scenarios; secret scan
  **995 scanned / 0 findings**; `git diff --check` **GREEN**.
- Deno check/bundle was not run because `deno` was unavailable in the shell.
  No Deno result is claimed.

### Staging Deployment

- Target verification command was run immediately before mutation:
  `npx --yes supabase functions list --project-ref myotkovmgzdabuirkqlx`.
  The requested staging ref was present in the command; listed pre-deploy
  slugs were `session`, `ai-gateway`, and `agent-executor`, all `ACTIVE`, at
  versions `6`, `6`, and `7` respectively.
- Exact deploy command run:
  `npx --yes supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`.
  Result: **SUCCEEDED** for only the three requested slugs on the approved
  staging project. No migration, database push/reset, provider call, RPC call,
  transaction, signer access, or secret value access occurred.
- Post-deploy redacted list: `session` **ACTIVE v7**; `ai-gateway` **ACTIVE
  v7**; `agent-executor` **ACTIVE v8**. No tokens or function IDs are retained
  in this report.

### Bounded Smoke Result

- Six GET attempts were issued with no retries and no non-diagnostic route
  calls. The three intended bare probes were mistakenly sent to the same
  project-root `/__diag_path` URL rather than function-attributable endpoints;
  each returned HTTP **404**, with no allowlisted diagnostic fields. These are
  not per-function bare-route results.
- One GET was attempted for each hosted path:
  `/functions/v1/session/__diag_path`,
  `/functions/v1/ai-gateway/__diag_path`, and
  `/functions/v1/agent-executor/__diag_path`. The response guard detected
  secret-shaped text before status/body emission for each response, withheld
  all three statuses and bodies, and stopped the smoke lane. No raw response,
  headers, tokens, or secret-shaped value was printed or persisted. No
  diagnostic five-key body was recorded for these three requests.
- Because the hosted statuses were withheld and the bare probes were not
  function-attributable, hosted pathname verification is **BLOCKED / NOT
  PROVEN**. No hosted diagnostic success or failure is promoted to G13 or
  H1-H3 evidence.

### Removal Verification

- Removed the temporary diagnostic branch from `session/index.ts`,
  `ai-gateway/index.ts`, and `agent-executor/index.ts`.
- Deleted `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`.
- Exact removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
  **PASS**, zero matches.
- Post-removal prefix-routing **12/12 GREEN**; deploy-compatibility **8/8
  GREEN**; relevant Vitest regression **27 files / 160 tests GREEN**;
  typecheck **GREEN**; lint **GREEN**; AICD **GREEN**; secret scan
  **994 scanned / 0 findings**; `git diff --check` **GREEN**.
- No redeploy was performed after removal. **G13 remains pending. H1 BLOCKED,
  H2 BLOCKED, and H3 PARTIAL remain pending and unchanged.**

### Final Classification

**G23 hosted-path diagnostic repeat: LOCAL GREEN, STAGING DEPLOYMENT
SUCCEEDED, HOSTED SMOKE SAFETY-BLOCKED / NOT PROVEN, TEMPORARY ROUTE REMOVED.**

Touched during this repeat lane: the three existing function entrypoints
(temporary branches added and removed with no net diagnostic change), the
temporary diagnostic test (created, run, and deleted), and this report append.
Existing unrelated dirty changes and historical artifacts were preserved. No
commit or push was performed.

## G13 Staging Redeploy and Prefixed Health Verification (2026-09-13, REDACTED)

This is an append-only redacted process record. All earlier report sections,
historical deployment records, G23 records, and H1-H3 dispositions remain
unchanged.

### Pre-Mutation Verification

- Approved target confirmed by command scope: Supabase project/ref
  `myotkovmgzdabuirkqlx` only.
- `npx --yes supabase --version`: **2.117.0**.
- `npx --yes supabase functions list --project-ref myotkovmgzdabuirkqlx`:
  `session` **ACTIVE v7**; `ai-gateway` **ACTIVE v7**;
  `agent-executor` **ACTIVE v8**.
- No token, secret value, function ID, or secret-shaped value was printed or
  retained.

### Deployment

- Exact command:
  `npx --yes supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`.
- Result: **SUCCEEDED** for exactly `session`, `ai-gateway`, and
  `agent-executor` on the approved staging project.
- No migration, `db push`, `db reset`, SQL execution, OpenAI call, RPC call,
  transaction, signer operation, or secret-value access occurred.

### Post-Deploy Function Status

- Redacted function list: `session` **ACTIVE v8**; `ai-gateway` **ACTIVE v8**;
  `agent-executor` **ACTIVE v9**.
- All three deployed slugs are **ACTIVE**.

### Bounded Prefixed Health GET

- Exactly one `GET` was sent to the exact approved URL:
  `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/ai-gateway/health`.
- HTTP status: **401**.
- The prefixed endpoint was reachable at the HTTP boundary, but no approved
  health payload was returned. The response body had an unexpected shape and
  was withheld; no body, headers, token, request ID, or secret-shaped value was
  recorded. No health keys or values are claimed, and health is **not green**.
- No session, intent, preflight, execute, diagnostic, OpenAI, RPC, payment,
  transaction, migration, or signer route was called.

### Post-Deploy Local Verification

- Exact removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
  **PASS**, zero matches.
- Prefix-routing regression: **12/12 GREEN**.
- Deploy-compatibility regression: **8/8 GREEN**.
- Secret scan: **994 scanned / 0 findings**.
- `git diff --check`: **GREEN**.
- No redeploy was performed after these checks.

### Final Classification

**G13 deployment: SUCCEEDED. Prefixed health: HTTP endpoint reachable, health
payload unavailable at HTTP 401, not green.** H1/H2/H3 remain separately
gated and **NOT EXECUTED**. No commit or push was performed.

Touched by this record: `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md` only; no implementation or test-source files were changed.

## H1-H3 Autopilot Bounded Rerun Appendix (2026-09-13, REDACTED)

This is an append-only redacted record for the explicitly approved staging
lane. All earlier report sections, appendices, classifications, G13 history,
and H1-H3 dispositions remain unchanged.

### Lane Preconditions

- Scope: staging project/ref `myotkovmgzdabuirkqlx` only; fixed regional base
  URL from the approved G13 output was used.
- Required environment names were present for the configured lane inputs;
  `AGENT_SIGNER_PRIVATE_KEY` was absent by name before and after the run.
- Local pre-call assertions passed: `provider=openai`,
  `model=gpt-5.6-luna`, `allowFallback=false`, `store=false`, strict
  `pact_agent_intent` schema, and merchantId-only output shape.
- Focused local model/intent assertions: **7/7 GREEN**.
- No secret values, request bodies, prompts, bearer material, or raw response
  bodies were printed or persisted.

### H1 - AI Intent Route: BLOCKED

- Exact route: `POST /functions/v1/ai-gateway/v1/agent/intents`.
- One regional request was issued with the approved minimal fixture; the
  response was HTTP **503** mapped to `REGION_MISMATCH`.
- Redacted result:
  `{provider:"openai",model:"gpt-5.6-luna",attempts:1,providerRequestId:"not-returned",latencyMs:1021,decision:"REGION_MISMATCH",storeConfirmed:false,allowFallbackAsserted:false}`.
- Response keys only: `[code,message,requestId]`; correlation ID was
  `h1-lane-1`. No provider request ID, intent, or persistence result was
  returned. No retry was issued after the mapped error.
- Classification: **H1 BLOCKED**. No fallback provider, model, or region was
  used. No provider success is claimed.

### H2 - Regional Read-Only Preflight: BLOCKED

- Exact route: `POST /functions/v1/agent-executor/v1/payments/preflight`.
- One regional request was issued with the approved server-bound fixture; the
  response was HTTP **503** mapped to `PREFLIGHT_DECLINED`.
- Response keys only: `[code,message,requestId]`; correlation ID was
  `h2-lane-1`. `decision`, `reasonCode`, `chainId`, and `checkedAt` were not
  returned, so no usable static-call evidence was produced.
- Classification: **H2 BLOCKED**. Server-side RPC sub-attempt count was not
  exposed; no RPC success is inferred. No execute route, broadcast, gas,
  transaction, or signer operation occurred.

### H3 - Fixed Regional Health: PARTIAL

- Exact route: `GET /functions/v1/ai-gateway/health` at the approved fixed
  regional URL `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1`.
- Exactly one GET was issued without a second probe. HTTP status was **401**.
- The payload shape was not an approved health shape and was withheld. No
  health keys, request ID, actual region, model availability, or provider
  result is claimed. Expected region is `us-east-1`; actual region is
  `not-returned`; region match is `not-determined`.
- Binding names reviewed/allowed were
  `SUPABASE_REGIONAL_FUNCTION_URL`, `ALLOWED_ORIGIN`, and `RATE_LIMITER`.
  The committed Worker URL remains a blank placeholder and the rate-limit
  binding remains inactive; neither is treated as hosted proof.
- Classification: **H3 PARTIAL**. HTTP reachability alone does not prove
  region, model, or health configuration.

### Budget and Cleanup

- H1 regional requests: **1/2 maximum**; server-side provider-attempt detail
  was not exposed. The implementation retry ceiling remained at two, and the
  lane issued no client retry after the mapped error; the overall provider
  budget cap of **3** was not exceeded.
- H2 regional preflight requests: **1/3 maximum**; read-only RPC success:
  **not proven**. H3 health GETs: **1/1**.
- Transactions `0`; gas `0`; signer operations `0`; migrations `0`.
- Lane-created sessions `0`; lane-created intents `0`; cleanup actions `0`.
  No disposable state was created by the failed-closed requests.
- Final classification: **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**. Phase 04
  remains **NOT READY FOR CLOSEOUT**.
- Verification after the lane: `node scripts/check-no-secrets.mjs` reported
  **994 scanned / 0 findings**; `git diff --check` was **GREEN**. No
  implementation, migration, deployment, commit, or push occurred.

## G22 Staging Schema Parity Attempt (2026-09-13, REDACTED)

This is an append-only read-only parity record. All earlier report sections,
appendices, classifications, and evidence remain unchanged.

### Scope and Ref Confirmat

## G22 Staging Schema Parity Continuation and Independent Correction EVL (2026-09-13, REDACTED)

The incomplete G22 heading and partial line immediately above this section are
preserved byte-for-byte. This section is the complete additive continuation.
All prior H1-H3, G13, G23, V1-V7, G14-G22, and correction-history records remain
historical and are not rewritten or reused as newer success evidence.

### G22 Read-Only Attempt

- Approved target: staging project/ref `myotkovmgzdabuirkqlx` only.
- Exact command rerun successfully after disk recovery:
  `npx --yes supabase db diff --linked --schema public --project-ref myotkovmgzdabuirkqlx`.
- The shadow database built and applied both local migrations:
  `202609080001` and `202609120001`.
- The command output was non-empty and included:
  `alter table public.payment_attempts enable row level security;` and a
  `public.rls_auto_enable()` event-trigger definition.
- Therefore remote schema parity is **NOT GREEN**. G22 is classified
  **UNKNOWN / DRIFT**, not parity success. No schema or migration was altered
  to make the diff empty.
- No migration, reset, database push, deployment, OpenAI/RPC call, transaction,
  signer operation, or secret-value access occurred in this continuation.

### Independent Local Correction EVL

- G31: **2/2 GREEN**. The mandatory function-only owner/session predicate was
  enforced; the conditional agent predicate behavior is preserved.
- G32: **6/6 GREEN**. The owner predicate is mandatory and the agent predicate
  is emitted when the authoritative agent value is supplied.
- G33: **13/13 GREEN**.
- Post-correction G24-G30 rerun: **48/48 GREEN**.
- Prefix routing: **12/12 GREEN**. Deploy compatibility: **8/8 GREEN**.
- Full relevant Vitest regression: **35 files / 198 tests GREEN**.
- Typecheck, lint, AICD, and `git diff --check`: **GREEN**.
- Secret scan: **1001 scanned / 0 findings**. Diagnostic tokens: **zero**.
- API error codes remain exactly **15**. No `openai` package or import exists.
- The read-only executor path contains no signer, broadcast, gas, send, or
  payment-send operation.
- Deno local checks were unavailable in the current shell and are not claimed.

### Current Phase Disposition and Approval Boundary

- Existing G13 deployment versions `v8`/`v9` and H1/H2/H3 results predate the
  latest correction and are not reused. The latest local correction is not
  deployed.
- Phase 04 remains **NOT VERIFIED / NOT CLOSED**.
- The next exact action is a separately approved corrected G13 staging redeploy,
  followed by hosted smoke/health verification. Fresh H1-H3 evidence requires a
  separate approval only after that result.
- G22 drift requires a later plan and explicit approval if it is determined to
  be a true contract mismatch. No schema or migration change is authorized by
  this record.

**Additive EVL classification:** local correction EVL GREEN; G22 UNKNOWN/DRIFT;
latest correction undeployed; G13 redeploy and fresh H1-H3 remain separately
approval-gated; Phase 04 NOT VERIFIED / NOT CLOSED.

### G22 Migration-List Clarification (Additive)

The approved staging migration list showed both `202609080001` and
`202609120001` as applied. This records observed migration state only; the
continuation above performed no migration, reset, schema change, or push.

## G13 Corrected Composition Staging Deployment Record (2026-09-13, REDACTED)

This is an immutable additive correction record. Every prior byte in this
report, including the prior G13 records, G22 records, and H1-H3 appendices,
remains preserved and is not rewritten or reclassified.

### Immediate Pre-Mutation Verification

- Approved project/ref: `myotkovmgzdabuirkqlx` only.
- `npx --yes supabase --version`: **2.117.0**.
- `npx --yes supabase functions list --project-ref myotkovmgzdabuirkqlx`:
  `session` **ACTIVE v8**; `ai-gateway` **ACTIVE v8**;
  `agent-executor` **ACTIVE v9**.
- No token or secret value was printed or recorded.

### Approved Deployment

- Exact command:
  `npx --yes supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`.
- Result: **SUCCEEDED** for exactly `session`, `ai-gateway`, and
  `agent-executor` on the approved staging project.
- No migration, database push/reset, SQL/schema change, production ref,
  OpenAI/provider call, RPC call, payment, transaction, signer operation, or
  secret-value access occurred.

### Post-Deploy Function Status

- `session` **ACTIVE v9**.
- `ai-gateway` **ACTIVE v9**.
- `agent-executor` **ACTIVE v10**.
- All three approved slugs are **ACTIVE**.

### Single Approved Health GET

- Exactly one unauthenticated read-only `GET` was sent to:
  `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/ai-gateway/health`.
- HTTP status: **200**.
- The response had exactly the approved seven-key health shape. Safe approved
  fields only: `chainId` `102031`; `configuredRegion` `ap-southeast-1`;
  `expectedRegion` `us-east-1`; `model` `gpt-5.6-luna`;
  `modelAvailable` `false`; `provider` `openai`; `requestId` present and
  redacted.
- Health is **NOT GREEN**: configured and expected regions differ, and the
  configured model is unavailable. No raw body, token, header, or secret-shaped
  value was recorded.
- No session, intent, preflight, execute, diagnostic, OpenAI, RPC, payment,
  transaction, migration, or signer route was called.

### Post-Deploy Local Proofs

- Removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
  **PASS**, zero matches.
- Prefix routing: **13/13 GREEN**.
- Deploy compatibility: **8/8 GREEN**.
- Secret scan: **1001 scanned / 0 findings**.
- `git diff --check`: **GREEN**.

### Final Classification and Boundaries

**G13 corrected staging deployment: SUCCEEDED; all three functions ACTIVE;
approved health endpoint HTTP 200 but NOT GREEN due to region mismatch and
`modelAvailable:false`.** G22 remains **UNKNOWN/DRIFT** and was not changed.
H1-H3 remain separately approval-gated and **NOT EXECUTED**. No migration,
schema change, provider/RPC call, transaction, signer operation, commit, or
push was performed.

Touched by this lane: this report append only. Existing unrelated worktree
changes were preserved.

## Approved Runtime Configuration Record (2026-09-13, REDACTED)

This is an immutable additive process record. All prior report bytes remain
preserved and are not rewritten.

- Target project/ref: `myotkovmgzdabuirkqlx`.
- CLI precheck: Supabase CLI `2.117.0`; project ref and staging region verified
  before mutation.
- Setting name: `PACT_EXPECTED_REGION` present after the write.
- Value: not recorded.
- Result: **SUCCEEDED**. Post-write names-only/redacted secret listing confirmed
  the setting name. No deployment, migration, reset, push, provider/RPC call,
  payment, transaction, signer operation, or other configuration write was
  performed.

## G13 Fresh Corrected Staging Deployment Record (2026-09-13, REDACTED)

This is an immutable additive G13 record. All prior report bytes, deployment
records, G22 records, and H1-H3 appendices remain preserved and are not
rewritten or reclassified.

### Pre-Mutation Verification

- Approved target project/ref: `myotkovmgzdabuirkqlx` only.
- `npx --yes supabase --version`: command passed; value withheld.
- `npx --yes supabase functions list --project-ref myotkovmgzdabuirkqlx`:
  command passed and the approved target functions were present.
- `PACT_EXPECTED_REGION`: setting name present; value withheld.
- No token, secret value, function ID, or secret-shaped value was printed or
  recorded.

### Approved Deployment

- Exact command:
  `npx --yes supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`.
- Result: **SUCCEEDED** for exactly the three approved slugs on the staging
  project.
- No migration, database push/reset, schema change, production target,
  OpenAI/provider call, RPC call, payment, transaction, signer operation, or
  secret-value access occurred.

### Post-Deploy Function Status

- `session` **ACTIVE v11**.
- `ai-gateway` **ACTIVE v11**.
- `agent-executor` **ACTIVE v12**.
- All three approved slugs are **ACTIVE**.

### Single Approved Health GET

- Exactly one unauthenticated `GET` was sent to:
  `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/ai-gateway/health`.
- HTTP status: **200**.
- Exact seven-key health shape, safe fields only:
  `chainId=102031`; `configuredRegion=ap-southeast-1`;
  `expectedRegion=us-east-1`; `model=gpt-5.6-luna`;
  `modelAvailable=false`; `provider=openai`; `requestId=<redacted>`.
- Health is **NOT GREEN** because configured and expected regions differ and
  `modelAvailable=false`. Unexpected or secret-shaped payload data was not
  recorded.
- No session, intent, preflight, execute, provider, RPC, payment,
  transaction, migration, or signer route was called.

### Post-Deploy Local Proofs

- Removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
  **PASS**, zero matches.
- Prefix routing: **13/13 GREEN**.
- Deploy compatibility: **8/8 GREEN**.
- Secret scan: **1002 scanned / 0 findings**.
- `git diff --check`: **GREEN**.

### Final Classification and Boundaries

**G13 fresh corrected staging deployment: SUCCEEDED; all three functions
ACTIVE; approved unauthenticated health GET HTTP 200 with valid seven-key shape,
but health NOT GREEN due to region mismatch and `modelAvailable=false`.** G22
remains **UNKNOWN/DRIFT**. H1-H3 remain separately gated and **NOT EXECUTED**.
No implementation edits, migration, schema change, provider/RPC call,
transaction, signer operation, commit, or push was performed.

Touched by this record: this report append only.

## H1-H3 Corrected Global-Edge Autopilot Appendix (2026-09-14, REDACTED)

This is an immutable additive record for the explicitly approved staging lane.
All prior report bytes, G22/G35 records, G13 history, and H1-H3 evidence remain
preserved and are not rewritten or reclassified.

### Names-Only and Target Precheck

- Approved target project/ref: `myotkovmgzdabuirkqlx` only.
- Remote function listing succeeded for exactly the approved function set:
  `session` ACTIVE v11, `ai-gateway` ACTIVE v11, and `agent-executor` ACTIVE
  v12.
- Remote approved setting/secret names were present by name: `PACT_EXPECTED_REGION`,
  `OPENAI_API_KEY`, `OPENAI_MODEL`, `SESSION_HMAC_SECRET`,
  `CREDITCOIN_RPC_URL`, and `DEMO_TOKEN`. `AGENT_SIGNER_PRIVATE_KEY` was
  absent by name. No values were printed, accessed for output, or persisted.
- Local pre-call assertions passed: provider `openai`, model `gpt-5.6-luna`,
  `allowFallback:false`, `store:false`, strict `pact_agent_intent` schema,
  `additionalProperties:false`, and merchantId-only authority fields.
- The corrected global-edge contract was used: expected project region
  `us-east-1`; `SB_REGION` remained platform-observed only and was not set,
  overridden, or synthesized by the lane.
- No valid disposable wallet session token was present in the existing lane
  inputs. No session, signature, signer, or secret was created or requested.

### H1 - AI Intent Route: BLOCKED

- Exact route: `POST /functions/v1/ai-gateway/v1/agent/intents`.
- One request was issued with the approved minimal fixture; HTTP `401` with
  response keys `[code,message,requestId,retryable]` and decision
  `AUTH_REQUIRED`.
- Redacted result:
  `{provider:"openai",model:"gpt-5.6-luna",attempts:1,providerRequestId:"not-returned",latencyMs:1121,decision:"AUTH_REQUIRED",storeConfirmed:false,allowFallbackAsserted:false}`.
- The request was blocked before provider, intent, or persistence evidence.
  No retry was eligible, no fallback was used, and no provider success is
  claimed. **H1 BLOCKED**.

### H2 - Regional Read-Only Preflight: BLOCKED

- Exact route: `POST /functions/v1/agent-executor/v1/payments/preflight`.
- One request was issued with the approved server-bound fixture; HTTP `401`
  with response keys `[code,message,requestId,retryable]` and `AUTH_REQUIRED`.
- `decision`, `chainId`, and `checkedAt` were not returned;
  `reasonCode` was not a preflight reason code, and no usable static-call
  evidence was produced. Correlation IDs were
  `{requestId:"autopilot-h2-01",intentId:"intent-1"}`.
- No RPC evidence, execute route, gas, transaction, broadcast, or signer
  operation occurred. **H2 BLOCKED**.

### H3 - Fixed Regional Health: PARTIAL

- Exactly one fixed prefixed GET was issued to
  `/functions/v1/ai-gateway/health`; HTTP `200`.
- Exact seven-key shape:
  `[chainId,configuredRegion,expectedRegion,model,modelAvailable,provider,requestId]`.
- Safe health metadata: `chainId=102031`, `configuredRegion=ap-southeast-1`
  (non-empty observed runtime region), `expectedRegion=us-east-1`,
  `model=gpt-5.6-luna`, `modelAvailable=false`, `provider=openai`, and a
  redacted request ID.
- The provider field and model availability are recorded only as reported
  health metadata. Health reachability does not prove H1 provider access or
  region success. **H3 PARTIAL**.

### Budget, Cleanup, and Final Classification

- H1 regional requests: `1`; provider request/capability evidence: none;
  allowed retry requests: `0`.
- H2 regional preflight requests: `1/3`; read-only RPC evidence: none.
- H3 health GETs: `1/1`.
- Transactions `0`; gas `0`; signer operations `0`; migrations/resets/pushes
  `0`; lane-created sessions/intents/rows `0`; cleanup actions `0`.
- G22 remains **UNKNOWN/DRIFT** and is not changed by this lane.
- Final classification: **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**. Phase 04
  remains **NOT READY FOR CLOSEOUT**. No implementation, plan, migration,
  deployment, commit, or push was performed.

## H1-H3 Authenticated Checkpoint Rerun (2026-09-14, REDACTED)

This is an immutable additive record. All prior report bytes, H1-H3 evidence,
G22/G35 records, and H3 health evidence remain preserved and are not rewritten
or reclassified.

### H1 - AI Intent Route: BLOCKED

- Exact route: `POST /functions/v1/ai-gateway/v1/agent/intents`.
- One authenticated request used the approved minimal fixture `{prompt,cardId}`
  with the existing approved fixture values. HTTP `401`; redacted code
  `AUTH_INVALID`; response keys `[code,message,requestId,retryable]`.
- Safe metadata: `requestId="autopilot-h1-01"`, latency `728.849ms`,
  provider request ID not returned, persistence not observed, and no retry was
  eligible. **H1 BLOCKED** before provider or persistence evidence.

### H2 - Regional Read-Only Preflight: BLOCKED

- Exact route: `POST /functions/v1/agent-executor/v1/payments/preflight`.
- One authenticated request used the approved server-bound disposable fixture.
  HTTP `401`; redacted code `AUTH_INVALID`; response keys
  `[code,message,requestId,retryable]`.
- Safe metadata: `requestId="autopilot-h2-01"`, latency `302.463ms`, no
  decision/reasonCode/chainId/checkedAt or static-call evidence, and no
  persistence observed. No RPC, execute route, gas, transaction, broadcast, or
  signer operation occurred. **H2 BLOCKED**.

### H3 - Carried Forward

- No health request was made. The approved single H3 request remains HTTP `200`
  with the exact seven-key shape, expected region `us-east-1`, observed runtime
  region `ap-southeast-1`, provider `openai`, model `gpt-5.6-luna`, and
  `modelAvailable=false`. **H3 PARTIAL**.

### Budget, Cleanup, and Final Classification

- H1: `1/3` provider-lane attempts used; `0` retries.
- H2: `1/3` read-only attempts used; `0` retries.
- H3: `1/1` health request carried forward; `0` new requests.
- Transactions, gas, signer operations, migrations/resets/pushes, and
  lane-created disposable rows: `0`; cleanup actions: `0`.
- No token value, raw request/response, prompt, card data, key, or secret value
  was printed, persisted, or recorded. No implementation, plan, deployment,
  commit, or push was performed.
- Final classification: **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**. The blocker
  is invalid application authentication; no provider or read-only RPC success
  is claimed.

## H1-H2 Business-State Eligibility Diagnosis (2026-09-14, REDACTED)

This additive record follows the authenticated checkpoint and does not rewrite
prior H1-H3 evidence.

### Findings

- H1 exact hosted result: HTTP `400` `CARD_NOT_ELIGIBLE` for the approved
  `{prompt:"buy coffee",cardId:"7"}` fixture. The gateway emits this result
  when its owner-scoped card lookup returns no eligible card, before provider
  execution (`supabase/functions/ai-gateway/index.ts` card lookup and
  `CARD_NOT_ELIGIBLE` branch). The safe hosted response does not distinguish
  missing card `7`, owner/session mismatch, or an invalid card row. This is
  expected fail-closed policy behavior, not evidence that authentication was
  weakened or bypassed.
- H2 exact hosted result: HTTP `200`, `decision:"declined"`,
  `reasonCode:"PREFLIGHT_DECLINED"`, `chainId:102031` for
  `{intentId:"intent-req-1"}`. The read-only executor returns this reason for
  a missing/expired owner-scoped intent and also maps a declined chain
  `preflightPay` result to the same safe reason. The response intentionally
  does not identify which predicate failed. No RPC success, transaction, gas,
  broadcast, or signer operation is claimed.
- Classification: the hosted gap is missing or mismatched staging business
  state and/or expected chain-policy decline; the exact subpredicate cannot be
  separated from the approved non-secret response surface without a read-only
  database/state verifier.

### Safe local correction

The read-only executor now forwards the server-bound intent amount and expiry
deadline to the static preflight input. These are required by the controller's
`preflightPay(cardId,merchantId,amount,asset,nonce,deadline)` contract and were
previously omitted from `supabase/functions/agent-executor/index.ts`. The
correction is limited to `chain-client.ts`, the read-only preflight composition,
and a regression assertion; authentication, owner binding, policy checks, and
the read-only transport boundary are unchanged.

Local EVL after the correction: focused executor/runtime tests `11/11` GREEN,
typecheck GREEN, lint GREEN, AICD GREEN, secret scan `1002/0`, and
`git diff --check` GREEN. No hosted deployment was performed, so the deployed
H1/H2 runtime does not yet include this correction.

### Staging prerequisite and disposition

The approved minimal staging seed would require an existing schema and a
staging-only write credential: an owner-scoped eligible `cards` row for card
`7`, followed by an owner-scoped, unexpired `ready` intent with ID
`intent-req-1`, matching card/agent/policy/native asset, `coffee-demo`, amount,
canonical hash, and idempotency key. No staging migration was run.
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` were absent
by name in the current process, so no seed/upsert was possible and no staging
data was mutated. H1/H2 rerun remains pending schema/credential availability,
deployment of the local correction, and the approved staging seed/state.

## H1-H2 Staging Completion Attempt (2026-09-14, REDACTED)

- Local EVL remained GREEN before deployment: focused executor/runtime tests
  `11/11`, typecheck, lint, AICD, secret scan `1002/0`, and diff check.
- Project-ref verification used only `myotkovmgzdabuirkqlx`; the pre-deploy
  function list showed `session v11`, `ai-gateway v11`, and
  `agent-executor v12`, all ACTIVE.
- Approved deploy command completed against that ref. `session` and
  `ai-gateway` reported no change; corrected `agent-executor` deployed ACTIVE
  as version `13`. No production ref, migration push, reset, signer, or
  transaction was used.
- Read-only linked schema inspection confirmed public tables `cards` and
  `intents` exist, but returned no row for card `7` and no row for intent
  `intent-req-1`.
- The approved two-row seed scope was presented and explicitly approved, but
  authoritative card-7 chain fields were unavailable: agent, controller
  provenance, policy version, allowlist hash, source block/transaction, and
  current chain limits/expiry could not be verified. The checked-in network
  config remains unverified/placeholder and the required RPC/deployment input
  names were absent. No synthetic values were written and no staging data was
  mutated.
- Non-mutating post-deploy rerun with the exact approved routes and fixtures:
  H1 HTTP `400` `CARD_NOT_ELIGIBLE`; H2 HTTP `200`,
  `decision:"declined"`, `reasonCode:"PREFLIGHT_DECLINED"`,
  `chainId:102031`. No provider success, RPC success, transaction, gas,
  broadcast, signer operation, or secret value was recorded.
- Tooling note: the read-only `db diff --linked` command internally created a
  local shadow database and applied local migrations to compute its diff; it
  did not alter staging. No staging migration or `db push` was run.

Disposition remains **H1 BLOCKED / H2 BLOCKED**, with the corrected executor
deployed but business-state seed blocked on authoritative chain metadata.
