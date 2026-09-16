---
name: plan:phase-04-hosted-path-diagnostic-supplement
description: "Phase 04 read-only hosted-path diagnostic supplement for failed smoke echo (G23-DIAG)"
date: 12-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
  mode: plan-supplement
---

# Phase 04 Hosted Path Diagnostic Supplement (G23-DIAG)

**Mode:** PLAN-SUPPLEMENT
**Date:** 2026-09-12
**Status:** READY FOR PVL — NOT READY FOR EXECUTE, G13, H1-H3, MIGRATION, DEPLOYMENT
**Complexity:** SIMPLE (read-only diagnosis + conditional temporary staging-only echo; no behavior, schema, model, or authority change)
**Primary execute anchor:** G23-DIAG tasks in this supplement, after PVL writes the required Validate Contract delta and explicit `ENTER EXECUTE MODE` naming this exact file.
**Supporting phase files (read-only historical inputs, must remain byte-identical):**
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md` (original V1-V7 + all prior supplements/deltas + original failed G13 evidence)
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md` (incl. H1–H3 Hybrid Lane Appendix — Post-Foundation Run 2026-09-12, REDACTED: H1 BLOCKED / H2 BLOCKED / H3 PARTIAL)
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-hybrid-gate-pack_10-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-h1-h3-runtime-wiring-supplement_PLAN_11-09-26.md` (incl. G13 Process Correction: deployment-only GREEN)
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-session-intent-card-persistence-supplement_PLAN_12-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-supabase-prefix-routing-supplement_PLAN_12-09-26.md` (G23 §§1-9 incl. §8 delta + §9 EVL waiver)
- `process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md`

**Scope:** plan/spec only. This artifact does not authorize implementation, tests, migrations, deployment, report edits, evidence collection, secret access, OpenAI/RPC/hosted-endpoint calls, transactions, commits, or pushes. No hosted request was made in this plan-only pass.

## Preservation statement (binding)

Original V1-V7 Validate Contract, original failed G13 evidence plus deployment-only G13 success record, G14-G22, redacted H1-H3 blocker appendix (**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**), G23 §§1-9 + §8 delta (N1-N10, 7-row matrix, RED-first contract, 9-gate set, redeploy boundary) + §9 EVL waiver, closed 15-code surface, and exact 7-key `buildHealth` shape remain historical records and must not be rewritten, reflowed, normalized, or deleted. This supplement is additive only. G23 implementation/waiver evidence in the worktree (`supabase/functions/_shared/path-prefix.ts`, three handler preambles, `prefix-routing.vitest.test.ts`, `deploy-compat.vitest.test.ts` G23 clause) is preserved and not re-specified except by reference.

## Overview

The post-foundation H1–H3 lane proved a bounded routing blocker (report Appendix 2026-09-12, REDACTED): deployed handlers answer with correlated 404 `INPUT_INVALID`, but no valid hosted route reaches its handler. G23 specifies the prefix-compatibility fix and is locally GREEN with an explicit RED-evidence waiver (§9). A subsequent hosted smoke echo still fails closed (see §1). This supplement provides the read-only diagnosis of that failed echo and — only because existing evidence cannot prove the hosted received-pathname string — specifies a conditional temporary staging-only pathname-only echo with strict no-secret, no-reachability, and removal-before-H1-H3 constraints (§7). G13 is recorded here as **DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED** (§10). H1-H3 remain frozen BLOCKED/BLOCKED/PARTIAL until hosted smoke passes (§11).

**Authoritative current entrypoints read for this supplement (no behavior invented):**
- `supabase/functions/session/index.ts` (`createSessionHttpHandler` normalize-first `:257-260`; dispatch `:261-296`; `createSessionEntrypointHandler` `:306-320`; `createSessionCompositionRoot`/`startSessionServer` `:325-352`; `Deno.serve` `:364-372`)
- `supabase/functions/ai-gateway/index.ts` (`handleHealthRequest` `:94-117`; `createGatewayEntrypointHandler` normalize-first `:128-134`, health rewrite `:136-145`, intent dispatch `:146-151`; `createGatewayCompositionRoot`/`startGatewayServer` `:182-236`; `Deno.serve` `:386-392`)
- `supabase/functions/agent-executor/index.ts` (`createExecutorEntrypointHandler` normalize-first `:221-224`, dispatch `:225-228`, read-only vs full path `:241-253`; `createExecutorCompositionRoot`/`startExecutorServer` `:260-287`; `Deno.serve` `:305-311`)
- `supabase/functions/_shared/path-prefix.ts` (`FUNCTION_SLUGS` `:13`, `normalizeFunctionPath` `:17-38`)
- `supabase/functions/_shared/health.ts` (`buildHealth` exact 7-key shape `:5-31`)
- `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` (10 cases, bare+hosted, fake-backed production handlers)
- `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` (6 G12a clauses + 1 G23 prefix clause `:152-186`)
- Report H1–H3 appendix (2026-09-12, REDACTED, lines 408-470): H1 BLOCKED / H2 BLOCKED / H3 PARTIAL; deployed versions `session` v2 / `ai-gateway` v2 / `agent-executor` v3 ACTIVE.

## 1. Failed smoke echo (read-only analysis, no hosted request in this pass)

Source: report Appendix 2026-09-12 (REDACTED), preserved byte-identically. No new hosted call was made here; all values below are quoted history, not fresh evidence.

- **H1 echo:** one POST to the regional `ai-gateway` intent route returned HTTP 404 `INPUT_INVALID` with request echo + correlation headers in ~0.5s. Deployed handler answers; exact-path route check does not match the gateway-prefixed path. No retry (404 non-retryable). Billable OpenAI calls: 0. Payment calls: 0. Redacted log: `{provider:"openai", model:"gpt-5.6-luna", decision:"INPUT_INVALID", storeConfirmed:false, allowFallbackAsserted:false}`.
- **H2 echo:** one POST to the regional `agent-executor` preflight route returned HTTP 404 `INPUT_INVALID` with request echo in ~1.3s (same prefix cause). No retry. Transactions: 0. Broadcasts: 0. Gas: 0. `AGENT_SIGNER_PRIVATE_KEY` never present or requested.
- **Fail-closed proof:** budgets consumed OpenAI billable 0/3, chain reads 0, transactions 0, migrations 0, secret values printed/persisted 0. No sessions, intents, or rows created (all requests failed closed before persistence). Cleanup: nothing to revoke/expire; `SESSION_HMAC_SECRET` untouched; lane bodies deleted from `/tmp`.
- **What the echo proves:** the regional base URL is live, routed, and authenticated (unauthenticated calls get gateway 401; authenticated unknown paths get the function's correlated 404). It does not prove the received pathname string, the normalizer mapping, or region payload — those remain UNKNOWN for the hosted path until post-G23 redeploy + hosted smoke (§6 D1-D5).

## 2. Composition roots (all three `Deno.serve` roots)

Each deployable function exposes the same production handler used by tests via `start*Server` / `create*CompositionRoot` with injected fakes only (no network, no secrets, no live calls in tests). Routing preamble is normalize-first in all three (worktree G23 wiring, preserved by reference):

- **session** (`supabase/functions/session/index.ts`): `createSessionHttpHandler` normalizes `new URL(request.url).pathname` through `normalizeFunctionPath(pathname, "session")` (`:257`); `{ok:false}` → existing 404 `INPUT_INVALID` (`:258-260`); `{ok:true}` → dispatch on `result.path` with unchanged checks (`startsWith("/v1/session/")` + `endsWith` triple `:262-289`). Entrypoint/composition/`Deno.serve` at `:306-372`.
- **ai-gateway** (`supabase/functions/ai-gateway/index.ts`): `createGatewayEntrypointHandler` normalizes with `"ai-gateway"` (`:128`); `{ok:false}` → existing 404 (`:129-134`); `{ok:true}` → `path === "/health"` branch with request rewrite for hosted prefix (`:136-145`) then `POST /v1/agent/intents` dispatch (`:146-151`). Inner `handleHealthRequest` still checks `new URL(request.url).pathname !== "/health"` (`:99`) but receives the rewritten request whose pathname is already `/health` for the hosted case — no health-shape change. Composition/`Deno.serve` at `:182-236`, `:386-392`.
- **agent-executor** (`supabase/functions/agent-executor/index.ts`): `createExecutorEntrypointHandler` normalizes with `"agent-executor"` (`:221`); `{ok:false}` → existing 404 (`:222-224`); `{ok:true}` → `path !== "/v1/payments/preflight" && path !== "/v1/payments/execute"` gate (`:226`), then read-only vs full-execute fork on `path` (`:241-253`). Composition/`Deno.serve` at `:260-311`.

No second normalizer copy exists (sole authority `supabase/functions/_shared/path-prefix.ts`). No new route, code, TTL, DDL, pin, or retry change is in scope.

## 3. URL → pathname → normalizer → dispatch trace (exact code path)

For every request, in order, with method preserved throughout (normalizer never maps methods):

1. **URL → pathname:** `new URL(request.url).pathname` (session `:257`; gateway `:128`; executor `:221`). Hosted note: `URL.pathname` silently normalizes some encodings (raw `..`/backslash segments may not survive to the handler; `%`-forms and `//` do survive per the checked-in prefix-routing test notes). The diagnostic echo (§7) must therefore echo the handler-observed `pathname` verbatim, never a pre-URL raw string.
2. **pathname → normalizer:** `normalizeFunctionPath(pathname, "<own-literal-slug>")` with own literal only (`"session"` / `"ai-gateway"` / `"agent-executor"`). Semantics per G23 §1/§8.2 N1-N10 (preserved by reference): bare passthrough unchanged; hosted strip iff `startsWith("/functions/v1/" + ownSlug + "/")` exactly once; bare prefix with no remainder rejected; wrong-slug rejected; duplicate `/functions/v1/` after one strip rejected; `%`, `\`, `//`, `.`/`..` segments, empty, non-`/`-leading, or untrimmed inputs rejected as `{ok:false, code:"INPUT_INVALID"}`; no arbitrary-segment strip (literal `"/functions/v1/" + ownSlug` comparison only).
3. **normalizer → dispatch:** on `{ok:false}` return the handler's existing 404 `INPUT_INVALID` shape only (session `sessionResponse(...,404)`; gateway `Unsupported gateway route` 404; executor `Unsupported payment route` 404). On `{ok:true}` dispatch on `result.path` with existing exact checks unchanged (session triple; gateway `=== "/health"` / `=== "/v1/agent/intents"`; executor `=== "/v1/payments/preflight"` / `=== "/v1/payments/execute"`).

## 4. Local-vs-hosted assumption comparison

| Assumption (local, GREEN) | Hosted reality (observed, REDACTED history) | Status |
|---|---|---|
| Tests address bare paths (`/health`, `/v1/agent/intents`, `/v1/payments/preflight`) and pass | Supabase gateway preserves `/functions/v1/<slug>` prefix; every production route check missed pre-G23 (H1/H2 correlated 404s) | Proven mismatch; G23 normalizer is the specified fix |
| Synthetic `new Request("https://regional.invalid/...")` URLs prove dispatch logic | Hosted `Deno.serve` received-pathname string post-G23 is unobserved (no post-G23 hosted smoke in evidence) | UNKNOWN — sole justification for conditional §7 echo |
| `URL.pathname` passes `%`/`//` through; `..`/backslash normalize away before handler (test notes) | Hosted gateway decode/normalization behavior unobserved beyond pre-G23 404s | UNKNOWN — echo must not decode-and-route |
| Deployed handlers answer (correlated 404s, versions ACTIVE) | Valid hosted routes unreachable pre-G23; post-G23 hosted reachability unproven | BLOCKED until §9 hosted smoke passes |
| Region pair expected `us-east-1` vs actual | `/health` unreachable behind same prefix mismatch → region payload UNKNOWN (H3 PARTIAL) | UNKNOWN until hosted health read post-redeploy |

No local GREEN is promoted to hosted proof. G23 local GREEN proves routing logic only (fake-backed Vitest + Deno check/bundle).

## 5. Deployed slug/version markers (history, not fresh evidence)

- Staging project: `myotkovmgzdabuirkqlx` (East US) only. No production ref.
- Function versions observed post-redeploy (report appendix, REDACTED): `session` v2, `ai-gateway` v2, `agent-executor` v3, all `ACTIVE`.
- Regional base URL: live, routed, authenticated (lane credential accepted; unauthenticated → gateway 401; authenticated unknown → function correlated 404).
- Expected-vs-actual region pair: UNKNOWN (no `/health` payload returned pre-fix).
- `apps/edge/wrangler.toml`: `SUPABASE_REGIONAL_FUNCTION_URL` blank and `RATE_LIMITER` binding commented out — edge path out-of-scope for the Supabase-only deployment per G17 classification; recorded, unchanged, not H3 evidence.
- Staging does not reflect post-G23 wiring until the separately-gated post-fix G13 redeploy (§9). Deployed markers above predate G23 and must not be reused as G23/hosted-smoke success.

## 6. D1-D5 investigation (without assumption)

Each item states file:line evidence, the hosted UNKNOWN, and the future proof that closes it. Nothing hosted is inferred.

- **D1 — Received-pathname shape.** Evidence: handlers read `new URL(request.url).pathname` (session `:257`; gateway `:128`; executor `:221`). Local tests synthesize `https://regional.invalid/...` URLs. Hosted UNKNOWN: the exact string the Supabase gateway delivers to `Deno.serve` post-G23 (full prefix preserved? decoded? collapsed?). Future proof: §8 diagnostic echo `receivedPathname` field + §7 no-decode rule; never query/headers/auth/cookies/env/secrets.
- **D2 — Prefix preservation vs stripping.** Evidence: pre-G23 handlers dispatched on bare exact matches only (see §3 diff history); H1/H2 404s on gateway-prefixed paths prove preservation pre-G23. Hosted UNKNOWN post-G23: whether the same preservation holds and the normalizer's one-strip mapping fires. Future proof: §8 hosted valid-prefix cases (S1/G2/E1/G1 hosted) GREEN vs bare GREEN; wrong/dup cases stay 404.
- **D3 — Normalizer I/O correctness.** Evidence: `path-prefix.ts:17-38` implements N1-N10 (bare passthrough, own-slug one-strip, wrong/dup/encoded/traversal/empty rejects, literal ownSlug comparison). Local GREEN: `prefix-routing.vitest.test.ts` 10/10 + `deploy-compat` G23 clause (worktree, preserved). Hosted UNKNOWN: whether hosted pathname strings hit the same I/O branches. Future proof: §8 normalizer-vector cases against production handlers + static literal-comparison assertion (no generic strip).
- **D4 — Slug matching (own vs wrong vs bare-prefix).** Evidence: closed slugs `["session","ai-gateway","agent-executor"]` (`path-prefix.ts:13`); per-handler own-literal calls (session `"session"`; gateway `"ai-gateway"`; executor `"agent-executor"`); wrong-slug and bare `/functions/v1/<slug>`-with-no-remainder reject paths (`path-prefix.ts:30,36`). Future proof: §8 wrong-slug, duplicate-prefix, bare-prefix-no-remainder, and `/health`-on-session/executor cases all 404 `INPUT_INVALID` bare and hosted.
- **D5 — Composition-root wiring + dispatch parity.** Evidence: §2 normalize-first preambles + unchanged dispatch checks + health-rewrite branch (gateway `:136-145`); `start*Server`/`create*CompositionRoot` are the tested subjects. Future proof: §8 composition-root cases assert the same `Deno.serve` handlers route the full §8.3 7-row matrix bare and hosted with method preserved and `/health` ai-gateway-only with byte-identical 7-key shape.

## 7. Conditional temporary staging-only diagnostic mechanism (ONLY because existing evidence is insufficient)

**Insufficiency finding (binding):** existing evidence proves local dispatch logic (G23 focused 10/10, G12a 7/7, Deno 2.9.6 3+3 — worktree/waiver records, preserved) but cannot prove the hosted received-pathname string post-G23. H1/H2 404s are pre-G23 history. Synthetic `regional.invalid` URLs are not hosted proof. Therefore — and only therefore — a minimal temporary staging-only echo is specified. If PVL finds hosted received-pathname proof already exists, this section is void and no diagnostic route may be added.

**Diagnostic contract (binding; all must hold):**

- **Staging-only + temporary:** deployed only to staging project `myotkovmgzdabuirkqlx` under the separately-gated post-fix G13 redeploy; never production; never committed as permanent; removed in the same lane before any H1-H3 approval (§9 removal gate).
- **Pathname-only echo:** the handler returns, as its entire body, only: static non-secret build marker `"g23-diag-01"`; verbatim handler-observed `receivedPathname` (`new URL(request.url).pathname` as received); `normalizedPath` + `matchedSlug` + `ok` from `normalizeFunctionPath(receivedPathname, "<own-literal>")`. Never query (`search`/`hash`), headers, auth, cookies, body, env, secrets, addresses, tokens, or raw errors. Example shape only (not evidence):
  ```json
  {"build":"g23-diag-01","receivedPathname":"/functions/v1/ai-gateway/health","normalizedPath":"/health","matchedSlug":"ai-gateway","ok":true}
  ```
- **Non-secret build marker:** static string `"g23-diag-01"` only; no version, hash, env, or secret material.
- **No reachability:** the diagnostic branch returns before any region gate, session/auth, provider/OpenAI, chain/RPC, store/persistence, payment/send, migration, or signer code. No new import beyond the shared normalizer. Static import-graph assertion required (§8).
- **Not in permanent matrix:** the diagnostic path (e.g. `/__diag_path` bare and `/functions/v1/<own-slug>/__diag_path` hosted, `GET` only) is excluded from the G23 §2/§8.3 7-row matrix and from G17; it must 404 on wrong-slug/duplicate/encoded/method-mismatch per the same normalizer rules.
- **Removed before H1-H3 approval:** §9 temp-route removal gate must pass (zero `__diag_path`/`g23-diag-01` hits + G23 regression GREEN) before any fresh H1-H3 approval is valid.
- **`/health` shape unweakened:** `supabase/functions/_shared/health.ts` and `handleHealthRequest` response shape untouched; G17 7-key contract (`requestId`, `configuredRegion`, `expectedRegion`, `chainId`, `provider:"openai"`, `model:"gpt-5.6-luna"`, `modelAvailable:boolean`) unchanged; diagnostic must not alias, wrap, or alter `/health`.

## 8. Exact future test files/commands (binding; none run in this plan-only pass)

**Exact future file (must not exist before EXECUTE — verified ABSENT in this pass):** `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`. Sole diagnostic test file; normalizer unit cases live inside it alongside echo cases — a second diagnostic test file is forbidden. Existing `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` (10 cases) remains the normalizer-I/O and slug-matching regression authority.

Required coverage in the new file (minimum, each asserting status + mapped `INPUT_INVALID` where rejected; fake deps only; same `Deno.serve` production handlers `startSessionServer`/`createSessionCompositionRoot`, `startGatewayServer`/`createGatewayCompositionRoot`, `startExecutorServer`/`createExecutorCompositionRoot`):

1. **Composition root:** each of the three production handlers is the subject (assert `start*Server`/`create*CompositionRoot` identity); diagnostic branch present pre-removal, absent post-removal.
2. **Received-pathname behavior:** bare + hosted echo returns verbatim `receivedPathname` with correct `normalizedPath`/`matchedSlug`/`ok`; `%`/`\`/`//`/`.`/`..`/untrimmed inputs echo the received string but return fail-closed mapping (never decode-and-route, never leak query/headers).
3. **Normalizer I/O:** hosted valid-prefix vectors map to bare equivalents (S1/G2/E1/G1 hosted); bare equivalents stay GREEN; `ok:false` maps to existing 404 shapes.
4. **Slug matching:** wrong-slug, duplicate-prefix, bare-prefix-no-remainder, `/health`-on-session/executor (bare+hosted), unknown bare/hosted all 404 `INPUT_INVALID`.
5. **Diagnostic removal:** static case asserting zero `__diag_path`/`g23-diag-01` tokens in the function graph post-removal (mirrors G12a style); fails while the temp route exists.

**Exact commands (binding):**

```bash
corepack yarn vitest run supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
```

Full relevant regression after GREEN (existing semantics unchanged):

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
```

plus `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn validate:aicd`, `node scripts/check-no-secrets.mjs`, `git diff --check`, applicable Deno 2.9.6 per-function `check`/`bundle` (`--no-lock -c <function>/deno.json`, 3+3), and removal proof:

```bash
rg -n "__diag_path|g23-diag-01" --glob '!yarn.lock' --glob '!.git/**'
```

which must return zero hits post-removal.

Neither RED nor GREEN output is claimed as run by this supplement.

## 9. Binding gates (all must hold; local GREEN proves routing logic only)

- **Diagnostic RED/GREEN:** RED-first genuine (hosted valid-prefix echo/dispatch 404 or echo-absent pre-fix while bare succeeds; false-RED — missing file, compile error, all-pass/all-fail-incl-bare, infra failure — is STOP, do not reinterpret). GREEN: echo shape exact (5 keys only, pathname-only), hosted valid routes reachable bare+hosted, wrong/dup/unknown/encoded/method-mismatch stay 404, health byte-identical bare vs hosted.
- **Production composition-root gate:** subjects are the same `Deno.serve` handlers; fake deps only; no network/secrets/live calls in tests.
- **No-secret response gate:** echo body contains only the 5 allowed keys; `check-no-secrets` 0 findings; `rg` for `OPENAI_API_KEY|AGENT_SIGNER_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|authorization|cookie|Bearer` in the diagnostic path returns zero; no query/header/auth/cookie/env/secret echo.
- **Temp-route removal gate:** `rg -n "__diag_path|g23-diag-01"` zero hits; diagnostic test file's removal case GREEN; `deploy-compat` + `prefix-routing` GREEN after removal; `git diff --check` clean. Removal must pass before any fresh H1-H3 approval.
- **G23 regression gate:** `prefix-routing` 10/10 GREEN, G12a extended 7/7 GREEN, full relevant Vitest GREEN, typecheck/lint/AICD GREEN, Deno 2.9.6 3+3 GREEN, `deno.lock` absent, `AGENT_SIGNER_PRIVATE_KEY` absent by name, no 16th code, no `as string` escape, no generic strip, no method rewrite, no mapper/TTL/DDL/pin/retry drift.
- **G13 redeploy (separately gated, not authorized here):** only after G23-DIAG local GREEN + EVL, under separate explicit approval, exactly `supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx`; verify ref before mutation; no migration/`db push`/`db reset`; no production ref; `functions list` must show all three slugs ACTIVE; derive `SUPABASE_REGIONAL_FUNCTION_URL` from output only; append new immutable record (never rewrite histories); hosted health confirm through the prefix.
- **H1-H3 blocked until hosted smoke passes:** no fresh H1-H3 approval until post-fix G13 + hosted health + hosted smoke echo (valid hosted routes reachable, region payload returned) are recorded; prior 404s never reused as success.

**Hard stops (any one fails G23-DIAG and stops the lane):** any hosted request during plan mode; any implementation/deploy/migrate/OpenAI/RPC/payment/transaction/signer/secret/commit/push under this plan supplement; any rewrite, reflow, normalization, or deletion of V1-V7/G13/G14-G22/H1-H3/§§1-9 histories or 7-route matrix or G17 health shape; any echo of query/headers/auth/cookies/env/secrets/body/addresses/tokens; any OpenAI/RPC/payment/migration/signer reachability from the diagnostic branch; any permanent-matrix inclusion of the diagnostic path; any `/health` weakening; any H1-H3 execution before hosted smoke passes and temp-route removal passes; any G13 without separate explicit approval; any bare-path-only GREEN claimed while hosted RED; any false-RED reinterpreted as proof; any new route answering 200 beyond the temp staging-only echo; any 16th code, `as string` escape, generic strip, double-strip, decode-and-route, or missing normalizer in any handler.

## 10. G13 classification (binding for this supplement)

**G13: DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED.**

- Deployment succeeded: staging project `myotkovmgzdabuirkqlx`; `session` v2 / `ai-gateway` v2 / `agent-executor` v3 ACTIVE (report appendix history). Original bare-ethers failure + deployment-only success records preserved unchanged and not re-argued here.
- Hosted routing verification blocked: H1/H2 smoke echo returned correlated 404 `INPUT_INVALID` on prefixed valid routes; H3 region pair UNKNOWN; post-G23 redeploy + hosted health + hosted smoke remain pending under separate approvals. No deployment success is promoted to routing, region, model, RPC, or H1-H3 evidence.

## 11. H1-H3 disposition (frozen until post-fix redeploy + hosted smoke)

Per the redacted post-foundation appendix (report lines 408-470, preserved byte-identically): **H1 BLOCKED** (fail-closed, zero provider calls), **H2 BLOCKED** (fail-closed, zero chain calls), **H3 PARTIAL** (base live/routed/authenticated, versions ACTIVE, region UNKNOWN). No 404 — before or after this supplement — may be reused or reinterpreted as success. H1-H3 remain separately approval-gated and NOT RUN beyond the recorded blocker. Fresh H1-H3 require post-fix G13 + hosted health + hosted smoke GREEN + §9 temp-route removal GREEN under new explicit approvals.

## Touchpoints

- New (future, conditional): temporary diagnostic branch in the three entrypoint preambles (removed before H1-H3) + `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts` (sole diagnostic test file).
- Read-only: three `index.ts` composition roots, `path-prefix.ts`, `health.ts`, `prefix-routing` + `deploy-compat` tests, Phase 04 plan/report/hybrid pack, H1-H3 runtime-wiring + persistence supplements, blast-radius registry, existing migration (no migration change authorized).
- Historical artifacts above are read-only; this supplement appends one new file only.

## Public Contracts

- G23 §1 normalizer signature/semantics (N1-N10), §2/§8.3 exact 7-row method/path matrix (health ai-gateway-only), closed 15-code surface, exact 7-key health shape, and §7 conditional pathname-only echo shape (`build`/`receivedPathname`/`normalizedPath`/`matchedSlug`/`ok`). No new payment authority, fallback model, arbitrary upstream, secret surface, migration, or chain behavior is introduced.

## Blast Radius

Tiny, staging-temporary routing diagnosis: one echo branch per handler (removed pre-H1-H3) + one test file + removal proof. Domain canonicalization, 15-code mapper, C-SESSION/C-DDL/C-MODEL pins, retry budgets, persistence ports, RLS, card lifecycle, edge forwarding, V1-V7/G13/H1-H3 evidence are out of scope and must remain unchanged. Security risk is echo leakage or diagnostic persistence (wrong data echoed, route left deployed); each is fail-closed by the §7 allowlist (5 keys only) and §9 removal gate.

## Verification Evidence

This plan-only pass may record only artifact/discovery/static results: plan completeness, plan discovery, context discovery, protocol/wiring validation, secret scan, `git diff --check`, and byte-identity preservation of V1-V7/G13/H1-H3 histories. No runtime, database, network, provider, deployment, or live evidence is valid for this supplement. Future EXECUTE/EVL/G13/H1-H3 evidence paths are defined in §§8-9 and are not claimed here.

## Test Infra Improvement Notes

G23-DIAG adds the first hosted received-pathname echo coverage without requiring live-path inference: fake-backed production handlers addressed at bare and `/functions/v1/<slug>`-prefixed URLs plus a staging-only echo for the one UNKNOWN no local test can close (the hosted gateway's delivered pathname string). A local GREEN still proves dispatch logic only; hosted Supabase prefix delivery must still be proven by post-fix G13 + hosted health + hosted smoke. Do not promote Vitest echo GREEN to deployment or H1-H3 evidence.

## Resume and Execution Handoff

- **Selected plan file:** this supplement (`process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md`), alongside the primary Phase 04 plan and G23 supplement.
- **Last completed step:** post-foundation H1-H3 lane recorded BLOCKED/BLOCKED/PARTIAL on the prefix mismatch (report Appendix 2026-09-12); G23 locally GREEN with waiver (worktree, preserved); hosted smoke echo fails closed; staging reflects pre-G23 wiring.
- **Validate-contract status:** G23-DIAG delta pending; status NOT READY / CONDITIONAL INPUTS REQUIRED until PVL binds §§1-11 + D1-D5 + §7 echo allowlist/removal + §8 commands + §9 gates + hard stops and classifies G23-DIAG while retaining V1-V7/G13/G14-G22/H1-H3 boundaries.
- **Fresh-agent next step:** run plan discovery + PVL against this exact supplement path; do not execute implementation, G13, H1-H3, migration, deployment, provider/RPC, transaction, secret, commit, or push work until the G23-DIAG Validate Contract delta is written, reviewed, and explicitly approved with `ENTER EXECUTE MODE` naming this file.

## Plan Completeness and Acceptance

This supplement is complete when PVL can bind the failed-echo analysis, every composition-root line ref, the URL→pathname→normalizer→dispatch trace, the local-vs-hosted table, deployed markers, D1-D5 each to a future assertion, the conditional echo allowlist/removal, every §8 command, the §9 gate set, the G13 BLOCKED-routing classification, and the frozen H1-H3 disposition to concrete assertions without editing implementation artifacts or historical evidence. PVL must classify G23-DIAG and retain V1-V7/G13/G14-G22/H1-H3 boundaries. EXECUTE requires a separate explicit approval naming this exact supplement path.

**Status:** READY FOR PVL
**Summary:** Read-only failed-smoke + composition-root + trace + assumption-comparison + slug/marker analysis with D1-D5 investigated without assumption; conditional staging-only pathname-only echo (5-key allowlist, no reachability, not in matrix, removed pre-H1-H3, health unweakened); exact future test files/commands; diagnostic/removal/G23-regression gates with G13 separately gated and H1-H3 frozen until hosted smoke passes — specified without changing implementation or historical evidence.
**Concerns/Blockers:** Hosted received-pathname UNKNOWN until post-fix G13 + hosted smoke; G13 routing verification BLOCKED; H1 BLOCKED / H2 BLOCKED / H3 PARTIAL frozen.

## 12. Plan-only validation record (this pass — no runtime evidence claimed)

- Plan artifact/completeness: SUPPLEMENT-SHAPE (standard-plan validator reports 7 failures/2 warnings on the G23 supplement shape — expected for plan-supplement artifacts with §§1-9/delta/waiver structure, not a content defect; this file follows the same supplement shape).
- Plan discovery: PASS (24 artifacts in `process/features/pact/active/pact-mvp_08-09-26/`; general active holds `_GUIDE.md` only; this new file is the sole append).
- Context discovery: PASS (`discover-context.mjs --emit-routing` exit 0; routing block unchanged, no diff).
- Protocol/skill wiring: PASS (`validate-context-discovery.mjs` 9 docs/239 refs/33 skills/15+15 agents, 0 failures; `validate-protocol-discovery.mjs` 23 docs, 0 failures).
- Secret scan (`node scripts/check-no-secrets.mjs`): PASS 992/0 at supplement-write time.
- `git diff --check`: PASS clean (whitespace) at supplement-write time; worktree remains dirty with pre-existing uncommitted G23/appendix/migration work (6 modified + 4 untracked incl. this file) — no commit/push performed.
- V1-V7 byte-identity: PASS for this pass (primary Phase 04 plan file unmodified in worktree; `phase-04-ai-gateway-executor_PLAN_08-09-26.md` sha256 `14b10c4b41b5b179e58b98b60c80a9bcf55542f58e048bb1f8d840db6f45a814`; G23 supplement sha256 `926471c169b957b8077795faa5c9749b7b925705cc6d19bd000e5d754fe5b47e`; `path-prefix.ts` `b5c30bb868837bed225f77425c10f396d324b202d1c736e8c17186c530ca7118`; `prefix-routing` `be4000a1e9d9d73ef0dc5c795dcbaf9ee81bd5c15d1c7a9900223a8ab9395138`; diagnostic file verified ABSENT pre-EXECUTE).
- No hosted request, OpenAI/RPC call, migration, deployment, secret access, commit, or push occurred in this pass.

**G23 HOSTED PATH DIAGNOSTIC PLAN COMPLETE — READY FOR PVL**


## 13. PVL blocker remediation delta (append-only)

This trailing delta addresses the prior PVL blockers without rewriting or
reclassifying any earlier line. V1-V7, all prior evidence, and the historical
status `DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED` remain
unchanged. This delta is a plan contract only; it does not claim that current
source already satisfies the future placement or route requirements.

### 13.1 Exact temporary route and placement

The diagnostic route is one temporary route with two exact pathname forms per
function. There is no wildcard route, arbitrary prefix match, slug extraction,
or `startsWith`/regex match that can answer for another path.

| Composition root | Own literal slug | Exact temporary request forms |
|---|---|---|
| `supabase/functions/session/index.ts` | `session` | `GET /__diag_path` or `GET /functions/v1/session/__diag_path` |
| `supabase/functions/ai-gateway/index.ts` | `ai-gateway` | `GET /__diag_path` or `GET /functions/v1/ai-gateway/__diag_path` |
| `supabase/functions/agent-executor/index.ts` | `agent-executor` | `GET /__diag_path` or `GET /functions/v1/agent-executor/__diag_path` |

The future implementation must place the diagnostic check immediately after
`new URL(request.url).pathname` in each Deno.serve composition root. The check
must run before any `request.headers` access and before auth, region, provider,
store, RPC, payment, migration, or signer code. The first request inspection
after pathname may only be the GET method check and the exact finite pathname
comparison needed for this temporary route, followed by the shared normalizer.
The current source is not claimed to meet this placement requirement; future
implementation must prove the ordering in the actual three composition roots,
not in a detached helper or a test-only substitute.

The exact raw pathname comparison and method check must be fail-closed. A
wrong slug, duplicate prefix, missing remainder, encoded or otherwise invalid
candidate, arbitrary prefix, or non-GET method must not select the diagnostic
branch. The diagnostic route is excluded from permanent route dispatch and the
G23 seven-row matrix.

### 13.2 Exact five-key response contract

The diagnostic response body must contain exactly these five JSON keys and no
others:

```json
{"build":"g23-diag-01","receivedPathname":"/functions/v1/ai-gateway/__diag_path","normalizedPath":"/__diag_path","matchedSlug":"ai-gateway","ok":true}
```

| Key | Required semantics |
|---|---|
| `build` | Always the static non-secret string `g23-diag-01`. |
| `receivedPathname` | The handler-observed `pathname` only, verbatim from `new URL(request.url).pathname`. |
| `normalizedPath` | The normalizer result path when normalization is `ok`; otherwise `null`. |
| `matchedSlug` | The function's own literal slug only when an own-slug match is proven; otherwise `null`. |
| `ok` | The boolean normalizer result. |

The response must not include query, hash, headers, authorization, cookies,
request body, environment values, secrets, addresses, tokens, raw errors, or
any other key. In particular, no query or header value may be copied into the
body or used to choose a route. If the actual hosted pathname is not accepted
by the current normalizer, the response may report `normalizedPath: null`,
`matchedSlug: null`, and `ok: false` while preserving the raw observed
`receivedPathname`. The diagnostic must not change `normalizeFunctionPath`,
permanent route dispatch, method handling, or the `/health` contract. It is a
temporary observation branch only. No diagnostic result may reach auth,
provider, store, RPC, payment, migration, or signer code.

### 13.3 Exact diagnostic test path and RED-first contract

The sole future diagnostic test path is
`supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`.
It is currently absent and must remain absent during PLAN-SUPPLEMENT. No
test-only handler, wrapper, or substitute composition root is allowed.

The test must exercise the actual production `Deno.serve` composition roots:
`startSessionServer`/`createSessionCompositionRoot`,
`startGatewayServer`/`createGatewayCompositionRoot`, and
`startExecutorServer`/`createExecutorCompositionRoot`, with fake dependencies
only. It must prove the exact five-key response shape, verbatim pathname
behavior, normalizer mapping, exact own-slug matching, rejection of wrong or
invalid paths and method mismatch, no query/header/auth/cookie/body/env/secret
properties, and placement before protected work. It must also prove that the
diagnostic branch is absent after removal.

The genuine RED command, run only after the exact test file exists and before
the temporary implementation exists, is:

```bash
corepack yarn vitest run supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts
```

The GREEN command, run after the minimal temporary implementation is present,
is the same exact focused command:

```bash
corepack yarn vitest run supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts
```

The RED must be genuine: the focused test file must be found, compile, and
fail for the missing diagnostic behavior while unrelated bare production
routes remain valid. A missing test file, compile error, infrastructure
failure, all-pass result, or all-fail result including the bare cases is a
false RED and is an immediate STOP. Do not reinterpret a false RED as proof,
and do not proceed to implementation or deployment until the RED is corrected
and captured. The test command must target the actual composition roots, never
a helper that bypasses Deno.serve wiring.

### 13.4 Removal proof and H1-H3 prerequisite

Before any fresh H1-H3 approval, remove the temporary diagnostic route from all
three roots: `session/index.ts`, `ai-gateway/index.ts`, and
`agent-executor/index.ts`. Delete
`supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`, or
prove that it is absent. The removal must leave the existing G23 normalizer,
permanent dispatch, method behavior, and health response unchanged.

After the route and diagnostic test are removed, the implementation/test-source
removal proof is exactly:

```bash
! rg -n '__diag_path|g23-diag-01' supabase/functions
```

This command intentionally scans only `supabase/functions` implementation and
test source. It must not scan this plan, other process artifacts, or use a
whole-repository glob. The command must exit successfully because `rg` exits
1 with zero matches. The removal proof, the existing prefix-routing and
deploy-compatibility regressions, and the absence of the diagnostic test are
all required before fresh H1-H3 approval. The earlier broader removal command
in the historical §8 remains unchanged as historical text; this scoped command
is the binding remediation proof.

### 13.5 Standalone temporary-deployment gate

Temporary diagnostic deployment requires a **NEW explicit staging approval**.
That approval is standalone and cannot be inferred from any prior approval,
prior deployment, or prior evidence. The temporary diagnostic deployment is
not G13, is not G13 evidence, and is not H1/H2/H3 evidence. It cannot proceed
without the new explicit staging approval. No deployment is authorized by this
plan in PLAN-SUPPLEMENT mode.

The G13 redeploy remains separately approval-gated and must retain its own
explicit approval. A G13 approval cannot substitute for the temporary
diagnostic deployment approval, and temporary diagnostic output cannot satisfy
G13 or unlock H1, H2, or H3. All hosted calls, deployments, migrations,
provider/RPC calls, secret access, transactions, commits, and pushes remain
outside this plan-only pass.

## Validate Contract

**Contract state:** PENDING PVL. This section is the executable acceptance
contract for PVL and future EXECUTE; it is not a claim that any future RED,
GREEN, hosted, or removal result has already been run. V1-V7 remains historical
and unchanged.

### Acceptance criteria

1. **Route exactness:** each root answers the temporary diagnostic only for
   `GET /__diag_path` and its own exact hosted candidate
   `GET /functions/v1/<own-slug>/__diag_path`; no wildcard, arbitrary prefix,
   wrong slug, duplicate prefix, or method mismatch answers.
2. **Placement:** in each actual Deno.serve composition root, the route check
   follows `new URL(request.url).pathname` immediately and precedes every
   `request.headers` access plus auth, region, provider, store, RPC, payment,
   migration, and signer code. Current source is not treated as already
   compliant; future source/order evidence must prove it.
3. **Five-key safety:** the response has exactly `build`,
   `receivedPathname`, `normalizedPath`, `matchedSlug`, and `ok`, with the
   semantics in §13.2. No query, headers, auth, cookies, body, environment,
   secrets, addresses, tokens, or raw errors are exposed.
4. **Behavior preservation:** the shared G23 normalizer remains unchanged;
   permanent route dispatch and method handling remain unchanged; `/health`
   remains the exact existing seven-key contract; an unaccepted hosted
   pathname may produce null mapping fields while preserving raw pathname.
5. **RED-first proof:** the exact diagnostic test path is used; the RED command
   runs after the file exists and before implementation; any false RED is a
   STOP; tests use the three actual production composition roots and no
   test-only helper substitute.
6. **GREEN proof:** the exact focused GREEN command passes with response-key
   exactness, no-secret properties, route exactness, normalizer vectors,
   composition-root placement, and existing bare-route behavior covered.
7. **Removal proof:** all three temporary branches are removed, the diagnostic
   test is deleted or absent, and `! rg -n '__diag_path|g23-diag-01'
   supabase/functions` succeeds before fresh H1-H3 approval.
8. **Approval boundaries:** a NEW explicit staging approval is required for
   temporary diagnostic deployment; that deployment is not G13 or H1/H2/H3
   evidence; G13 redeploy retains separate explicit approval.
9. **Historical preservation:** prior V1-V7, G13, G14-G22, H1-H3, G23 §§1-9,
   prior evidence, and the exact status `DEPLOYMENT SUCCEEDED / HOSTED ROUTING
   VERIFICATION BLOCKED` remain unchanged. The plan ends with the required
   `G23 HOSTED PATH DIAGNOSTIC PLAN COMPLETE — READY FOR PVL` marker.

### Allowed read-only PVL checks

PVL may run only read-only artifact, discovery, static-scan, whitespace, and
byte-preservation checks for this supplement:

```bash
node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md
node .claude/skills/vc-context-discovery/scripts/discover-context.mjs --feature pact --json
node .claude/skills/vc-context-discovery/scripts/discover-context.mjs --check-routing
node .claude/skills/vc-plan-discovery/scripts/discover-plans.mjs --feature pact --json
node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs
node .claude/skills/vc-audit-context/scripts/validate-protocol-discovery.mjs
node scripts/check-no-secrets.mjs
git diff --check
```

The byte-preservation check must compare the post-append prefix through the
original final line against the pre-append 32,645-byte snapshot. It must prove
that the prior 231 lines are byte-identical, including the historical status
and prior completion marker. No implementation/test command, hosted request,
deployment, migration, provider/RPC call, secret access, commit, or push is an
allowed PVL check in this PLAN-SUPPLEMENT pass.

**Historical status preserved exactly:** `DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED`

**G23 HOSTED PATH DIAGNOSTIC PLAN COMPLETE — READY FOR PVL**

## 14. Final PVL remediation delta (append-only)

This is the superseding final PVL disposition for the preceding plan text. It
adds direct current-source evidence for D2, D4, and D5, records the hosted
evidence boundary, and does not rewrite any earlier byte. This is validation of
the plan contract, not execution of the plan.

### 14.1 Direct current evidence and hosted boundary

Line references below are to the current worktree files read for this PVL.
They are direct source/test references, not indirect references to prior plan
sections. The local tests use the production composition-root handlers with
fake dependencies; their `regional.invalid` URLs are not hosted evidence.

#### D2 — Prefix preservation versus stripping

- **Current source evidence:** `supabase/functions/session/index.ts:257-263`
  reads `new URL(request.url).pathname`, calls
  `normalizeFunctionPath(..., "session")`, and dispatches on the normalized
  path. `supabase/functions/ai-gateway/index.ts:127-151` does the same for
  `"ai-gateway"`, including the `/health` rewrite and intent dispatch.
  `supabase/functions/agent-executor/index.ts:220-227` does the same for
  `"agent-executor"` before its existing payment route checks.
- **Current normalizer evidence:**
  `supabase/functions/_shared/path-prefix.ts:29-37` constructs the literal
  own-slug prefix, strips exactly that prefix once, rejects another prefix
  after the first strip at `:31-34`, rejects other `/functions/v1/` prefixes at
  `:36`, and otherwise passes through the bare path at `:37`.
- **Current test evidence:**
  `supabase/functions/_shared/test/prefix-routing.vitest.test.ts:144-184`
  covers hosted session, gateway, and executor valid routes through
  `start*Server`; `:186-205` covers hosted and bare health parity; `:352-382`
  covers method preservation for bare and hosted paths.
- **Hosted evidence:** UNKNOWN. No current source or local test proves the
  exact pathname delivered by the Supabase hosted gateway after a G23 deploy.
  The prior hosted 404s are pre-G23 history and are not post-G23 proof.
- **Future proof:** after the required local RED/GREEN sequence and separately
  approved staging work, the temporary pathname-only echo plus hosted valid
  prefix cases must record the verbatim handler-observed pathname and prove
  hosted mapping against the bare equivalents. The echo is diagnostic only and
  must be removed before fresh H1-H3 approval.

#### D4 — Own-slug, wrong-slug, and bare-prefix matching

- **Current source evidence:**
  `supabase/functions/_shared/path-prefix.ts:13` closes the allowed slugs to
  `session`, `ai-gateway`, and `agent-executor`; `:29-37` compares the literal
  own-slug prefix, rejects an exact bare prefix at `:30`, rejects a wrong
  `/functions/v1/` slug at `:36`, and returns only the own-slug remainder at
  `:31-34`. The handlers pass their own literals at
  `supabase/functions/session/index.ts:257`,
  `supabase/functions/ai-gateway/index.ts:127-128`, and
  `supabase/functions/agent-executor/index.ts:220-221`.
- **Current test evidence:**
  `supabase/functions/_shared/test/prefix-routing.vitest.test.ts:207-234`
  directly tests wrong slugs; `:236-250` directly tests a duplicated prefix;
  `:252-298` tests hosted unknown paths and `/health` rejection on session and
  executor; `:300-350` tests encoded, repeated-slash, and traversal-shaped
  inputs; `:352-382` tests method mismatch. The existing test file does not
  directly exercise the exact bare-prefix-with-no-remainder vector, so that
  vector remains a required future assertion rather than a claimed result.
  `supabase/functions/_shared/test/deploy-compat.vitest.test.ts:152-185`
  statically verifies the shared normalizer, own literals, and absence of
  generic prefix stripping.
- **Hosted evidence:** UNKNOWN. These are local handler/static assertions;
  they do not establish how a hosted request is delivered or matched.
- **Future proof:** the future diagnostic test must exercise each actual
  production composition root with hosted valid, wrong-slug, duplicate-prefix,
  bare-prefix-no-remainder, encoded, and method-mismatch vectors. Rejections
  must remain 404 `INPUT_INVALID`, and the diagnostic route itself must not
  broaden the permanent route set.

#### D5 — Composition-root wiring and dispatch parity

- **Current source evidence:**
  `supabase/functions/session/index.ts:325-351` creates the session
  composition root and passes it through `startSessionServer`; its guarded
  `Deno.serve` wiring is at `:364-371`. The request normalization and
  unchanged dispatch gate are at `:257-263`.
  `supabase/functions/ai-gateway/index.ts:119-151` contains the gateway
  production handler, normalization, health rewrite, and intent dispatch;
  `:386-391` passes `startGatewayServer` to `Deno.serve`.
  `supabase/functions/agent-executor/index.ts:217-254` contains the executor
  production handler, normalization, method/path gate, and preflight/execute
  dispatch; `:260-287` creates and starts its composition root, and
  `:305-310` passes it to `Deno.serve`.
- **Current test evidence:**
  `supabase/functions/_shared/test/composition-roots.vitest.test.ts:56-123`
  wires and exercises session, gateway, and executor `start*Server` paths with
  fail-closed configuration; `:125-131` verifies all three expose
  `Deno.serve` plus their `start*Server` entrypoint. The routing matrix is
  exercised through those same served handlers at
  `supabase/functions/_shared/test/prefix-routing.vitest.test.ts:55-115` and
  `:135-205`. Static composition and shared-normalizer checks are at
  `supabase/functions/_shared/test/deploy-compat.vitest.test.ts:112-129` and
  `:152-185`.
- **Hosted evidence:** UNKNOWN. The current composition roots and local served
  handlers prove only checked-in wiring and local dispatch parity; they do not
  prove a post-G23 hosted route, region payload, or hosted reachability.
- **Future proof:** the future diagnostic test must call the actual
  `startSessionServer`, `startGatewayServer`, and `startExecutorServer`
  subjects, compare bare and hosted route outcomes, assert method preservation
  and the byte-identical seven-key gateway health contract, then prove removal
  from all three roots before H1-H3 approval.

### 14.2 Checksum provenance and preservation anchor

- **Preserved pre-remediation prefix:** first `32645` bytes of this plan,
  captured immediately before this final append.
- **Exact command:**

  ```bash
  dd if="process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md" bs=1 count=32645 status=none | sha256sum
  ```

- **Exact sha256:**
  `3d09645a325a66ccf910c0d6fc6bbe3a0fe41462ce7747789f6cdde223a0b551`
- This hash is the byte-preservation anchor for subsequent append-only prefix
  checks. It is not a new historical runtime claim and does not fabricate a
  pre-append file snapshot. No separate pre-append snapshot was created or is
  available. The prior preservation evidence recorded in §12, together with
  this exact prefix checksum and the post-append prefix check, is sufficient
  for this plan-only PVL preservation disposition; no stronger byte-history or
  hosted-runtime proof is claimed.

### 14.3 Read-only validation record

- **Plan artifact/completeness:** SUPPLEMENT-SHAPE. The standard validator
  reported 5 failures and 2 warnings for this supplement shape (missing
  generic plan metadata/sections and context mentions); no implementation
  change was made to silence or reinterpret those findings.
- **Context discovery:** PASS. `discover-context.mjs --feature pact --json`
  completed; `--check-routing` reported the routing block in sync.
- **Plan discovery:** PASS. Pact active-plan discovery completed and selected
  this exact supplement path; no plan was created or moved.
- **Context/protocol wiring:** PASS. Context validation reported 9 docs, 239
  concrete references, 33 skills, and 15 Claude plus 15 Codex agents with 0
  failures; protocol validation reported 23 docs with 0 failures.
- **Secret scan:** PASS. `node scripts/check-no-secrets.mjs` scanned 993
  items and reported 0 findings.
- **Whitespace:** PASS. `git diff --check` reported no output.
- **Current prefix check:** PASS. The exact command above returned the recorded
  sha256; the file remained at least 32645 bytes. This is an append-only
  prefix check, not a claim of an unavailable snapshot comparison.

### 14.4 Superseding PVL disposition

- **Contract status:** PASS / READY FOR EXECUTE.
- **Scope:** plan/spec validation only for G23-DIAG; direct D2/D4/D5 current
  evidence, explicit UNKNOWN hosted boundaries, future proof obligations,
  pathname-only diagnostic constraints, removal gate, historical preservation,
  and approval boundaries. No source, test, migration, report, or evidence
  artifact is changed by this delta.
- **Validated inputs:** current session, gateway, executor, shared normalizer,
  existing prefix-routing, deploy-compatibility, and composition-root files at
  the line ranges recorded in §14.1; the existing plan and its §12
  preservation record; context, plan, and protocol discovery; secret scan;
  whitespace check; and the exact 32645-byte prefix checksum.
- **Acceptance result:** PASS. The prior direct-evidence PVL blockers are
  resolved by current file:line citations rather than indirect plan references;
  D2, D4, and D5 each explicitly retain UNKNOWN hosted evidence and define
  future proof; checksum provenance is bounded honestly; and the plan contract
  is READY FOR EXECUTE.
- **Known non-results:** no implementation or test command was run; no hosted
  request, deployment, migration, OpenAI call, RPC call, transaction, signer
  access, secret access, commit, or push occurred. Local test references are
  not hosted evidence. The temporary diagnostic deployment remains
  unauthorized by this PVL.
- **Next authorized state:** a separately and explicitly approved
  `ENTER EXECUTE MODE` naming this exact plan may begin the specified local
  implementation/test lane. Any temporary diagnostic deployment requires a
  NEW explicit staging approval and remains neither G13 nor G13 evidence nor
  H1/H2/H3 evidence. G13 redeploy and H1-H3 retain their separate approvals;
  no diagnostic output unlocks them.

G23 HOSTED PATH DIAGNOSTIC PLAN COMPLETE — READY FOR PVL

## 15. Hosted-evidence correction delta (append-only — third-form finding, 2026-09-12)

This delta is append-only. All prior bytes (§§1-14, both prior completion
markers, histories, matrices, contracts, checksums) are preserved unchanged.
No implementation, test, migration, deployment, hosted-call, OpenAI/RPC,
secret, commit, or push action is authorized or performed by this delta.
Safety invariants are unchanged: exactly 5 keys, early return before
sensitive paths, no query/headers/auth/cookies/env/secrets, staging-only,
temporary, removed pre-H1-H3, `/health` unchanged.

### 15.1 Observed hosted evidence (timestamps 2026-09-12 ~22:17-22:25 UTC)

- Staging project `myotkovmgzdabuirkqlx`; diagnostic bundles `session` v4 /
  `ai-gateway` v4 / `agent-executor` v5 ACTIVE at probe time.
- Bare `GET /__diag_path` → edge-level 404
  `{"error":"requested path is invalid"}`. This proves the edge requires the
  `/functions/v1/<slug>/...` form; it is not function evidence and not a
  normalizer result.
- Hosted `GET /functions/v1/ai-gateway/__diag_path` → function 404
  `INPUT_INVALID` "Unsupported gateway route." The diagnostic branch did NOT
  fire; the normalizer rejected the received pathname.
- Hosted `GET /functions/v1/agent-executor/__diag_path` → function 404
  `INPUT_INVALID` "Unsupported payment route." Same: the diagnostic branch
  did NOT fire.
- Hosted `GET /functions/v1/session/__diag_path` → 503
  `PROVIDER_UNAVAILABLE` (composition-root region gate at
  `session/index.ts:326-334` rejects before the diagnostic branch). This
  corroborates H3 UNKNOWN region; it is NOT pathname evidence.
- Re-probe 5+ min post-deploy identical → propagation ruled out; deployed
  bundle sizes changed (executor 14→15KB) → new bundle live.

### 15.2 Conclusion (binding)

- The hosted received pathname is a THIRD form: neither bare `/__diag_path`
  nor `/functions/v1/<own-slug>/__diag_path` as observed by the handler. No
  guessing of the third form is permitted in plan, implementation, or test
  fixtures beyond the explicitly bound suffix vectors in §15.4.

### 15.3 Correction contract (minimal; safety invariants unchanged)

- Add fallback trigger per root: `GET && pathname.endsWith("/__diag_path")`.
  This subsumes the exact forms in §13.1; the exact hosted form still drives
  `matchedSlug` = own slug, else `matchedSlug = null`; `normalizedPath`/`ok`
  come from the unchanged normalizer.
- The fallback fires ONLY for the temporary diagnostic response; permanent
  dispatch, normalizer, methods, and health are unchanged. Wrong-slug and
  duplicate forms reaching it receive the 5-key echo only — staging-only,
  temporary, with no secret content regardless of trigger — so there is no
  safety weakening. (Rationale recorded explicitly as required: the echo body
  remains exactly `build`/`receivedPathname`/`normalizedPath`/`matchedSlug`/
  `ok`, returns before any region/auth/provider/store/RPC/payment/migration/
  signer code, never copies query/headers/auth/cookies/body/env/secrets, and
  is removed before any H1-H3 approval; a broader trigger therefore cannot
  leak more than the exact trigger could.)

### 15.4 Test binding (same file, same discipline)

- Exact test additions in the SAME future test file
  `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`:
  suffix vectors including a simulated third form (e.g.
  `/ai-gateway/__diag_path`) and a trailing-slash form,
  `matchedSlug`-null semantics for non-exact hosted forms, and no broadening
  of the permanent matrix. Same RED-first false-RED STOP, same commands, same
  removal proof (`! rg -n '__diag_path|g23-diag-01' supabase/functions`), same
  gates as §§13-14. G13/H1-H3 remain separately gated; diagnostic output is
  not G13/H evidence.

### 15.5 Gate freeze (unchanged)

- G13 remains `DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED`;
  H1 BLOCKED / H2 BLOCKED / H3 PARTIAL frozen. Diagnostic output is not
  G13/H evidence. The pre-append `G23 HOSTED PATH DIAGNOSTIC PLAN COMPLETE —
  READY FOR PVL` marker above is preserved byte-identically in place; this
  delta closes with the correction marker below as an append-only
  consequence, not a rewrite.

### 15.6 Preservation anchor (pre-append snapshot for byte-preservation checks)

- Pre-append prefix: first `54808` bytes of this plan.
- Pre-append sha256: `06809d2f90e8dba21ed9b8430dad0589130be364e5ca5d937437e9e3b50334ab`.
- Exact command: `dd if="process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md" bs=1 count=54808 status=none | sha256sum` must return the recorded sha256.

CORRECTION DELTA COMPLETE — READY FOR PVL

## 16. True-fix delta (append-only — proven hosted form, 2026-09-12 ~22:35 UTC)

This delta is append-only. All prior bytes (§§1-15, all prior completion
markers, histories, matrices, contracts, checksums) are preserved unchanged.
No implementation, test, migration, deployment, hosted-call, OpenAI/RPC,
secret, commit, or push action is authorized or performed by this delta.
Safety invariants are unchanged: exactly 5 keys, early return before
sensitive paths, no query/headers/auth/cookies/env/secrets, staging-only,
temporary, removed pre-H1-H3, `/health` unchanged.

### 16.1 Proven hosted evidence (2026-09-12 ~22:35 UTC)

- Staging project `myotkovmgzdabuirkqlx`; diagnostic bundles `session` v5 /
  `ai-gateway` v5 / `agent-executor` v6 ACTIVE at probe time.
- Hosted `GET /functions/v1/ai-gateway/__diag_path` → 200:
  ```json
  {"build":"g23-diag-01","receivedPathname":"/ai-gateway/__diag_path","normalizedPath":"/ai-gateway/__diag_path","matchedSlug":null,"ok":true}
  ```
- Hosted `GET /functions/v1/agent-executor/__diag_path` → 200, same shape
  with `receivedPathname`/`normalizedPath` `/agent-executor/__diag_path`,
  `matchedSlug: null`, `ok: true`.
- Hosted `GET /functions/v1/session/__diag_path` → 503 region-gate
  (unchanged composition-root region gate; NOT pathname evidence). It
  corroborates H3 UNKNOWN region. Session hosted routing remains
  unverifiable until the region gate passes — recorded as a blocking note
  for the H-lane. No secret/env probing is authorized or performed to
  investigate the gate.
- Diagnostic output is not G13/H evidence. It is routing-form evidence only.

### 16.2 Root cause closed empirically (no guessing)

- PROVEN: the platform strips `/functions/v1` but PRESERVES `/<slug>`, so
  the handler-observed form is `/<ownSlug>/<rest>` (e.g.
  `/ai-gateway/__diag_path`, `/agent-executor/__diag_path`).
- The G23 normalizer only handles the full `/functions/v1/<slug>/...` form
  plus bare passthrough, so the hosted slug-preserved form fell through to
  bare passthrough (`ok: true` with the unmapped path preserved) and the
  permanent dispatch returned the existing 404. The §15 third-form UNKNOWN
  is therefore closed empirically: the third form is `/<ownSlug>/<rest>`.
- No other hosted form is inferred. No fixture may invent additional hosted
  forms beyond bare, full-prefix, and this proven slug-preserved form.

### 16.3 True-fix contract (minimal; diagnostic fallback untouched)

Scope is a minimal change to the N-rules in
`supabase/functions/_shared/path-prefix.ts` plus tests. The §13 exact-route
plus §15 `endsWith("/__diag_path")` diagnostic fallback is untouched until
the removal lane (§16.5). No response-shape change: the normalizer returns
`ok`/`path` only.

- Accept `/<ownSlug>/<rest>`: strip the function's own single-segment slug
  once; require a non-empty remainder that does not start with `/` and does
  not match the existing traversal/encoded rules (same `%`, `\`, `//`,
  `.`/`..`, empty, non-`/`-leading, untrimmed rejects as G23 N-rules).
- Reject a wrong single-segment slug: `/other/x` (any first segment that is
  not the caller's own literal slug) → `{ok: false}`.
- Reject duplicates after one strip: if the remainder after stripping the
  own slug once starts with `/<ownSlug>/` or `/functions/v1/`, reject
  (covers `/<slug>/<slug>/...` and `/<slug>/functions/v1/...` shapes).
- Reject bare `/<slug>` with no remainder (e.g. `/ai-gateway` with nothing
  after the slug).
- Keep bare passthrough, keep the full `/functions/v1/<ownSlug>/...`
  one-strip, and keep all existing rejects unchanged.
- Explicitly forbid generic single-segment stripping (e.g. stripping any
  first segment): own-literal comparison only, same no-arbitrary-strip
  principle as G23.
- `matchedSlug` semantics for the future (no normalizer response change):
  the own slug counts as proven on either accepted prefixed form
  (full-prefix or slug-preserved); wrong-slug, duplicate, and bare-slug
  forms prove no slug (`null`).

### 16.4 Test binding (minimal; same discipline)

- Exact test additions (minimal choice): extend the existing
  `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` with
  slug-preserved vectors (accept own `/<ownSlug>/<rest>` → bare-equivalent
  mapping for each slug; reject wrong single-segment slug, duplicate
  `/<slug>/<slug>/...`, bare `/<slug>` no-remainder, plus encoded/traversal
  remainder rejects), and extend
  `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` with a
  static rule asserting own-literal single-segment comparison and the
  absence of arbitrary single-segment stripping. No new test file; the sole
  diagnostic file `hosted-path-diagnostic.vitest.test.ts` is untouched by
  this fix.
- RED-first with false-RED STOP: the focused prefix-routing run must be
  found, compile, and fail on the new slug-preserved vectors while bare and
  full-prefix equivalents stay GREEN; a missing file, compile error, infra
  failure, all-pass, or all-fail-including-bare is a false RED and is an
  immediate STOP.
- Same commands/gates as §§13-14 (focused prefix-routing + deploy-compat,
  then full relevant regression, typecheck/lint/AICD, check-no-secrets,
  `git diff --check`, applicable Deno 2.9.6 per-function check/bundle).
- The exact 7-row matrix is now routed via THREE accepted input forms
  (bare, full-prefix, slug-preserved) with identical dispatch, `/health`
  (ai-gateway-only, byte-identical 7-key shape), and method preservation.

### 16.5 Removal lane binding (separate step after EVL)

- Separate step after EVL: delete the diagnostic branches from all three
  roots (`session/index.ts`, `ai-gateway/index.ts`,
  `agent-executor/index.ts`) and delete
  `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`
  (or prove it absent), leaving the true-fix normalizer, permanent
  dispatch, method behavior, and health response unchanged.
- Scoped removal proof (binding):
  ```bash
  ! rg -n '__diag_path|g23-diag-01' supabase/functions
  ```
  which must succeed (`rg` exit 1 on zero matches), plus full regression
  per §16.4.
- Then STOP at the post-fix G13 approval: redeploy of the true fix is G13,
  separately gated, NOT authorized here. No G13, H1-H3, migration,
  OpenAI/RPC, secret, commit, or push action is authorized by this delta.

### 16.6 Gate freeze (unchanged)

- G13 remains `DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED`;
  H1 BLOCKED / H2 BLOCKED / H3 PARTIAL frozen; V1-V7 unchanged.
  Diagnostic output (including the §16.1 200s) is not G13/H evidence. The
  pre-append `CORRECTION DELTA COMPLETE — READY FOR PVL` marker above is
  preserved byte-identically in place; this delta closes with the true-fix
  marker below as an append-only consequence, not a rewrite.

### 16.7 Preservation anchor (pre-append snapshot for byte-preservation checks)

- Pre-append prefix: first `59511` bytes of this plan.
- Pre-append sha256: `148be2a5d804d93c52efc11b95b5f7ec114d652922c3799d0253e4a565dde7bd`.
- Exact command: `dd if="process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md" bs=1 count=59511 status=none | sha256sum` must return the recorded sha256.

TRUE-FIX DELTA COMPLETE — READY FOR PVL

## 17. Closeout — diagnostic + true-fix + removal lane (append-only, 2026-09-12)

This section is append-only closeout. All prior bytes (§§1-16, all prior
completion markers, histories, matrices, contracts, checksums) are preserved
unchanged. No implementation, test, migration, deployment, hosted-call,
OpenAI/RPC, secret, commit, or push action is authorized or performed by this
closeout. Safety invariants are unchanged: exactly 5 keys, early return
before sensitive paths, no query/headers/auth/cookies/env/secrets,
staging-only, temporary, removed pre-H1-H3, `/health` unchanged.

### 17.1 Temporary diagnostic staging deployments (recorded history)

- Staging project `myotkovmgzdabuirkqlx` only. No production ref.
- First diagnostic fleet: `session` v4 / `ai-gateway` v4 / `agent-executor`
  v5, all ACTIVE at probe time (§15.1 history).
- Corrected fleet (suffix fallback, §15.3): `session` v5 / `ai-gateway` v5 /
  `agent-executor` v6, all ACTIVE at probe time (§16.1 history).
- Observed hosted 5-key echoes (routing-form evidence only) proved the
  handler-observed form is `/<slug>/<rest>` (platform strips `/functions/v1`
  but preserves `/<slug>`), e.g. `/ai-gateway/__diag_path` and
  `/agent-executor/__diag_path` with `matchedSlug: null`, `ok: true` under
  the pre-fix normalizer passthrough (§16.1 history).
- Session hosted `GET /functions/v1/session/__diag_path` → 503
  `PROVIDER_UNAVAILABLE` from the composition-root region gate at
  `session/index.ts:326-334`, before the diagnostic branch. This is NOT
  pathname evidence; it corroborates H3 UNKNOWN region. Session hosted
  routing remains unverifiable until the region gate passes. No secret/env
  probing was authorized or performed.

### 17.2 Exact-match miss → suffix fallback → true fix (recorded lane history)

- §13 exact-match diagnostic (two exact forms per root) missed hosted: the
  hosted received pathname was the third form `/<slug>/<rest>`, so the
  diagnostic branch did not fire and the normalizer fell through (§15
  history).
- §15 suffix fallback (`GET && pathname.endsWith("/__diag_path")`,
  diagnostic-only, permanent dispatch/normalizer/methods/health unchanged):
  RED 3/2/1 → GREEN 5/1, then 7/1 after vector extension (recorded lane
  history, not re-run in this closeout pass).
- §16 true fix (minimal N-rule change in
  `supabase/functions/_shared/path-prefix.ts` only — accept own
  single-segment `/<ownSlug>/<rest>` once, reject wrong single-segment slug,
  reject duplicates after one strip, reject bare `/<slug>` no-remainder,
  forbid generic single-segment stripping, all existing rejects unchanged;
  diagnostic fallback untouched until the removal lane): RED 2/18 → GREEN
  12+8, with one stale-expectation single-line repair in the new
  slug-preserved vectors (recorded lane history, not re-run in this
  closeout pass).

### 17.3 Local EVL GREENs (recorded lane history, not re-run here)

- Full-repo Vitest pre-removal: 36 files / 222 passed (recorded lane
  history).
- Removal-lane gates: 35 files / 215 passed, `check-no-secrets` 994/0,
  Deno 2.9.6 per-function `check`/`bundle` 3+3 (recorded lane history).
- This closeout pass ran NO Vitest, Deno, typecheck, lint, or AICD command.
  The numbers above are recorded history from the prior lane, not fresh
  evidence from this pass.

### 17.4 Removal proof (verified in this closeout pass)

- Scoped implementation/test-source removal proof (binding):
  ```bash
  ! rg -n '__diag_path|g23-diag-01' supabase/functions
  ```
  Result in this pass: PASS — `rg` exit 1 (zero matches), stdout empty.
- Diagnostic test file
  `supabase/functions/_shared/test/hosted-path-diagnostic.vitest.test.ts`:
  verified ABSENT (deleted) in this pass (`ls` exit 2, no such file).
- Diagnostic branches removed from all three roots; true-fix normalizer,
  permanent dispatch, method behavior, and health response left unchanged
  (recorded lane history; source-scan proof above is the closeout check).

### 17.5 Non-blocking observations (2, recorded; no gate impact)

1. Absent numbered case-10 label in the extended vectors, though method
   coverage is present indirectly. Cosmetic/label gap only; no routing,
   contract, or gate impact.
2. Bundle `-o` output-form deviation on Deno 2.9.6 (flag form vs expected
   form). Tool-invocation surface only; all 3+3 check/bundle gates recorded
   GREEN in the lane. No behavior, contract, or gate impact.

### 17.6 Freeze (binding, unchanged)

- G13 remains `DEPLOYMENT SUCCEEDED / HOSTED ROUTING VERIFICATION BLOCKED`.
- H1 BLOCKED / H2 BLOCKED / H3 PARTIAL frozen. V1-V7 intact.
- Diagnostic output — including the §16.1 hosted 200 echoes, the §15/§16
  RED/GREEN sequences, and the §17.3 recorded EVL GREENs — is NOT G13/H
  evidence. It is routing-form + local-logic evidence only.

### 17.7 Next state: STOP (binding)

- STOP. The post-fix G13 redeploy (true-fix bundles) requires a NEW
  explicit approval; it is NOT authorized here.
- H1-H3 require further approval after G13 plus hosted smoke (valid hosted
  routes reachable, region payload returned, temp-route removal GREEN
  already recorded in §17.4).
- The pre-append `TRUE-FIX DELTA COMPLETE — READY FOR PVL` marker above is
  preserved byte-identically in place; this closeout is an append-only
  consequence, not a rewrite.

### 17.8 Preservation anchor + closeout validation (this pass only)

- Pre-append prefix: first `66794` bytes of this plan.
- Pre-append sha256:
  `557537daa9f7a9a9c6372a49b4d3b3445a89fef0e8cb8091d597c2c7bba82091`.
- Exact command: `dd if="process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md" bs=1 count=66794 status=none | sha256sum` must return the recorded sha256.
- Closeout-pass checks only (no implementation/test edits, deploy, hosted
  calls, migration, OpenAI/RPC, secrets, commit/push):
  - Byte preservation: PASS (pre-append `wc -c` 66794, sha256 as above).
  - Secret scan (`node scripts/check-no-secrets.mjs`): PASS 994/0.
  - `git diff --check` on this plan path: PASS clean (exit 0).
  - Removal proof `! rg -n '__diag_path|g23-diag-01' supabase/functions`:
    PASS (exit 1, zero hits). Diagnostic test verified deleted.

CLOSEOUT RECORDED — STOPPING AT G13 APPROVAL

## 18. Post-fix G13 staging redeploy and hosted routing smoke (append-only, 2026-09-13)

This section is an append-only record of the approved post-fix G13 lane. All
prior bytes (§§1-17, prior G13 failure/success histories, completion markers,
checksums, and H1-H3 dispositions) remain unchanged. No implementation or
test files are changed by this record.

### 18.1 Approval and deployment boundary

- Approval: post-fix G13 staging redeploy, target project
  `myotkovmgzdabuirkqlx` only.
- Exact deployment slugs: `session`, `ai-gateway`, `agent-executor`.
- The project ref was confirmed immediately before deployment.
- Signer was absent.
- Explicitly out of scope and not performed: migration, database push or
  reset, provider call, RPC call, transaction, signer access, secret access,
  H1-H3 execution, commit, and push.
- Deployment target was staging only; no production ref was used.

### 18.2 Deployment result

- Deployment succeeded at `2026-09-13 05:10:16 UTC` from platform output.
- ACTIVE versions after deployment: `session` v6, `ai-gateway` v6,
  `agent-executor` v7.

### 18.3 Smoke URL source and evidence boundary

- Smoke URL source for each route:
  `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/<slug>/...`.
  This is the platform URL convention combined with the prior diagnostic
  proof that `/functions/v1` is stripped and `/<slug>` is preserved by the
  hosted handler path. No regional URL was invented, and no direct pathname
  echo is claimed now that the diagnostic route has been removed.
- Exactly one non-secret smoke was made per route, using request id
  `g13-final-smoke`.
- Smoke response bodies contained no secrets.

### 18.4 Hosted routing smoke results

- **AI gateway:** `GET /functions/v1/ai-gateway/health` returned HTTP `200`.
  Exact response keys, sorted, were
  `[chainId,configuredRegion,expectedRegion,model,modelAvailable,provider,requestId]`.
  Values relevant to this lane: `provider` = `openai`,
  `configuredRegion` = `unknown`, and `expectedRegion` = `us-east-1`.
  This proves health/routing only. It is not H3 region evidence, and no
  provider call was made.
- **Session:** `GET /functions/v1/session/v1/session/challenge` returned
  HTTP `503` with code `PROVIDER_UNAVAILABLE`. Exact shape keys, sorted, were
  `[code,message,requestId]`; message was `Session persistence runtime is unavailable.`
  The known region gate persists. No H3 claim is made.
- **Agent executor:** `GET /functions/v1/agent-executor/v1/payments/preflight`
  returned HTTP `404` with code `INPUT_INVALID`. Exact shape keys, sorted,
  were `[code,message,requestId]`; message was `Unsupported payment route.`
  The GET method intentionally avoided payment execution. This proves the
  runtime route response only; no RPC or transaction occurred.

### 18.5 G13 and H disposition

- **G13 POST-FIX STAGING REDEPLOY — GREEN** for deployment plus hosted routing
  smoke, with the session region-gate caveat recorded above.
- Original G13 failures and success histories remain preserved and are not
  rewritten. H1 `BLOCKED`, H2 `BLOCKED`, and H3 `PARTIAL` remain unchanged.
- No H evidence is claimed. In particular, the gateway health response does
  not establish H3 region evidence, and the session 503 does not establish an
  H3 result.
- The next hard stop is a fresh explicit H1-H3 approval.

### 18.6 Preservation anchor

- Pre-append prefix length: `73070` bytes.
- Prefix checksum command:
  `dd if="process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md" bs=1 count=73070 status=none | sha256sum`
- Pre-append prefix SHA-256:
  `0fc4da58ff101d28241598d8712117bb43931af9e2e881e1624b5a2433a7f808`.

### 18.7 Check boundary

Only the following post-append checks are authorized for this record:

- Secret scan: `node scripts/check-no-secrets.mjs`.
- Diff check: `git diff --check`.
- Byte preservation: rerun the §18.6 prefix checksum command and require the
  recorded SHA-256.

G13 POST-FIX STAGING REDEPLOY — GREEN; STOPPING FOR FRESH H1-H3 APPROVAL

### 18.8 Post-append validation record

- Secret scan: `node scripts/check-no-secrets.mjs` PASS; 994 items scanned,
  0 findings.
- Diff check: `git diff --check --
  process/features/pact/active/pact-mvp_08-09-26/phase-04-hosted-path-diagnostic-supplement_PLAN_12-09-26.md`
  PASS; no output.
- Byte preservation: the §18.6 prefix checksum command returned
  `0fc4da58ff101d28241598d8712117bb43931af9e2e881e1624b5a2433a7f808`,
  matching the recorded pre-append SHA-256.
- No implementation/test changes, deployment, migration, hosted call,
  provider/RPC call, secret access, transaction, signer access, commit, or
  push was performed as part of these checks.

G13 POST-FIX STAGING REDEPLOY — GREEN; STOPPING FOR FRESH H1-H3 APPROVAL
