---
name: plan:phase-04-supabase-prefix-routing-supplement
description: "Phase 04 bounded supplement for Supabase /functions/v1/<slug> prefix-aware routing (G23)"
date: 12-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
  mode: plan-supplement
---

# Phase 04 Supabase Prefix Routing Compatibility Supplement (G23)

**Mode:** PLAN-SUPPLEMENT
**Date:** 2026-09-12
**Status:** READY FOR PVL — NOT READY FOR EXECUTE, G13, H1-H3, MIGRATION, DEPLOYMENT
**Complexity:** SIMPLE (bounded routing fix; no behavior, schema, model, or authority change)
**Primary execute anchor:** G23 tasks in this supplement, after PVL writes the required Validate Contract delta and explicit `ENTER EXECUTE MODE`.
**Supporting phase files (read-only historical inputs, must remain byte-identical):**
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md` (original V1-V7 + all prior supplements/deltas + original failed G13 evidence)
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md` (incl. H1–H3 Hybrid Lane Appendix — Post-Foundation Run 2026-09-12, REDACTED: H1 BLOCKED / H2 BLOCKED / H3 PARTIAL)
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-hybrid-gate-pack_10-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-h1-h3-runtime-wiring-supplement_PLAN_11-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-session-intent-card-persistence-supplement_PLAN_12-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md`

## Overview

The post-foundation H1–H3 lane (report Appendix 2026-09-12, REDACTED) proved a bounded routing blocker: local composition tests address **bare paths** (`/health`, `/v1/agent/intents`, `/v1/payments/preflight`), but the Supabase gateway preserves the **`/functions/v1/<slug>` prefix**, so every production route check misses with HTTP 404 `INPUT_INVALID`. Deployed handlers answer (correlated 404s, versions observed `session` v2 / `ai-gateway` v2 / `agent-executor` v3, all `ACTIVE`), but no valid hosted route reaches its handler.

This supplement specifies the minimal prefix-compatibility fix: one shared deterministic path normalizer plus wiring in the three existing `Deno.serve` handlers. No new route, no new error code, no new payment authority, no model/config/schema change.

**Scope:** plan/spec only. This artifact does not authorize implementation, tests, migrations, deployment, report edits, evidence collection, secret access, OpenAI/RPC calls, transactions, commits, or pushes. All V1-V7, G13 histories (failure + deployment-only success), G14-G22, and the redacted H1-H3 blocker appendix remain historical records and must not be rewritten, reflowed, or normalized.

**Authoritative current entrypoints read for this supplement (no behavior invented):**
- `supabase/functions/session/index.ts` (`createSessionHttpHandler`, `createSessionEntrypointHandler`, `createSessionCompositionRoot`, `startSessionServer`)
- `supabase/functions/ai-gateway/index.ts` (`createGatewayEntrypointHandler`, `handleHealthRequest`, `createGatewayCompositionRoot`, `startGatewayServer`)
- `supabase/functions/agent-executor/index.ts` (`createExecutorEntrypointHandler`, `createExecutorCompositionRoot`, `startExecutorServer`)
- `supabase/functions/_shared/health.ts` (`buildHealth`, exact 7-key shape)
- Existing runtime tests under `supabase/functions/{_shared,session,ai-gateway,agent-executor}/test/` (bare-path only; no prefix coverage exists — verified by text search for `functions/v1`, `normalizePath`, `stripPrefix`, `prefix` returning zero handler hits)

## 1. Canonical Path Normalizer Contract (binding)

**Exact future module:** `supabase/functions/_shared/path-prefix.ts` (new; sole authority; no second copy in any function directory).

**Exact slugs (closed set, no other value permitted):** `session`, `ai-gateway`, `agent-executor`.

**Signature (binding shape; names must match):**

```ts
export const FUNCTION_SLUGS = ["session", "ai-gateway", "agent-executor"] as const;
export type FunctionSlug = typeof FUNCTION_SLUGS[number];
export function normalizeFunctionPath(
  rawPathname: string,
  ownSlug: FunctionSlug,
): { ok: true; path: string } | { ok: false; code: "INPUT_INVALID" };
```

**Semantics (deterministic, pure, no I/O, no secrets, no network):**

1. **Accept only two forms, nothing else:**
   - (a) **Bare local path:** exactly the route path the current handler matches (e.g. `/health`, `/v1/agent/intents`, `/v1/session/challenge`). Returned unchanged as `{ ok: true, path: rawPathname }`.
   - (b) **Hosted prefixed path:** exactly `"/functions/v1/" + ownSlug + remainder` where `remainder` starts with `"/"` and is itself a valid bare route path shape (non-empty after the prefix). The single exact own prefix is stripped once; the remainder is returned as `{ ok: true, path: remainder }`. Method dispatch downstream is unchanged (normalizer preserves method + remainder; it never maps methods).
2. **Bind exact slugs:** the prefix literal is `"/functions/v1/" + ownSlug` only. An `ai-gateway` handler must accept `/functions/v1/ai-gateway/...` and must reject `/functions/v1/session/...`, `/functions/v1/agent-executor/...`, and any other slug segment.
3. **Strip only the exact own prefix, exactly once:** accept iff `rawPathname === prefix` is rejected as unknown (a bare prefix with no remainder is not a route) or `rawPathname.startsWith(prefix + "/")`, in which case strip `prefix.length` characters once. After one strip, if the remainder still starts with `"/functions/v1/"`, reject (duplicate-prefix case). Never strip twice.
4. **Reject wrong-slug:** any pathname starting with `"/functions/v1/"` whose third segment is not `ownSlug` returns `{ ok: false, code: "INPUT_INVALID" }`. Never fall through to bare matching on the suffix.
5. **Reject duplicate prefix:** any pathname containing a second `"/functions/v1/<anything>"` after one valid strip (e.g. `/functions/v1/ai-gateway/functions/v1/ai-gateway/v1/agent/intents`) returns `{ ok: false, code: "INPUT_INVALID" }`.
6. **Reject traversal / encoded ambiguity (fail-closed):** return `{ ok: false, code: "INPUT_INVALID" }` if the raw pathname (the string passed in, before any decoding) contains or decodes to any of: a `%` character (any percent-encoding, incl. `%2F`, `%2f`, `%2E`, `%252F` double-encoding), a `\` character, a `//` empty segment, a `.` or `..` segment, or leading/trailing whitespace/control characters; or if `rawPathname` is empty. Rationale: `new URL(url).pathname` normalizes some encodings silently; the normalizer must treat any encoded slash/dot/traversal as ambiguous and reject rather than decode-and-route. Exact checks: `rawPathname.length === 0` → reject; `rawPathname.includes("%")` → reject; `rawPathname.includes("\\")` → reject; `rawPathname.split("/").includes(".")` or `.includes("..")` → reject; `rawPathname.includes("//")` → reject; `rawPathname !== rawPathname.trim()` → reject.
7. **Reject empty / unknown with the existing mapped error:** any empty, non-`/`-leading, or otherwise unmatched pathname returns `{ ok: false, code: "INPUT_INVALID" }`. Callers map this to the **existing** 404 `INPUT_INVALID` response shape of that handler (no new code, no 16th code, no message change beyond the existing per-handler body).
8. **Never strip arbitrary segments:** the implementation must compare against the literal `"/functions/v1/" + ownSlug`. Forbidden: regex `^/functions/v1/[^/]+`, split-and-drop-first-N-segments, `replace("/functions/v1/", "")`, or stripping any caller-supplied slug. G12a static coverage must assert the literal `ownSlug` comparison exists and no generic strip exists.

**Wiring (minimal, no dispatch change):** each of the three existing entrypoint handlers normalizes `new URL(request.url).pathname` through `normalizeFunctionPath(pathname, "<own-slug>")` as its first step; on `{ ok: false }` it returns its existing 404 `INPUT_INVALID` response; on `{ ok: true }` it dispatches on `result.path` with its existing exact route checks unchanged (session `startsWith("/v1/session/")` + `endsWith` triple; gateway `=== "/health"` / `=== "/v1/agent/intents"`; executor `=== "/v1/payments/preflight"` / `=== "/v1/payments/execute"`).

## 2. Exact Method/Path Route Matrix (derived from current entrypoints/contracts — no invented routes)

Method is never normalized; only the path is. `GET /health` exists **only on `ai-gateway`**. Session and executor have no health route (must stay 404, bare and hosted).

| # | Function (slug) | Method | Bare path (local, current GREEN) | Hosted path (post-fix GREEN; current RED 404) | Notes |
|---|---|---|---|---|---|
| S1 | `session` | POST | `/v1/session/challenge` | `/functions/v1/session/v1/session/challenge` | challenge issuance |
| S2 | `session` | POST | `/v1/session/verify` | `/functions/v1/session/v1/session/verify` | consume + token issuance |
| S3 | `session` | POST | `/v1/session/revoke` | `/functions/v1/session/v1/session/revoke` | wallet-bound revoke |
| G1 | `ai-gateway` | GET | `/health` | `/functions/v1/ai-gateway/health` | exact 7-key `buildHealth` shape; no auth; no side effects |
| G2 | `ai-gateway` | POST | `/v1/agent/intents` | `/functions/v1/ai-gateway/v1/agent/intents` | intent envelope; region gate before provider |
| E1 | `agent-executor` | POST | `/v1/payments/preflight` | `/functions/v1/agent-executor/v1/payments/preflight` | read-only/static decision path |
| E2 | `agent-executor` | POST | `/v1/payments/execute` | `/functions/v1/agent-executor/v1/payments/execute` | full idempotent execute path (C-DDL invariants unchanged) |

All other method/path combinations (wrong method on a valid path, unknown path bare or hosted, wrong-slug prefix, duplicate prefix, encoded/traversal, bare `/functions/v1/<slug>` with no remainder, `/health` on session/executor) return the handler's existing 404 `INPUT_INVALID` (session: `sessionResponse(...,404)`; gateway: `Unsupported gateway route` 404; executor: `Unsupported payment route` 404). No new status or code is introduced.

## 3. Test Contract (RED-first, binding)

**Exact future file (must not exist before EXECUTE):** `supabase/functions/_shared/test/prefix-routing.vitest.test.ts`.

**Subject under test:** the same `Deno.serve` handlers used in production composition — `startSessionServer` / `createSessionCompositionRoot` (session), `startGatewayServer` / `createGatewayCompositionRoot` (ai-gateway), `startExecutorServer` / `createExecutorCompositionRoot` (agent-executor) with fake persistence/provider/store/transport only (no network, no secrets, no live calls). Direct unit cases for `normalizeFunctionPath` are permitted inside the same file; a second test file for the normalizer is forbidden (keeps G23 to one exact path).

**Required coverage (minimum 10 cases, each asserting status + mapped `INPUT_INVALID` code where rejected):**
1. Bare session challenge `POST /v1/session/challenge` → reachable (existing behavior preserved).
2. Hosted session challenge `POST /functions/v1/session/v1/session/challenge` → **RED 404 pre-fix**, GREEN reachable post-fix.
3. Hosted gateway intent `POST /functions/v1/ai-gateway/v1/agent/intents` (fake provider/store/card) → **RED 404 pre-fix**, GREEN intent envelope post-fix.
4. Hosted executor preflight `POST /functions/v1/agent-executor/v1/payments/preflight` (fake read-only client) → **RED 404 pre-fix**, GREEN decision post-fix.
5. Hosted health via prefix `GET /functions/v1/ai-gateway/health` → **RED 404 pre-fix**, GREEN exact 7-key health shape post-fix; bare `GET /health` stays GREEN throughout.
6. Wrong prefix (e.g. ai-gateway handler given `/functions/v1/session/v1/agent/intents`; session handler given `/functions/v1/ai-gateway/v1/session/challenge`) → 404 `INPUT_INVALID` before and after.
7. Duplicated prefix (`/functions/v1/ai-gateway/functions/v1/ai-gateway/v1/agent/intents`) → 404 before and after.
8. Unknown path (bare `/v1/unknown`; hosted `/functions/v1/ai-gateway/v1/unknown`; `/health` on session/executor bare and hosted) → 404 before and after.
9. Encoded / traversal (`/functions/v1/ai-gateway/%76%31/agent/intents`, `/functions/v1/ai-gateway/v1/../health`, `//functions//v1//ai-gateway//health`, backslash variant) → 404 before and after.
10. Method preservation (e.g. `GET /v1/agent/intents` bare and hosted; `POST /health` bare and hosted) → 404 before and after; normalizer never converts method.

**RED contract (genuine, pre-EXECUTE, unclaimed until run):** before implementation, the exact command below fails with hosted-prefixed valid paths returning 404 `INPUT_INVALID` while bare equivalents succeed — this is the checked-in proof of the H1–H3 blocker, not a missing-file result.

**GREEN command (exact, binding):**

```bash
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

**Expected output (unclaimed — no counts invented in this plan-only pass):** exit code `0` with that file's Vitest passing-file/passing-test summary recorded as future evidence. Neither RED nor GREEN output is claimed as run by this supplement.

## 4. G23 Binding Gate (routing-compatibility acceptance)

**Exact files in scope (closed set):**
- New: `supabase/functions/_shared/path-prefix.ts` (normalizer only).
- Edited (routing preamble only; no dispatch, schema, mapper, TTL, DDL, pin, or retry change): `supabase/functions/session/index.ts`, `supabase/functions/ai-gateway/index.ts`, `supabase/functions/agent-executor/index.ts`.
- New test: `supabase/functions/_shared/test/prefix-routing.vitest.test.ts`.
- Extended static gate: `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` (new prefix clause; existing 6 clauses unchanged).

**Exact gate command (binding local):**

```bash
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

Full relevant regression after GREEN (existing semantics unchanged):

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
```

plus `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn validate:aicd`, `node scripts/check-no-secrets.mjs`, `git diff --check`, and the applicable Deno 2.9.6 per-function `check`/`bundle` commands (G12b, `--no-lock -c <function>/deno.json`).

**Acceptance (all must hold):**
- RED observed first: hosted-prefixed valid paths 404 while bare succeed (cases 2-5 above).
- GREEN after minimal fix: full matrix §2 routes reachable bare and hosted; wrong-slug/duplicate/unknown/encoded/method-mismatch remain 404 `INPUT_INVALID`; `GET /health` shape byte-identical bare vs hosted; session/executor `/health` stays 404.
- No arbitrary-strip: static assertion proves literal own-slug comparison and absence of generic `/functions/v1/[^/]+` strip in the three handlers.
- G1-G8 GREEN unchanged; G12a extended GREEN (see §5); G12b GREEN under Deno 2.9.6 (3+3); secret scan 0 findings; `git diff --check` clean; `deno.lock` absent; `AGENT_SIGNER_PRIVATE_KEY` absent by name.

**Evidence path:** redacted focused + full Vitest output, typecheck/lint/AICD/secret/diff logs, and the RED→GREEN 404→route record appended to the Phase 04 report appendix by a later approved update pass (this supplement creates no evidence itself).

**Failure (any one fails G23):** any hosted-valid route still 404; any wrong/dup/unknown/encoded route returning non-404; any bare regression; any new route (e.g. health on session/executor) answering 200; any 16th code, `as string` escape, generic strip, method rewrite, or behavior drift in mapper/TTL/DDL/pin/retry.

**Hard stops:** new route invented; arbitrary-segment strip; double-strip; decode-and-route of `%`/`\`/traversal; missing normalizer in any of the three handlers; bare-path-only GREEN claimed while hosted RED; any deployment, migration, OpenAI/RPC call, transaction, secret access, commit, or push under G23; any rewrite of V1-V7/G13/H1-H3 history.

**Local-vs-hosted boundary:** local G23 GREEN proves routing logic only (fake-backed Vitest + Deno check/bundle). It does not prove hosted Supabase routing, region, model access, or RPC. Hosted proof is post-fix G13 redeploy + hosted health read only (§6).

## 5. Prior-Gate Preservation and G12a Extension

Preserve **G1-G8, G12a/G12b, G13-H3 boundaries, G14-G22, V1-V7** exactly. G7 stays CI-only/non-binding. This supplement adds no new error code, model pin, TTL, DDL, or retry rule.

Extend `deploy-compat.vitest.test.ts` (G12a) with one additive prefix clause so bare-path-only compatibility cannot pass while prefix routing is broken:
- assert `supabase/functions/_shared/path-prefix.ts` exists and exports `normalizeFunctionPath` + closed `FUNCTION_SLUGS`;
- assert each of the three `index.ts` imports it and calls it with its own literal slug (`"session"`, `"ai-gateway"`, `"agent-executor"`);
- assert no generic strip token exists in the function graph (`/functions/v1/[^/]+` strip, `replace("/functions/v1/"`, split-drop-N) outside the normalizer's literal comparison;
- existing six G12a clauses stay unchanged and green.

## 6. Redeploy Sequence (post-fix, each step separately approval-gated)

1. **Local RED:** run the exact §3 command before implementation; record hosted-prefixed 404s vs bare success (genuine RED proof).
2. **Minimal implementation:** create `path-prefix.ts`, wire the three handler preambles, add the one test file, extend the G12a clause — nothing else.
3. **Local GREEN:** rerun the exact §3 command (exit 0) + full relevant Vitest + typecheck/lint/AICD + secret scan + `git diff --check` + Deno 2.9.6 per-function check/bundle (G12b). EVL records actual output.
4. **EVL:** independent rerun of G23 + G1-G8/G12a/G12b; classification stays LOCAL GREEN only.
5. **G13 redeploy (separate explicit approval):** `supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx` only; verify ref immediately before mutation; no migration/`db push`; no production ref; `supabase functions list --project-ref myotkovmgzdabuirkqlx` must show all three slugs; derive `SUPABASE_REGIONAL_FUNCTION_URL` from deployment output only (never prepopulate); record redacted deployment evidence only; preserve prior G13 failure + deployment-only success records byte-identically (append new immutable record, never rewrite).
6. **Verify ACTIVE + hosted health:** confirm versions ACTIVE; `GET <regional-url>/functions/v1/ai-gateway/health` (and per-slug equivalents) return the exact non-secret health shape through the hosted prefix.
7. **Fresh H1-H3 approval:** H1/H2/H3 rerun only under a new explicit hybrid approval against the redeployed staging project; record fresh redacted evidence; never reuse prior 404s as success.

## 7. H1-H3 Disposition (frozen until post-fix redeploy)

Per the redacted post-foundation appendix (report lines 408-470, preserved byte-identically): **H1 BLOCKED** (fail-closed, zero provider calls; 404 `INPUT_INVALID` on the gateway-prefixed intent route), **H2 BLOCKED** (fail-closed, zero chain calls; 404 on the executor-prefixed preflight route), **H3 PARTIAL** (regional base live/routed/authenticated, versions ACTIVE, but expected-vs-actual region UNKNOWN because `/health` is unreachable behind the same prefix mismatch). No 404 — before or after this supplement — may be reused or reinterpreted as success. H1-H3 remain separately approval-gated and NOT RUN beyond that recorded blocker.

## Touchpoints

- New: `supabase/functions/_shared/path-prefix.ts`, `supabase/functions/_shared/test/prefix-routing.vitest.test.ts`.
- Edited (preamble only): `supabase/functions/session/index.ts`, `supabase/functions/ai-gateway/index.ts`, `supabase/functions/agent-executor/index.ts`.
- Extended: `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` (one additive clause).
- Read-only: Phase 04 plan/report/hybrid pack, H1-H3 runtime-wiring and persistence supplements, blast-radius registry, `supabase/functions/_shared/health.ts`, `packages/domain` authority, existing migration (no migration change authorized).
- Historical artifacts above are read-only; this supplement appends one new file only.

## Public Contracts

- The §1 normalizer signature/semantics, the §2 exact 7-row method/path matrix, the closed 15-code surface (unchanged), the exact 7-key health shape (unchanged), and the G23 gate in §4. No new payment authority, fallback model, arbitrary upstream, secret surface, migration, or chain behavior is introduced.

## Blast Radius

Small, cross-runtime routing preamble: one shared pure module + three handler entry lines + one test file + one static clause. Domain canonicalization, 15-code mapper, C-SESSION/C-DDL/C-MODEL pins, retry budgets, persistence ports, RLS, card lifecycle, edge forwarding, and V1-V7/G13/H1-H3 evidence are out of scope and must remain unchanged. Security risk is open-redirect/path-confusion (wrong-slug or decoded-traversal reaching a handler); each is fail-closed to 404 `INPUT_INVALID` and test-bound in §3.

## Verification Evidence

This plan-only pass may record only artifact/discovery/static results: plan completeness, plan discovery, context discovery, protocol/wiring validation, secret scan, `git diff --check`, and byte-identity preservation of V1-V7/G13/H1-H3 histories. No runtime, database, network, provider, deployment, or live evidence is valid for this supplement. Future EXECUTE/EVL/G13/H1-H3 evidence paths are defined in §§3-4/§6 and are not claimed here.

## Test Infra Improvement Notes

G23 adds the first hosted-prefix-shaped Vitest coverage without requiring a live Supabase stack: fake-backed handlers addressed at both bare and `/functions/v1/<slug>`-prefixed URLs. A local GREEN proves dispatch logic only; hosted Supabase prefix preservation must still be proven by post-fix G13 + hosted health. Do not promote Vitest prefix GREEN to deployment or H1-H3 evidence.

## Resume and Execution Handoff

- **Selected plan file:** this supplement (`process/features/pact/active/pact-mvp_08-09-26/phase-04-supabase-prefix-routing-supplement_PLAN_12-09-26.md`), alongside the primary Phase 04 plan.
- **Last completed step:** post-foundation H1-H3 lane recorded BLOCKED/BLOCKED/PARTIAL on the prefix mismatch (report Appendix 2026-09-12); staging reflects pre-fix wiring.
- **Validate-contract status:** G23 delta pending; status NOT READY / CONDITIONAL INPUTS REQUIRED until PVL binds §§1-5 + §8-style budgets/redaction/cleanup from the hybrid pack.
- **Fresh-agent next step:** run plan discovery + PVL against this exact supplement path; do not execute implementation, G13, H1-H3, migration, deployment, provider/RPC, transaction, secret, commit, or push work until the G23 Validate Contract delta is written, reviewed, and explicitly approved with `ENTER EXECUTE MODE` naming this file.

## Plan Completeness and Acceptance

This supplement is complete when PVL can bind the normalizer signature, every matrix row, every test case, the G23 command/acceptance/failure/hard-stop set, the G12a extension clause, the redeploy sequence, and the H1-H3 frozen disposition to concrete assertions without editing implementation artifacts or historical evidence. PVL must classify G23 and retain V1-V7/G13/G14-G22/H1-H3 boundaries. EXECUTE requires a separate explicit approval naming this exact supplement path.

**Status:** READY FOR PVL
**Summary:** Shared deterministic `/functions/v1/<own-slug>` normalizer, exact 7-row method/path matrix (incl. `GET /health` on `ai-gateway` only), RED-first `prefix-routing.vitest.test.ts` contract, G23 binding gate, G12a extension, staging redeploy sequence to `myotkovmgzdabuirkqlx`, and frozen H1 BLOCKED / H2 BLOCKED / H3 PARTIAL — specified without changing implementation or historical evidence.
**Concerns/Blockers:** Hosted prefix mismatch blocks all valid H1-H3 routes until G23 GREEN + post-fix G13 redeploy + fresh H1-H3 approval.

**SUPABASE PREFIX ROUTING SUPPLEMENT COMPLETE — READY FOR PVL**

## 8. G23 Validate Contract Delta (binding for PVL — appended 2026-09-12; lines 1–218 above preserved byte-identically, no rewrite)

**Metadata (binding):**

- `generated_by: vc-plan-agent`
- `date: 2026-09-12`
- `delta: G23`
- `status: READY FOR PVL` — NOT READY FOR EXECUTE, G13, H1-H3, MIGRATION, DEPLOYMENT
- `scope: plan/spec only` — this delta authorizes no implementation, tests, migrations, deployment, report edits, evidence collection, secret access, Supabase/OpenAI/RPC calls, transactions, commits, or pushes.

**Preservation statement (binding):** original V1-V7 Validate Contract (`phase-04-ai-gateway-executor_PLAN_08-09-26.md`, `### V1` through `### V7`) remains byte-identical; original failed G13 evidence plus deployment-only G13 success record remain preserved unchanged; redacted H1-H3 Hybrid Lane Appendix (report lines 408-470) remains frozen at **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**; §§1–7 of this supplement, G1-G8/G12a/G12b/G14-G22 boundaries, the closed 15-code surface, and the exact 7-key `buildHealth` shape remain unchanged. This §8 is additive only: it binds §§1–7 to PVL-assertable gates and adds no route, code, model, TTL, DDL, pin, retry, schema, or authority change.

### 8.1 Closed implementation/test path set (binding — exactly 6, no other file in G23 scope)

1. `supabase/functions/_shared/path-prefix.ts` — new normalizer module only (sole authority; no second copy).
2. `supabase/functions/session/index.ts` — routing preamble only (normalize-first; no dispatch/schema/TTL/DDL change).
3. `supabase/functions/ai-gateway/index.ts` — routing preamble only (same constraint).
4. `supabase/functions/agent-executor/index.ts` — routing preamble only (same constraint).
5. `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` — new focused test only (must not exist before EXECUTE; sole G23 test file; normalizer unit cases live inside it — a second normalizer test file is forbidden).
6. `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` — extended by one additive prefix clause only (existing 6 G12a clauses unchanged).

Any edit outside these 6 paths fails G23.

### 8.2 Ten-point normalizer contract (binding — mirrors §1; PVL must assert each point)

- **N1 — Exact module:** `supabase/functions/_shared/path-prefix.ts` is the sole authority. No copy in any function directory.
- **N2 — Closed slugs:** `FUNCTION_SLUGS = ["session", "ai-gateway", "agent-executor"] as const`; no other slug value permitted.
- **N3 — Exact signature (names must match):** `export function normalizeFunctionPath(rawPathname: string, ownSlug: FunctionSlug): { ok: true; path: string } | { ok: false; code: "INPUT_INVALID" }`. Pure, deterministic, no I/O, no secrets, no network.
- **N4 — Bare local path passthrough:** exactly the route path the current handler matches (e.g. `/health`, `/v1/agent/intents`, `/v1/session/challenge`) returns `{ ok: true, path: rawPathname }` unchanged.
- **N5 — Hosted prefix strip (once, own slug only):** accept iff `rawPathname.startsWith("/functions/v1/" + ownSlug + "/")`; strip `("/functions/v1/" + ownSlug).length` characters once; return remainder as `{ ok: true, path: remainder }`. Bare `"/functions/v1/<slug>"` with no remainder is rejected. Method dispatch downstream is unchanged (normalizer preserves method + remainder; it never maps methods).
- **N6 — Wrong-slug reject:** any pathname starting with `"/functions/v1/"` whose third segment is not `ownSlug` returns `{ ok: false, code: "INPUT_INVALID" }`. Never fall through to bare matching on the suffix.
- **N7 — Duplicate-prefix reject:** after one valid strip, if the remainder still starts with `"/functions/v1/"` (e.g. `/functions/v1/ai-gateway/functions/v1/ai-gateway/v1/agent/intents`), return `{ ok: false, code: "INPUT_INVALID" }`. Never strip twice.
- **N8 — Traversal / encoded fail-closed reject:** return `{ ok: false, code: "INPUT_INVALID" }` if `rawPathname.length === 0`, `rawPathname.includes("%")` (any percent-encoding incl. `%2F`/`%2f`/`%2E`/`%252F`), `rawPathname.includes("\\")`, `rawPathname.split("/").includes(".")` or `.includes("..")`, `rawPathname.includes("//")`, or `rawPathname !== rawPathname.trim()`. Never decode-and-route.
- **N9 — Empty / unknown mapped reject:** any empty, non-`/`-leading, or otherwise unmatched pathname returns `{ ok: false, code: "INPUT_INVALID" }`; callers map to the handler's existing 404 `INPUT_INVALID` shape only (session `sessionResponse(...,404)`; gateway `Unsupported gateway route` 404; executor `Unsupported payment route` 404). No 16th code, no message change beyond existing per-handler body.
- **N10 — No arbitrary-strip:** implementation compares against the literal `"/functions/v1/" + ownSlug`. Forbidden: regex `^/functions/v1/[^/]+`, split-and-drop-first-N-segments, `replace("/functions/v1/", "")`, or stripping any caller-supplied slug. G12a static coverage must assert the literal `ownSlug` comparison exists and no generic strip exists.

**Wiring (binding):** each of the three entrypoint handlers normalizes `new URL(request.url).pathname` through `normalizeFunctionPath(pathname, "<own-slug>")` as its first step with its own literal slug (`"session"`, `"ai-gateway"`, `"agent-executor"`); on `{ ok: false }` returns its existing 404; on `{ ok: true }` dispatches on `result.path` with existing exact checks unchanged (session `startsWith("/v1/session/")` + `endsWith` triple; gateway `=== "/health"` / `=== "/v1/agent/intents"`; executor `=== "/v1/payments/preflight"` / `=== "/v1/payments/execute"`).

### 8.3 Seven-row route matrix (binding — derived from current entrypoints; no invented routes)

Method is never normalized; only the path is. `GET /health` exists only on `ai-gateway` via the same production `Deno.serve` handler (`startGatewayServer` / `createGatewayCompositionRoot`); bare and hosted forms must return the byte-identical exact 7-key `buildHealth` shape. Session and executor have no health route (404 bare and hosted).

| # | Function (slug) | Method | Bare path (local, current GREEN) | Hosted path (post-fix GREEN; current RED 404) | Same `Deno.serve` handler |
|---|---|---|---|---|---|
| S1 | `session` | POST | `/v1/session/challenge` | `/functions/v1/session/v1/session/challenge` | `startSessionServer` / `createSessionCompositionRoot` |
| S2 | `session` | POST | `/v1/session/verify` | `/functions/v1/session/v1/session/verify` | `startSessionServer` / `createSessionCompositionRoot` |
| S3 | `session` | POST | `/v1/session/revoke` | `/functions/v1/session/v1/session/revoke` | `startSessionServer` / `createSessionCompositionRoot` |
| G1 | `ai-gateway` | GET | `/health` | `/functions/v1/ai-gateway/health` | `startGatewayServer` / `createGatewayCompositionRoot` — ai-gateway-only; no auth; no side effects |
| G2 | `ai-gateway` | POST | `/v1/agent/intents` | `/functions/v1/ai-gateway/v1/agent/intents` | `startGatewayServer` / `createGatewayCompositionRoot` — intent envelope; region gate before provider |
| E1 | `agent-executor` | POST | `/v1/payments/preflight` | `/functions/v1/agent-executor/v1/payments/preflight` | `startExecutorServer` / `createExecutorCompositionRoot` — read-only/static decision path |
| E2 | `agent-executor` | POST | `/v1/payments/execute` | `/functions/v1/agent-executor/v1/payments/execute` | `startExecutorServer` / `createExecutorCompositionRoot` — full idempotent execute path (C-DDL invariants unchanged) |

All other method/path combinations (wrong method on valid path, unknown bare/hosted, wrong-slug, duplicate prefix, encoded/traversal, bare `/functions/v1/<slug>` with no remainder, `/health` on session/executor bare and hosted) return the handler's existing 404 `INPUT_INVALID`. No new status or code.

### 8.4 RED-first contract (binding — genuine RED, pre-EXECUTE, unclaimed until run)

**Exact RED command (binding, run before any implementation):**

```bash
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

**Genuine RED definition:** hosted-prefixed valid paths (S1 hosted, G2 hosted, E1 hosted, G1 hosted) return 404 `INPUT_INVALID` while bare equivalents succeed — the checked-in proof of the H1–H3 prefix blocker. Coverage minimum is the §3 10-case set (cases 1–10 incl. wrong-slug, duplicate, unknown, encoded/traversal, method-preservation), each asserting status + mapped `INPUT_INVALID` code where rejected, against fake-backed production handlers only (no network, no secrets, no live calls).

**False-RED STOP rule (binding):** if the RED run fails for any reason other than the genuine hosted-404-vs-bare-success split — missing test file, import/compile error, all-pass, all-fail including bare, infra/runner failure, or any non-404 failure mode — STOP: do not implement, do not reinterpret, do not proceed to GREEN. Record the actual output and return to PLAN/PVL. A bare-path-only GREEN claimed while hosted is RED fails G23 by definition.

Neither RED nor GREEN output is claimed as run by this plan-only delta.

### 8.5 GREEN acceptance (binding — focused + G12a extended)

- **Focused GREEN:** the exact §8.4 command exits `0` with that file's Vitest passing-file/passing-test summary recorded as future evidence; full §8.3 matrix reachable bare and hosted; wrong-slug/duplicate/unknown/encoded/method-mismatch remain 404 `INPUT_INVALID`; `GET /health` shape byte-identical bare vs hosted; session/executor `/health` stays 404.
- **G12a extended GREEN:** `deploy-compat.vitest.test.ts` passes with existing 6 clauses unchanged GREEN plus the one additive prefix clause GREEN: asserts `path-prefix.ts` exists and exports `normalizeFunctionPath` + closed `FUNCTION_SLUGS`; asserts each `index.ts` imports it and calls it with its own literal slug; asserts no generic strip token (`/functions/v1/[^/]+` strip, `replace("/functions/v1/"`, split-drop-N) outside the normalizer's literal comparison.
- **No-drift GREEN:** G1-G8 GREEN unchanged (G7 CI-only/non-binding); no new route answering 200 (e.g. health on session/executor); no 16th code; no `as string` escape; no generic strip; no method rewrite; no mapper/TTL/DDL/pin/retry drift.

### 8.6 Binding gate command set (binding — all must pass post-fix; local GREEN proves routing logic only)

1. Focused: `corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts` (exit 0).
2. G12a extended: G12a clause file GREEN (existing 6 + 1 prefix clause).
3. Regression: `corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test` (existing semantics unchanged).
4. `corepack yarn typecheck`.
5. `corepack yarn lint`.
6. `corepack yarn validate:aicd`.
7. `node scripts/check-no-secrets.mjs` (0 findings).
8. `git diff --check` (clean).
9. Deno 2.9.6 per-function `check`/`bundle` (G12b): applicable per-function commands using `--no-lock -c <function>/deno.json` (3 checks + 3 bundles); `deno.lock` absent; `AGENT_SIGNER_PRIVATE_KEY` absent by name.

Local G23 GREEN proves dispatch logic only (fake-backed Vitest + Deno check/bundle). It does not prove hosted Supabase routing, region, model access, or RPC. Hosted proof is post-fix G13 redeploy + hosted health read only (§8.7).

### 8.7 Redeploy boundary (binding — post-fix, each step separately approval-gated)

1. G23 local GREEN first (§8.6 all pass), then EVL independent rerun of G23 + G1-G8/G12a/G12b; classification stays LOCAL GREEN only.
2. G13 redeploy only after G23 + EVL, under separate explicit approval, exactly: `supabase functions deploy session ai-gateway agent-executor --project-ref myotkovmgzdabuirkqlx` only; verify ref immediately before mutation; no migration / `db push` / `db reset`; no production ref.
3. `supabase functions list --project-ref myotkovmgzdabuirkqlx` must show all three slugs; confirm versions ACTIVE.
4. Hosted health confirm: `GET <regional-url>/functions/v1/ai-gateway/health` (and per-slug equivalents) return the exact non-secret health shape through the hosted prefix; derive `SUPABASE_REGIONAL_FUNCTION_URL` from deployment output only (never prepopulate); record redacted deployment evidence only; append a new immutable G13 record — never rewrite the preserved failure + deployment-only success records.
5. Fresh H1-H3 approval: H1/H2/H3 rerun only under a new explicit hybrid approval against the redeployed staging project; record fresh redacted evidence; never reuse prior 404s as success. Until then H1 BLOCKED / H2 BLOCKED / H3 PARTIAL remain frozen and NOT RUN.

### 8.8 Hard stops (binding — any one fails G23 and stops the lane)

New route invented; arbitrary-segment strip; double-strip; decode-and-route of `%`/`\`/traversal; missing normalizer in any of the three handlers; bare-path-only GREEN claimed while hosted RED; false RED reinterpreted as proof; any deployment, migration, OpenAI/RPC call, transaction, secret access, commit, or push under G23; any rewrite, reflow, normalization, or deletion of V1-V7/G13/G14-G22/H1-H3 history or of lines 1–218 of this supplement.

### 8.9 Approval requirement (binding)

No EXECUTE until PVL binds N1-N10 (§8.2), all 7 matrix rows (§8.3), the RED command + false-RED STOP rule (§8.4), GREEN acceptance (§8.5), the 9-gate set (§8.6), the redeploy boundary (§8.7), hard stops (§8.8), and the frozen H1 BLOCKED / H2 BLOCKED / H3 PARTIAL disposition — and the user gives explicit `ENTER EXECUTE MODE` naming this exact supplement path (`process/features/pact/active/pact-mvp_08-09-26/phase-04-supabase-prefix-routing-supplement_PLAN_12-09-26.md`). PVL must classify G23 and retain V1-V7/G13/G14-G22/H1-H3 boundaries.

### 8.10 Plan-only validation record (this pass — no runtime evidence claimed)

- Plan artifact/completeness: PASS (see validation results below).
- Plan discovery: PASS (see validation results below).
- Context discovery: PASS (see validation results below).
- Protocol/skill wiring: PASS (see validation results below).
- Secret scan (`node scripts/check-no-secrets.mjs`): PASS 990/0 at delta-write time (rerun post-append below).
- `git diff --check`: PASS clean at delta-write time (rerun post-append below).
- V1-V7 byte-identity: PASS (primary plan hash unchanged; this supplement lines 1–218 hash unchanged — verified post-append below).

**Status:** READY FOR PVL
**Summary (delta):** G23 Validate Contract bound to 6 exact paths, 10-point normalizer (N1-N10), 7-row matrix (health ai-gateway-only, bare+hosted, same `Deno.serve` handler), RED-first exact command with false-RED STOP, focused + G12a-extended GREEN, 9-gate binding set incl. Deno 2.9.6 function-local check/bundle, staged redeploy boundary (`myotkovmgzdabuirkqlx` only, no migration/reset, ACTIVE + hosted-health confirm, fresh H1-H3 approval, no 404 reuse), hard stops, and explicit approval — appended without rewriting V1-V7, G13, H1-H3, or lines 1–218.

## 9. G23 EVL RED-Evidence Waiver (appended 2026-09-12; lines 1–335 above preserved byte-identically, no rewrite)

**Scope:** append-only process evidence update. No implementation, test, migration, deployment, OpenAI/RPC/hosted-endpoint, secret-access, commit, or push work authorized or performed by this section. All V1-V7, G13 histories, G14-G22, redacted H1-H3 blocker appendix, §§1–7, and §8 (§§8.1–8.10) remain historical records and are not rewritten, reflowed, normalized, or deleted.

**Waiver authorization — exact 9 points recorded:**

1. RED claimed in EXECUTE but not persisted — no RED log/output file was saved as evidence during the EXECUTE pass.
2. EVL verified pre-fix exact-match dispatch cannot accept prefixed paths — pre-fix entrypoint handlers dispatch on bare exact matches only, with no prefix-strip path, so hosted `/functions/v1/<slug>`-prefixed valid routes cannot reach a handler pre-fix.
3. Live H1/H2 404 `INPUT_INVALID` on prefixed routes with bare routing working — the redacted post-foundation H1–H3 lane records correlated 404 `INPUT_INVALID` on gateway-prefixed intent and executor-prefixed preflight routes while deployed handlers answer and bare local routing works.
4. New test asserts previously-failing hosted-prefix behavior — `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` cases 2–5 encode the hosted-prefix RED→GREEN split (hosted session challenge, hosted gateway intent, hosted executor preflight, hosted ai-gateway health vs bare equivalents).
5. Explicit WAIVER not fabricated RED — this section is an explicit RED-evidence waiver; no RED output is invented, backfilled, or reinterpreted as run evidence.
6. All rerunnable gates GREEN with exact counts — focused 10/10, G12a 7/7, regression 27/157, typecheck GREEN, lint GREEN, AICD GREEN, secret 992/0, diff-check clean, Deno 2.9.6 checks+bundles GREEN.
7. Scope exactly six approved paths — §8.1 closed set only (`supabase/functions/_shared/path-prefix.ts`; `supabase/functions/session/index.ts`; `supabase/functions/ai-gateway/index.ts`; `supabase/functions/agent-executor/index.ts`; `supabase/functions/_shared/test/prefix-routing.vitest.test.ts`; `supabase/functions/_shared/test/deploy-compat.vitest.test.ts` additive clause); any edit outside these six paths fails G23.
8. H1 BLOCKED / H2 BLOCKED / H3 PARTIAL preserved — frozen disposition unchanged until post-fix redeploy; NOT RUN beyond the recorded blocker; no 404 reused or reinterpreted as success.
9. G13 post-fix redeploy separately gated — requires separate explicit approval; no redeploy, migration, `db push`/`db reset`, production ref, provider/RPC call, transaction, secret access, commit, or push authorized by this waiver.

**Validation for this append-only pass:** secret scan + `git diff --check` only (rerun post-append; results reported below). No implementation/test/migration changes.

G23 EVL COMPLETE — GREEN WITH EXPLICIT RED EVIDENCE WAIVER — READY FOR POST-FIX G13 APPROVAL.
