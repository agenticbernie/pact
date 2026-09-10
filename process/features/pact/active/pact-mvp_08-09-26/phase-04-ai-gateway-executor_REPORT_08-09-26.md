---
phase: phase-04-ai-gateway-executor
date: 2026-09-10
status: CODE_COMPLETE_LOCAL_GREEN
feature: pact
plan: process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md
---

# Phase 04 — AI Gateway & Agent Executor: Execution Report (Tasks 1–6, local EXIT)

**Branch:** `main` · **Contract:** CONDITIONAL accepted (C-SESSION, C-DDL, C-MODEL, C-TOOL) · **Mode:** supervised EXECUTE.
Tasks 1–6 RED → GREEN complete; binding local gates G1–G6 plus G8 GREEN (reported evidence, see below).
G7 Deno/Supabase is CI-only and non-binding locally (CLIs absent).
H1–H3 live hybrid lanes NOT executed — separate explicit approval required.
No push performed for the implementation commits in this closeout.

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
