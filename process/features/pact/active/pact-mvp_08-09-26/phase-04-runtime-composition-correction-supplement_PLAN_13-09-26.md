---
name: plan:phase-04-runtime-composition-correction-supplement
description: "Phase 04 correction plan for production composition, auth, and read-only runtime wiring"
date: 13-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
  mode: plan-supplement
---

# Phase 04 Runtime Composition Correction Supplement

**Mode:** PLAN-SUPPLEMENT  
**Date:** 2026-09-13  
**Status:** READY FOR PVL; NOT READY FOR EXECUTE, MIGRATION, G13, OR H1-H3  
**Complexity:** COMPLEX  
**Primary execute anchor:** G24-G30 in this supplement, after PVL binds this exact artifact and explicit local EXECUTE approval.

## 1. Problem, Evidence, and Preservation

The prior local/runtime contracts test injected dependencies into production-shaped
handlers, but the deployed `Deno.serve` roots do not compose the dependencies that
the handlers require:

- **Gateway composition gap (H1):** `supabase/functions/ai-gateway/index.ts`
  `createGatewayCompositionRoot` accepts optional provider, card, merchants, and
  store values, while the production `Deno.serve` call supplies only region and
  API-key environment names. Missing dependencies therefore select the fail-closed
  path and H1 returns `503 REGION_MISMATCH`; the handler needs provider, card,
  merchant catalog, intent store, and runtime auth/config composition.
- **Executor composition gap (H2):** the production root can construct a
  read-only client from `CREDITCOIN_RPC_URL`, but it does not compose persisted
  intent/card lookup or server-bound authority values. The HTTP read-only branch
  currently accepts `cardId` and `nonce` from the request and does not prove a
  server-bound intent/card lookup before `eth_call`. H2 returned
  `503 PREFLIGHT_DECLINED` with no usable static-call evidence.
- **Platform auth/health gap (H3):** the deployed platform JWT gate returns
  `401` before the public `/health` handler. Local health returns `200` with the
  exact seven keys, but local reachability cannot prove hosted behavior. The
  function JWT setting and application auth ordering must be explicit: public
  health must reach the handler, while protected routes must authenticate in the
  application before provider, persistence, or chain work.
- **Session composition gap:** `createSessionCompositionRoot` accepts an optional
  persistence port, but the production root does not select the existing Option A
  PostgREST adapter. `persistence-composition.ts` and the session/intent/card
  adapters exist, but are not selected by production roots.
- **Model-source gap:** the gateway embeds a JSON model configuration instead of
  loading the canonical `config/ai/model-config.json` through the domain loader.

The evidence above is the correction target, not a success result. V1-V7, all G13
histories (including the original failure and deployment-only history), G14-G23,
and every H1-H3 appendix remain unchanged and append-only. No previous evidence is
reused as success: fake/local green cannot prove hosted Supabase composition,
platform JWT behavior, remote persistence, live OpenAI access, or regional RPC.

## 2. Scope and Closed Touchpoints

This supplement is plan-only. It authorizes no implementation, test execution,
migration execution/reset, deployment, OpenAI/RPC/hosted request, secret access,
transaction, commit, or push. The future implementation/test scope is closed to:

- `supabase/functions/session/index.ts`, `ai-gateway/index.ts`, and
  `agent-executor/index.ts` composition roots and `Deno.serve` environment wiring;
- `supabase/functions/_shared/` ports, persistence composition, auth, region/config
  loaders, card/intent/session adapters, and read-only transport boundaries;
- `config/ai/model-config.json` loading and the existing canonical domain loader;
- `supabase/config.toml` function JWT settings, with no secret values;
- focused Vitest/static tests under `supabase/functions/_shared/test/` and
  existing focused domain/config tests;
- additive redacted Phase 04 report/context updates after approved execution, with
  historical sections never rewritten.

Explicitly out of scope: migration execution or reset, schema redesign, deployment,
G13 execution, H1-H3 execution, OpenAI/RPC/hosted calls, transactions, signer-key
composition, new API error codes, payment/controller authority changes, canonical
serializer changes, model/provider fallback, arbitrary upstream routing, and any
change to V1-V7, G13 histories, G14-G23, or H1-H3 appendices.

## 3. Corrected Runtime Contract

### Region and model configuration

- `SUPABASE_FUNCTION_REGION` is the operator-configured expected region.
- `SB_REGION` is the platform/runtime-observed region. Local factories must set
  both explicitly; the production root must not substitute one for the other.
- Protected work fails closed before provider, persistence, or chain work unless
  both names are present and `SB_REGION === SUPABASE_FUNCTION_REGION`.
- Public health remains reachable without application auth and returns the existing
  exact seven-key shape. Its `configuredRegion` represents the runtime region (or
  a non-secret unknown marker) and `expectedRegion` represents the configured
  expectation; a mismatch is visible without adding a health key or exposing
  environment secrets. Protected work remains blocked on mismatch.
- The gateway loads `config/ai/model-config.json` through the canonical
  `loadOpenAIConfig`/`parseModelConfigJson` path and asserts
  `provider=openai`, `model=gpt-5.6-luna`, and `allowFallback=false` before fetch.
  `OPENAI_MODEL` is unset-or-exact only. No inline JSON pin, second model source,
  SDK, provider fallback, or model substitution is permitted.

### Persistence and application authentication

- Session production composition selects Option A server-only PostgREST
  persistence through the existing ports and `createPostgrestPersistenceFromEnv`.
  Missing persistence configuration fails closed; there is no production Map/fake
  fallback. Hash-only credentials, five-minute challenge TTL, thirty-minute
  session TTL, atomic consume-once, wallet binding, and monotonic revoke remain
  unchanged.
- Gateway and executor production composition select the same server-only
  persistence boundary for `IntentStore` and `CardStore`. Fake stores remain local
  test factories only. The service-role value, if required by the existing Option A
  adapter, is function-only and never reaches edge/browser/logs/tests.
- `supabase/config.toml` explicitly disables the platform JWT pre-gate for the
  three functions so public session bootstrap and gateway health can reach the
  application handler. This does not make protected routes public: gateway intent,
  executor preflight/execute, and session revoke require the existing wallet-bound
  application session via `requireSession` before protected work. Session challenge
  and verify remain the explicit public bootstrap routes. Invalid, missing, expired,
  revoked, or wrong-wallet application credentials map to the existing closed
  error surface only.

### Gateway composition

The gateway production root must compose, rather than receive only partial
environment values:

- canonical model config and server-only `OPENAI_API_KEY` boundary;
- expected/runtime region check;
- application auth middleware before provider, card, catalog, or store work;
- `CardStore` lookup for the server-bound card snapshot and owner/agent context;
- the canonical merchant catalog, with merchant IDs only and no model-supplied
  recipient/address authority;
- `IntentStore` persistence after strict provider/schema/catalog/canonical-hash
  validation; and
- the existing raw-fetch `AiProvider`, `store:false`, strict
  `pact_agent_intent` schema, one retry only for 429/502/503, and closed 15-code
  mapping.

No valid intent may be returned or persisted when auth, region, model pin, card,
merchant, provider, or schema validation fails. The gateway never imports or
composes executor signer/payment-send code.

### Executor read-only composition

The H2 composition is a distinct read-only path. It must compose:

- `CREDITCOIN_RPC_URL` into the existing read-only transport/client;
- application auth before intent/card lookup or RPC;
- persisted intent lookup and server-bound card values through `IntentStore` and
  `CardStore`, including merchant, asset, policy, agent, and card-scoped nonce;
- `from=agent` for the simulated caller; and
- only `eth_chainId` and `eth_call`/static `preflightPay`/card reads.

Client-supplied card, merchant, asset, recipient, agent, policy, or nonce values
cannot override persisted/server-bound values. Wrong chain, missing persisted
records, mismatch, or decline fails closed. This composition never loads
`AGENT_SIGNER_PRIVATE_KEY`, constructs a signer, estimates gas for submission,
broadcasts, calls `sendPayment`, or reaches execute/reconcile. Existing full
executor idempotency, store-before-wait, timeout reconciliation, no-second-submit,
and receipt-status-1-only invariants remain regression requirements, not a license
to add signer authority here.

## 4. RED-First Tests and Acceptance

During a later approved EXECUTE, create each focused test before its correction,
then run its exact command and capture a genuine failure. Missing-file, compile,
infrastructure, all-pass, or all-fail RED is a STOP and is not evidence. No test
below is run or claimed by this plan.

### Runtime composition and region/model source

Test file: `supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts`

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
```

Acceptance: the same `startSessionServer`, `startGatewayServer`, and
`startExecutorServer` handlers used by `Deno.serve` compose production adapters
from runtime inputs; missing dependencies never select a fake; expected/runtime
region mismatch stops protected work; `SB_REGION` is not treated as the expected
region; the gateway loads the canonical model-config source and has no inline model
pin; health remains public and side-effect free.

### Auth and health / Supabase function config

Test file: `supabase/functions/_shared/test/auth-health-correction.vitest.test.ts`

```bash
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
```

Acceptance: static config proves the three function JWT gates are explicit and
health is not blocked by the platform pre-gate; local `GET /health` is unauthenticated,
`200`, correlation-preserving, and has exactly
`requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`;
protected gateway intent and executor routes reject missing/invalid app auth before
provider/store/RPC work; session revoke is protected; session challenge/verify are
the only public bootstrap routes. No new error code or health key is introduced.

### Session persistence composition

Test file: `supabase/functions/_shared/test/session-composition-correction.vitest.test.ts`

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
```

Acceptance: the production root selects the injected PostgREST-shaped adapter from
server environment configuration, never a Map/fake; challenge insert and session
insert contain only approved hashes/fields; consume is one atomic conditional
operation with zero-row replay rejection; TTL, wallet binding, expiry, revoke, and
raw database-error redaction remain green; no secret value is recorded.

### Gateway card/store/provider composition

Test file: `supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts`

```bash
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
```

Acceptance: the production root composes `CardStore`, canonical merchant catalog,
`IntentStore`, session auth, region/config gates, and raw-fetch provider; auth and
region/config checks precede provider/card/store protected work; card/agent/asset/
recipient/policy/hash are server-bound; provider output is merchantId-only; one
intent write occurs only after all validation; provider/schema/catalog/model/region
failures produce zero provider/persistence/payment side effects; `store:false`,
strict schema, retry budget, redaction, and closed 15-code mapping remain intact.

### Executor read-only transport

Test file: `supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts`

```bash
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
```

Acceptance: production composition requires `CREDITCOIN_RPC_URL`, resolves the
persisted intent/card/server-bound merchant, asset, agent, policy, and nonce, and
uses `from=agent`; the fake transport sees only `eth_chainId` and `eth_call`; wrong
chain, missing records, client authority overrides, and decline fail closed; no
Wallet, signer key, `eth_sendTransaction`, `sendRawTransaction`, gas, broadcast,
transaction, or `sendPayment` is reachable. Existing executor fake tests remain
green for idempotency and reconciliation.

### Config, pin, secret isolation, and regressions

Run the existing focused authority tests and static checks:

```bash
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
node scripts/check-no-secrets.mjs
rg -n "OPENAI_API_KEY|AGENT_SIGNER_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|from ['\"]openai['\"]|require\(['\"]openai['\"]\)" --glob '!yarn.lock' --glob '!.git/**'
git diff --check
```

Acceptance: only approved secret names occur in server boundaries; no secret value
occurs in source, fixtures, bundles, logs, or evidence; no edge/browser secret
import exists; no OpenAI SDK exists; the canonical model file is the only model
authority; no `as string` escape or 16th API code is introduced; G23 prefix and
health contracts remain unchanged.

Full local regression command after all focused GREEN results:

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Deno checks, when available, remain local/non-hosted checks only:

```bash
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
```

Fake/local evidence cannot prove hosted parity, platform JWT behavior, remote
schema/persistence, live model access, or regional RPC. No such claim may be made
from these commands.

## 5. Gates, PVL Contract, EVL, and Approvals

The next PVL must validate this exact supplement as an additive correction contract,
bind every closed touchpoint and RED command, confirm the current source evidence
above, classify G24-G30, preserve V1-V7/G13/G14-G23/H1-H3, and reject any implied
implementation or live authorization. PVL must also verify that no migration,
deployment, OpenAI/RPC/hosted call, signer, transaction, secret value, commit, or
push is part of this plan. A PVL pass is not EXECUTE approval.

Additive gates, all future and unclaimed here:

- **G24 - Production composition roots:** runtime-composition correction test;
  production `Deno.serve` roots select required adapters/config and fail closed on
  missing region/dependencies, with no fake fallback.
- **G25 - Region/model/config isolation:** auth-health/static config test,
  provider-config test, deploy-compat test, and the exact secret/pin scans;
  `SB_REGION` versus `SUPABASE_FUNCTION_REGION`, canonical model loading, and
  no-secret/no-SDK/no-duplicate-pin rules pass.
- **G26 - Session persistence selection:** session-composition correction test plus
  existing session/PostgREST tests; production selects Option A, hash-only and
  atomic session semantics remain green, and no Map authority remains.
- **G27 - Gateway protected composition:** gateway-composition correction test;
  auth-before-work, CardStore/catalog/IntentStore/provider composition, canonical
  model/provider contract, server-bound values, zero persistence on failure, and
  closed error mapping pass.
- **G28 - Executor read-only composition:** executor-read-only correction test plus
  existing executor tests; persisted values, `from=agent`, `eth_chainId`/`eth_call`
  only, and zero signer/broadcast/send behavior pass.
- **G29 - Platform JWT and public health:** auth-health correction test and static
  `supabase/config.toml` review; public health reaches the handler with the exact
  seven-key shape while protected routes require application auth.
- **G30 - Regression and EVL readiness:** full Vitest, typecheck, lint, AICD,
  secret scan, diff check, and applicable Deno checks pass after genuine RED-to-
  GREEN correction. EVL independently reruns the focused and regression gates;
  local classification remains local-only.

Separate approval boundaries are mandatory:

1. **Migration approval:** a new explicit approval is required before any schema
   application, reset, or remote parity lane. This supplement neither executes nor
   authorizes migration work; source/static tests cannot prove remote schema parity.
2. **G13 redeploy approval:** after G24-G30 local GREEN and independent EVL, a
   separate explicit staging-only approval is required for the exact three-function
   redeploy and status verification. No production target, migration, or live
   provider/RPC call is implied. Historical G13 results remain historical.
3. **Fresh H1-H3 approval:** only after local correction is green, EVL is green,
   required migration/schema prerequisites have their separate approval/result, and
   post-correction G13 is separately approved and successful may a new explicit
   H1-H3 approval be considered. H1/H2/H3 must produce fresh redacted evidence;
   prior H1-H3 appendices and failures are never reused as success.

Any false RED, missing production dependency, platform JWT ambiguity, auth bypass,
region mismatch, inline model pin, fake fallback, client authority use, non-static
RPC, signer access, secret-shaped output, migration/deployment/live call, or
historical rewrite is a hard stop.

## 6. Resume Handoff

Selected artifact:
`process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`

The next valid step is **PVL against this exact artifact**, followed by local
EXECUTE only if PVL binds the contract and explicit EXECUTE approval is given.
Then run genuine RED-first focused tests, implement the minimum local correction,
and perform independent EVL. There is no valid live lane until the correction is
locally green, EVL is complete, migration/schema work has its separate approval if
needed, G13 has its separate redeploy approval, and fresh H1-H3 approval is granted.

No test, deployment, migration, provider/RPC call, hosted request, secret access,
transaction, commit, push, or success result is claimed by this plan.

**PHASE 04 RUNTIME COMPOSITION CORRECTION PLAN COMPLETE - READY FOR PVL**

## Validate Contract

Status: CONDITIONAL
Date: 2026-09-13
date: 2026-09-13
generated-by: inner-pvl: phase-04
Scope: This contract validates only this exact supplement and its proposed G24-G30 correction boundary. It is a plan contract, not implementation, test, migration, deployment, hosted, OpenAI, RPC, transaction, signer, or secret-value evidence. The pre-append supplement was 19,462 bytes / 359 lines with sha256 `2d1ab90cb28234b1fe8885cee3eb9d73ac7e5fabcd5940c1728453d607b5a0b5`; that prefix must remain byte-identical after this append.

### V1 — Pre-check and source disposition

- Context routing was followed from `process/context/all-context.md` through `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, backend test routing, the Phase 04 primary plan/report, the persistence and H1-H3 supplements, the G23 supplement, and the named current runtime/config/test files.
- Plan discovery found this exact supplement in the Pact Phase 04 task folder. No duplicate correction supplement was selected.
- Allowed static PVL checks run before this append: context routing PASS; context discovery PASS (`0` failures); protocol discovery PASS (`0` failures); Pact plan discovery PASS; secret scan PASS (`995` scanned, `0` findings); `git diff --check` PASS.
- The plan-artifact validator reported `8` failures and `9` warnings because this supplement shape lacks several legacy headings and metadata spellings (`Date`, `Status`, overview, `Touchpoints`, `Public Contracts`, `Blast Radius`, `Verification Evidence`, `Resume and Execution Handoff`, and the legacy checklist/RFC headings). This is a bounded structural concern, not a reason to rewrite the prior supplement bytes; the present contract supplies the missing validation artifact and explicit handoff content below.
- Current source confirms the correction is needed, not complete: session composition accepts injected persistence but does not select it from production environment wiring (`supabase/functions/session/index.ts:327-344,366-373`); gateway composition accepts optional dependencies and embeds inline model JSON (`supabase/functions/ai-gateway/index.ts:183-224,387-392`); executor production composition creates only an optional read-only client and the HTTP read-only branch accepts request `cardId`/`nonce` (`supabase/functions/agent-executor/index.ts:212-255,261-311`); `supabase/config.toml` is absent.
- Existing local tests are not correction evidence. The current G14-G17/G21 tests use injected fakes and do not prove production PostgREST selection, application auth ordering, platform JWT behavior, hosted parity, or live model/RPC access (`supabase/functions/_shared/test/composition-roots.vitest.test.ts:14-131`, `session-runtime.vitest.test.ts:12-88`, `ai-gateway-runtime.vitest.test.ts:23-72`, `agent-executor-runtime.vitest.test.ts:5-46`).

### V2 — Findings and net gate

| Dimension | Status | Finding and disposition |
|---|---|---|
| infra/setup-fit | CONCERN | The three production entrypoints and shared adapters exist, but `supabase/config.toml` does not. The plan explicitly owns that missing static configuration and keeps Deno/hosted behavior outside PVL evidence. |
| test-coverage | CONCERN | The five exact correction test files are absent, so their RED-first commands are future EXECUTE commands. Existing tests cover prior local behavior only. No implementation test was run in this PVL. |
| breaking-changes | CONCERN | Auth ordering, production persistence selection, and executor read-only composition cross existing Phase 04 boundaries. The contract below limits changes to the supplement touchpoints and requires the existing 15-code, canonical-domain, G23, health, payment, and authority contracts to remain unchanged. |
| security-surface | CONCERN | Current roots do not enforce application auth before protected work and the existing Option A adapter requires a server-only service-role input (`supabase/functions/_shared/persistence-ports.ts:168-183`). The contract requires function-only handling, no browser/edge exposure, no fake production fallback, and no signer/broadcast access in the correction path. |

There are no unresolved plan-scope FAILs. The concerns are bounded because the supplement names the owning files, exact future tests, hard stops, approval boundaries, and known gaps. The current source is intentionally not treated as corrected.

### V3 — G24-G30 classification

| Gate | PVL classification | Current source/static basis | Required future close condition |
|---|---|---|---|
| G24 — production composition roots | CONDITIONAL / NOT RUN | Session root requires injected `persistence` but does not compose it from env (`session/index.ts:327-344`); gateway root requires optional provider/card/catalog/store (`ai-gateway/index.ts:183-224`); executor root only composes optional read-only RPC client (`agent-executor/index.ts:261-279`). | The exact runtime-composition correction test passes against the same `startSessionServer`, `startGatewayServer`, and `startExecutorServer` handlers used by `Deno.serve`; missing dependencies fail closed and never select Map/fake stores. |
| G25 — region/model/config isolation | CONDITIONAL / NOT RUN | Gateway uses `configuredRegion` as both configured and actual region (`ai-gateway/index.ts:191-220`), embeds a model JSON literal at `:194-200`, and does not pass `OPENAI_MODEL`; `SB_REGION` is not composed. The canonical model file is pinned (`config/ai/model-config.json:1-5`) and the domain loader exports `loadModelConfig`/`parseModelConfigJson` (`packages/domain/src/model-config.ts:44-75`). | Auth-health/static and provider-config/deploy-compat checks prove separate `SUPABASE_FUNCTION_REGION`/`SB_REGION`, canonical model loading, exact `openai`/`gpt-5.6-luna`/`allowFallback:false`, unset-or-exact `OPENAI_MODEL`, no SDK, no duplicate pin, and no secret exposure. |
| G26 — session persistence selection | CONDITIONAL / NOT RUN | `createPostgrestPersistenceFromEnv` exists (`supabase/functions/_shared/persistence-composition.ts:225-242`), but `createSessionCompositionRoot` never calls it and instead fails closed unless an injected persistence is supplied (`session/index.ts:327-344`). The existing adapter preserves hash-only/TTL/atomic predicates (`session-challenge-store.ts:156-250`), but no production-root selection is proven. | Session-composition correction test proves Option A selection, no Map fallback, hash-only 5-minute/30-minute semantics, atomic consume-once, wallet binding, revoke/expiry, and redacted persistence errors. |
| G27 — gateway protected composition | CONDITIONAL / NOT RUN | Gateway has no `requireSession` call (`ai-gateway/index.ts:119-177`); `GatewayRequestDeps` accepts optional injected values (`:34-51`); `handleRuntimeIntentRequest` saves after validation but only through a generic `save` port (`:85-91`); production root does not compose card/catalog/IntentStore/persistence. Provider itself has raw fetch, strict schema, `store:false`, and retry shape (`openai-provider.ts:54-180`). | Gateway-composition correction test proves auth and region/config before provider/card/store work, server-bound card/agent/asset/recipient/policy/hash, canonical merchant catalog, one persistence write after all validation, zero side effects on every failure, redacted closed 15-code errors, and no executor/signer import. |
| G28 — executor read-only composition | CONDITIONAL / NOT RUN | The read-only client permits only `eth_chainId`/`eth_call` (`chain-client.ts:45-93`), but defaults `agent` to zero (`:73-75`) and the HTTP branch accepts client `cardId` and `nonce` (`agent-executor/index.ts:242-248`) without persisted intent/card lookup or application auth. Full fake executor state remains Map-backed (`:44-66`). | Executor correction test proves persisted/server-bound intent/card merchant/asset/policy/agent/nonce, `from=agent`, target-chain assertion, only `eth_chainId` and `eth_call`, and no Wallet, signer key, gas, send, broadcast, transaction, or `sendPayment` path. Existing idempotency/reconcile tests remain unchanged. |
| G29 — platform JWT and public health | CONDITIONAL / NOT RUN | `supabase/config.toml` is absent; local gateway health is public only in the application handler (`ai-gateway/index.ts:94-117,137-145`) and current health has the exact seven keys (`_shared/health.ts:5-31`). Hosted platform pre-gate behavior is not statically proven. | Static auth-health correction test proves explicit `verify_jwt = false` settings for `session`, `ai-gateway`, and `agent-executor`; application auth protects gateway intent, executor preflight/execute, and session revoke; challenge/verify remain public; health is unauthenticated, correlation-preserving, side-effect-free, and exactly seven keys. |
| G30 — regression and EVL readiness | CONDITIONAL / NOT RUN | No correction tests or implementation tests were run under the user’s PVL-only constraint. Existing historical green records are not reused as correction evidence. Allowed static secret/diff/discovery checks passed before append. | Genuine RED-to-GREEN focused results, full local regression, typecheck, lint, AICD, secret scan, diff check, and applicable local Deno checks are recorded by later EXECUTE/EVL. Local results remain local-only; hosted/live gates remain separate. |

**Net Gate: CONDITIONAL** — zero unresolved plan-scope FAILs; seven additive gates are unexecuted and current source contains the named correction gaps; artifact-shape and missing-future-test/config concerns are recorded, not hidden. This is not an EXECUTE, migration, G13, or H1-H3 approval.

### V4 — Exact future RED-first gates and assertions

The following commands are exact future EXECUTE commands. They were not run in this PVL, and no RED or GREEN output is claimed. Each focused test file must exist and compile before its RED run. Missing-file, compile, infrastructure, all-pass, or all-fail RED is invalid and is a hard stop.

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
```

The tests must use fake dependencies only and exercise the actual production composition roots, not detached helper substitutes:

- **Composition and region:** `startSessionServer`, `startGatewayServer`, and `startExecutorServer` must receive the runtime inputs used by `Deno.serve`. `SUPABASE_FUNCTION_REGION` is the expected operator setting; `SB_REGION` is the observed runtime setting. Protected work requires both names and exact equality, with mismatch before provider, persistence, card, or RPC work. `SB_REGION` must never be used as the expected value.
- **Auth and health:** `requireSession` from `supabase/functions/_shared/auth.ts:1-4` and its implementation at `_shared/session-token.ts:30-47` must run before protected gateway intent and executor preflight/execute work. Session challenge/verify are the only public bootstrap routes; revoke is protected. Public gateway health must remain side-effect-free and retain exactly `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable` from `_shared/health.ts:5-31`; no key may be added or renamed.
- **Session persistence:** Production selection must call `createPostgrestPersistenceFromEnv` (`_shared/persistence-composition.ts:236-242`) or the existing equivalent Option A boundary, never `createFakePersistence` or a Map fallback. The server-only credential names remain confined to the regional function. Preserve the existing `SessionPersistence` port (`session/index.ts:62-68`), SHA-256 64-hex hash-only rows, 5-minute challenge TTL, 30-minute session TTL, wallet binding, monotonic revoke, and atomic consume equivalent to `UPDATE session_challenges SET consumed_at=now() WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING ...`; zero rows issue no session and map to the existing auth error surface.
- **Gateway/provider:** Production composition must combine `requireSession`, server-bound `CardStore`, canonical merchant IDs, `IntentStore`, region checks, and the raw-fetch `OpenAiProvider`. Load the canonical `config/ai/model-config.json` through the real domain API: `loadModelConfig` (`packages/domain/src/model-config.ts:44-52`) for the file source and/or `parseModelConfigJson` (`:60-75`) for an edge-safe injected JSON source, then use `assertModelConfigAllowsCall` (`:78-90`) and the existing `resolveOpenAIModel` contract (`packages/domain/src/schemas.ts:349-366`). The phrase `loadOpenAIConfig(model-config.json)` in earlier historical plans is not an instruction to call a nonexistent API or make `openai.json` authoritative. The gateway must assert `provider=openai`, `model=gpt-5.6-luna`, `allowFallback=false`, and unset-or-exact `OPENAI_MODEL` before fetch. Preserve `store:false`, strict `pact_agent_intent`, `additionalProperties:false`, merchantId-only output, one retry only for 429/502/503, no SDK, no fallback, no arbitrary upstream, and no provider body/key/prompt in output. Persist only after schema/catalog/canonical-hash validation and exactly once.
- **Executor read-only:** The correction path must compose persisted intent/card lookup with the read-only client from `CREDITCOIN_RPC_URL`. Persisted merchant, native asset, policy, agent, card, and card-scoped nonce are authoritative; client values cannot override them. The simulated caller is the persisted agent. The fake transport may observe only `eth_chainId` and `eth_call` with static `preflightPay`/card reads. No read-only path may load `AGENT_SIGNER_PRIVATE_KEY`, construct `Wallet`, estimate gas for submission, call `sendPayment`, call `sendRawTransaction`/`eth_sendTransaction`, broadcast, or reach execute/reconcile. The full executor invariants remain regression requirements: first claim/row lock, store tx hash before wait, timeout reconcile by nonce and stored hash, no second submit, and settled only for receipt status `1` (`agent-executor/index.ts:126-209`, `payment-reconciler.ts:14-31`).
- **Configuration:** The absent `supabase/config.toml` is a planned file gap, not evidence. The later static test must prove explicit platform JWT bypass settings for all three functions, while application auth remains mandatory on protected routes. No secret value may occur in that file or any source/config/test/evidence artifact.

### V5 — Existing contracts and regression gates

The correction may not add API codes, alter authority, or reinterpret historical evidence. The closed 15-code surface is the canonical `API_ERROR_CODES` and mapper in `packages/domain/src/api.ts:14-32,146-211`; the current gateway-local list at `ai-gateway/index.ts:60-82` must not become a second divergent authority. Unknown/throwable/provider/database/RPC errors remain mapped to the existing closed redacted error surface. No `as string` escape, 16th code, raw error/body/header, client recipient/asset/agent/policy/nonce authority, or model/provider substitution is allowed.

The native asset remains `native-testnet-ctc` and the chain adapter remains the Phase 01/02 authority. Card persistence is a cache; controller state and a current chain read remain payment authority. G23 prefix routing and exact route error behavior remain unchanged (`_shared/path-prefix.ts`, `prefix-routing.vitest.test.ts`, `deploy-compat.vitest.test.ts`). Health remains the existing seven-key contract. The original Phase 04 plan/report, original V1-V7 contract, G13 histories, G14-G23 evidence, and H1-H3 appendices are read-only historical records.

After genuine focused RED/GREEN correction, the later EXECUTE/EVL regression set is:

```bash
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
rg -n "OPENAI_API_KEY|AGENT_SIGNER_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|from ['\"]openai['\"]|require\(['\"]openai['\"]\)" --glob '!yarn.lock' --glob '!.git/**'
git diff --check
```

Applicable local Deno checks remain non-hosted and are not evidence of hosted parity:

```bash
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
```

### V6 — Known gaps, hard stops, and approval boundaries

Known gaps retained honestly:

- The five correction test files and `supabase/config.toml` are absent at PVL time; their absence is a future implementation gap, not test evidence.
- Remote Supabase schema/persistence parity, platform JWT behavior, hosted route composition, regional RPC behavior, and live `gpt-5.6-luna` access are not proven by this contract or by local fake/static checks.
- Current Option A persistence uses `SUPABASE_SERVICE_ROLE_KEY` in the server-only PostgREST adapter (`_shared/persistence-ports.ts:131-183`). Whether that existing boundary is retained or replaced must be decided in the approved implementation without exposing the value to edge/browser/logs/tests; no silent anon/service-role change is permitted.
- The current `CardStore` returns a persistence-local `CardRecord` (`_shared/card-store.ts:144-156`) while gateway/executor runtime ports use different shapes. The correction must add an explicit lossless mapping at the shared boundary or record a bounded plan deviation; it must not pass a cache row as payment authority.
- The current source uses a gateway-local error-code list and inline model JSON. These are correction targets; existing 15-code and canonical model tests are regression gates, not proof that production composition is already fixed.

Hard stops: any implementation test run during PVL; missing/false RED; migration, reset, schema application, deployment, G13, H1-H3, hosted request, OpenAI/provider request, RPC request, transaction, gas, signer construction, secret-value access, secret-shaped output, fake production fallback, auth bypass, region substitution, inline/duplicate model authority, client-controlled payment authority, non-static RPC, new API code, error/health/route drift, or rewrite/reflow/deletion of prior plan/report/evidence. No-signer and no-broadcast requirements apply even when a read-only test is green.

Approval boundaries remain separate and mandatory: (1) migration/remote schema approval; (2) post-correction staging-only G13 redeploy approval; (3) fresh H1-H3 approval only after local correction GREEN, independent EVL, migration prerequisites, and successful post-correction G13. This PVL contract grants none of those approvals and does not authorize EXECUTE despite the surrounding autopilot standing consent.

### V7 — Preservation, acceptance, and handoff

- G23 remains unchanged and historical: its local prefix-routing result is not promoted to hosted proof. Prior G13 deployment records and H1/H2/H3 dispositions remain unchanged. No prior result is reused as G24-G30 success.
- Preservation anchors read before append: primary Phase 04 plan sha256 `14b10c4b41b5b179e58b98b60c80a9bcf55542f58e048bb1f8d840db6f45a814`; Phase 04 report sha256 `f78afe632976ed0def5458bd8b2a493211a80ab39c782a547707f9754ff541ab`; persistence supplement sha256 `81f372e18a6d98342aee94164df2d0e4487454f154d7997474f6932ebca95145`; H1-H3 supplement sha256 `71204ebdcdfc87b2789d6c06a32eefd9f659d10e876f3737636a29e5327e1219`. These files are not modified by this PVL.
- Accepted by: `session (autonomous, /goal execution)` for validation artifact production only, with structured concerns: artifact-shape validator mismatch; future correction tests/config absent; production auth/persistence/model/read-only composition currently incomplete; hosted/schema/model/RPC behavior unknown. This acceptance is not user approval for implementation, migration, deployment, G13, or H1-H3.
- Handoff: keep this exact supplement active with `Status: CONDITIONAL`; the next valid state is explicit review of this contract followed by a separately authorized EXECUTE that creates each named test, captures genuine RED before the minimum correction, runs the focused GREEN and regression gates, and records deviations only in additive process artifacts. Do not edit the original Phase 04 plan/report, persistence/H1-H3/G23 supplements, or prior evidence.

**Gate: CONDITIONAL**
**Selected plan:** `process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`
**Next valid action:** review this bounded contract; no implementation or live lane is authorized by PVL.

## Local Execute Status (2026-09-13)

This section is additive execution status. The 477-line prefix above, all prior
plans/reports, and all prior evidence remain unchanged. No main Phase 04 report
append was made because independent EVL has not run.

- Exact RED-first commands were run for all five named correction test paths
  after the test files were created. Raw result was `5` commands, `12` tests,
  `9` failures, and `3` passes. The auth-health command had `2` failures and
  `1` pass; the executor command had `1` failure and `2` passes. The
  runtime-composition, session-composition, and gateway-composition commands
  were genuine source/behavior failures but all-fail runs, so they are not
  counted as valid RED evidence under V4. An initial gateway test collection
  failure caused by an incorrect test-relative import was corrected and is not
  counted. The absent `supabase/config.toml` source-presence failure is the
  planned structural waiver; it was not fabricated as RED evidence.
- Exact focused GREEN results after implementation: runtime composition `2/2`,
  auth/health `3/3`, session composition `2/2`, gateway composition `2/2`,
  and executor read-only composition `3/3` (`12/12` tests, `5/5` files).
- G24-G30 local classification: G24 GREEN, G25 GREEN, G26 GREEN, G27 GREEN,
  G28 GREEN, G29 GREEN, and G30 GREEN for the executed local/static scope only.
  These results do not prove hosted JWT behavior, remote schema parity, live
  model access, or regional RPC behavior.
- Existing local regression: `35/35` Vitest files and `197/197` tests GREEN;
  provider-config `4/4`, deploy-compat `8/8`, prefix routing `12/12`, health
  `1/1`, composition roots `5/5`, session/intent/card adapter checks `18/18`,
  gateway runtime `2/2`, and executor runtime `2/2` GREEN.
- Typecheck GREEN; lint GREEN; AICD GREEN (`0` failures); secret scan GREEN
  (`1001` scanned, `0` findings); `git diff --check` GREEN. The exact secret/
  SDK scan found only approved names and existing documentation/static checks;
  no secret value was accessed or recorded. Existing unrelated `as string`
  matches remain outside the correction changes; no new escape was added.
- G12b Deno check/bundle was not run because `deno` is unavailable in the
  current shell. Supabase CLI was also unavailable. No migration/reset,
  deployment, hosted request, OpenAI/RPC request, transaction, signer
  construction, commit, or push was run.
- Correction implementation status: local correction complete; independent
  EVL, migration/schema approval, post-correction G13 redeploy approval, and
  fresh H1-H3 approval remain pending. Local fake/injected persistence and
  static checks do not claim remote schema or hosted parity.

**Local implementation status: COMPLETE — LOCAL GREEN ONLY; EVL REQUIRED**

## EVL Remediation Delta (2026-09-13)

**Mode:** PLAN-SUPPLEMENT only  
**Status:** READY FOR PVL; NOT READY FOR EXECUTE OR ANY LIVE LANE  
**Reason:** Independent EVL found three residual authorization/scope/dispatch gaps after the local G24-G30 result. This delta is additive. Lines 1-520 above are immutable historical plan/status content and must remain byte-identical.

### EVL Findings and Smallest Safe Disposition

1. **G31 — gateway authentication composition:** `createGatewayCompositionRoot` can currently return a handler with provider and `IntentStore` available when `SESSION_HMAC_SECRET` is absent, and it can authenticate only the token signature when no wallet-bound persisted session is available. A protected request must never reach provider, card, or intent persistence work without both the function-only HMAC secret and a matching non-revoked, non-expired wallet-bound session record.
2. **G32 — intent read scope:** `IntentStore.getById` and `getByIdempotencyKey` accept owner/agent scope at the port boundary, but their PostgREST GET queries do not carry the corresponding owner/agent predicates. The 409 idempotency replay read is part of the same boundary and must not remain unscoped. Use the existing `cards` ownership relation and `agent_id` data; do not add a column or migration. If the existing relation cannot express the complete scope, fail closed rather than issue an unscoped read.
3. **G33 — bare-path dispatch:** `normalizeFunctionPath` intentionally accepts arbitrary bare candidates so handlers can own exact route dispatch. Handlers must prove that additional own-slug-shaped bare candidates remain `404 INPUT_INVALID` and perform no protected work. Do not broaden the normalizer, add generic prefix stripping, or invent routes. Exact existing bare and `/functions/v1/<own-slug>/...` hosted routes must remain unchanged.

Prior G24-G30 evidence remains **historical**. It is not promoted to remediation success and must be rerun after these corrections. The local implementation-status claims at lines 479-520 above are preserved as historical status and do not close G31-G33.

### Exact Touchpoints and Tests

The later approved EXECUTE is closed to these source/test touchpoints:

| Finding | Future implementation touchpoint | Exact RED-first test | Required test focus |
|---|---|---|---|
| G31 | `supabase/functions/ai-gateway/index.ts` | `supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts` | Production-root dependency/auth closure, missing-secret and missing-wallet-session rejection, zero protected side effects, and valid wallet-bound session path. |
| G32 | `supabase/functions/_shared/intent-store.ts` | `supabase/functions/_shared/test/intent-store.vitest.test.ts` | Owner/agent predicates on `getById`, `getByIdempotencyKey`, and the 409 replay lookup; no unscoped intent read. |
| G33 | No normalizer change; handler dispatch is audited in `supabase/functions/session/index.ts`, `supabase/functions/ai-gateway/index.ts`, and `supabase/functions/agent-executor/index.ts` only if an exact-equality correction is proven necessary | `supabase/functions/_shared/test/prefix-routing.vitest.test.ts` | Exact route matrix remains reachable; extra own-slug-shaped bare paths return `404 INPUT_INVALID` before auth/provider/store/RPC/session work. |

No other implementation file, migration, schema, API code, route, serializer, provider, signer, or transaction touchpoint is authorized by this delta. The existing `supabase/functions/_shared/path-prefix.ts` is a read-only boundary for this remediation and must not be broadened or rewritten.

### G31 — Gateway Auth Closure Contract

Before changing `supabase/functions/ai-gateway/index.ts`, add the assertions to the exact existing gateway correction test and run:

```bash
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
```

The RED must be genuine and targeted. Missing-file, collection/compile, infrastructure, all-pass, and all-fail output is invalid RED and is a hard stop. Do not run this command during PLAN-SUPPLEMENT or PVL.

The correction contract is:

- `createGatewayCompositionRoot` must fail closed before returning a protected-capable composition when `SESSION_HMAC_SECRET` is absent, blank, or otherwise unusable. A locally injected provider/card/catalog/store cannot bypass this production auth boundary.
- A protected gateway request must require both the function-only `SESSION_HMAC_SECRET` and the existing wallet-bound session persistence lookup. A signed token without a matching stored session, or a stored session for another wallet, is rejected before provider, `CardStore`, or `IntentStore` work.
- The valid test path uses a fake, in-memory-only `SessionPersistence` with a matching hashed token/wallet record. It must not print or persist a secret value. The test must prove provider calls, card reads, and intent writes are zero on missing-secret, missing-session, expired/revoked-session, and wrong-wallet paths.
- The exact existing protected route and health behavior remain distinct: health stays public and side-effect-free; only the existing gateway intent route is protected. No API code, status contract, health key, provider behavior, or persistence ordering may change.
- `SESSION_HMAC_SECRET` remains a name-only server boundary. No secret value may occur in source, fixtures, logs, output, or evidence.

**G31 local close condition:** the focused command passes after a genuine RED-to-GREEN correction, with explicit assertions that no provider/card/intent work occurs before both secret and wallet-bound session checks. This is local fake evidence only and does not prove hosted JWT, remote session schema, or hosted parity.

### G32 — Intent Read Scope Contract

Before changing `supabase/functions/_shared/intent-store.ts`, add the query-capture and mismatch assertions to the exact existing intent-store test and run:

```bash
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
```

The RED must identify the absent query predicates. Missing-file, collection/compile, infrastructure, all-pass, and all-fail output is invalid RED and is a hard stop. Do not run this command during PLAN-SUPPLEMENT or PVL.

The correction contract is:

- `getById` must emit an exact scoped PostgREST GET containing the intent identifier, the authoritative `agent_id` predicate, and the owner predicate through the existing card ownership relation (`cards.owner_address` or the valid equivalent relation filter). The response must be treated as absent/denied when the requested scope does not match.
- `getByIdempotencyKey` must emit the same complete owner/agent scope in addition to its idempotency-key predicate. If the port requires an explicit `agentId` to make that scope complete, add it at the shared type/caller boundary and pass the authoritative value; do not infer authority from client input.
- The 409 replay lookup inside `insertIntent` must use the same owner/agent-scoped query. It is not an exception merely because it is an internal replay path.
- Tests must capture each emitted URL, assert all required predicates, and return rows that would be visible only if the adapter incorrectly trusted an unscoped result. A mismatched owner or agent must not return an intent or authorize a read.
- Preserve the existing card relation, server-only PostgREST adapter, row validation, canonical hash behavior, idempotency conflict semantics, closed error vocabulary, and no-secret boundary. Do not add `owner_address` to `intents`, alter migrations, use an RPC, or change API codes.

**G32 local close condition:** the focused command passes with `getById`, `getByIdempotencyKey`, and 409 replay reads all carrying complete owner/agent scope, duplicate-row fail-closed behavior intact, and no unscoped GET accepted by the test. This is adapter/query evidence only and does not prove remote RLS or schema parity.

### G33 — Exact Handler Route Matrix Contract

Add the remediation cases to the existing route matrix test and run:

```bash
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

The RED must be a targeted route-dispatch or protected-side-effect failure. Missing-file, collection/compile, infrastructure, all-pass, and all-fail output is invalid RED and is a hard stop. Do not run this command during PLAN-SUPPLEMENT or PVL.

The route test must bind to the exact matrix rather than assert a generalized normalizer rule:

- Preserve the existing positive bare routes: session `/v1/session/challenge`, `/v1/session/verify`, `/v1/session/revoke`; gateway `/health` and `/v1/agent/intents`; executor `/v1/payments/preflight` and `/v1/payments/execute`, with their existing methods and valid local test dependencies.
- Preserve the existing positive hosted routes: `/functions/v1/session/v1/session/...`, `/functions/v1/ai-gateway/health`, `/functions/v1/ai-gateway/v1/agent/intents`, and `/functions/v1/agent-executor/v1/payments/...`. Existing slug-preserved positives and existing wrong-slug/duplicate/encoded/traversal negatives remain regression cases.
- Add explicit own-slug-shaped bare negatives, at minimum one protected candidate per handler: `/session/v1/session/challenge/extra`, `/ai-gateway/v1/agent/intents/extra`, and `/agent-executor/v1/payments/preflight/extra`. Each must return `404` with `code: INPUT_INVALID` and preserve its request ID.
- Instrument fake provider, `CardStore`, `IntentStore`, read-only transport, and session persistence. Every extra own-slug-shaped bare negative must prove zero protected work, including zero auth persistence lookup where dispatch is rejected before auth. Do not make the test pass by changing the normalizer to reject arbitrary bare paths.
- Exact valid bare/hosted route success and exact route error behavior remain unchanged. No wildcard suffix, arbitrary slug stripping, generic route fallback, new endpoint, or new API code is permitted.

**G33 local close condition:** the focused command passes with the complete existing positive/negative route matrix plus the new side-effect-free own-slug-shaped bare negatives. The test remains handler-level evidence and makes no hosted routing claim.

### G31-G33 Aggregate Local Gates

All three gates are future, local-only gates. The exact execution order after separate EXECUTE approval is:

```bash
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

Each command must have a recorded genuine targeted RED before its owning source correction and a recorded GREEN after the minimum correction. A prior local GREEN, a planned command, or an all-pass RED substitute is not evidence. If any gate is blocked by unavailable tooling, missing source, ambiguous scope, or a failure outside the named boundary, stop and classify it rather than weakening the contract.

After G31-G33 GREEN, rerun the complete applicable G24-G30 focused/regression set from the earlier contract, including:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

The earlier G24-G30 result must be reclassified only from these post-remediation reruns and independent EVL. G24-G30 remains historical until then; no historical result is reused, rewritten, or silently extended to cover G31-G33.

### Preservation, No-Live Boundary, and Hard Stops

This delta authorizes plan text only. During PLAN-SUPPLEMENT and PVL:

- Do not edit implementation, create or edit migrations, run tests, run typecheck/lint/AICD/secret scans, access secrets, make OpenAI/RPC/hosted calls, deploy, run Supabase, reset or migrate a database, construct a signer, send a transaction, commit, push, or rewrite history.
- Do not modify lines 1-520 above, the original Phase 04 plan/report, G13 history, G14-G23 evidence, H1-H3 appendices, or any prior evidence artifact. This delta is append-only.
- Keep migrations, deployment, OpenAI/RPC/hosted calls, signer, transactions, new API codes, serializer changes, payment/controller authority, and history rewrites out of scope for the later implementation as well.
- Do not broaden `normalizeFunctionPath` or invent routes. A route test failure is fixed only with the smallest exact handler dispatch correction, if one is proven necessary.
- Any auth bypass, unscoped intent read, protected side effect on a rejected route, altered exact route matrix, false RED, secret-shaped output, new API code, migration/deployment/live action, or historical rewrite is a hard stop.

### New PVL Handoff

Selected artifact remains:

`process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`

The next valid action is a new PVL against this exact append-only artifact. PVL must bind G31-G33, verify the exact files and commands, confirm that G24-G30 evidence is historical and requires rerun after remediation, and confirm the no-live/no-migration/no-secret/no-history-rewrite boundaries. PVL must not run the three RED-first commands or any implementation/regression command.

Only after PVL review and explicit local EXECUTE approval may the later actor add the three targeted test assertions, capture genuine RED, implement the minimum correction, rerun G31-G33, rerun G24-G30, and request independent EVL. No G13, migration, hosted, OpenAI, RPC, signer, transaction, or H1-H3 lane is authorized by this delta.

**New gate state:** G31-G33 NOT RUN; prior G24-G30 evidence HISTORICAL / RERUN REQUIRED.  
**Next valid state:** PVL of this additive remediation delta; no implementation or live action.

## 10. Validate Contract - G31-G33 Remediation Delta (2026-09-13)

**Mode:** AUTOPILOT | VALIDATE (PVL only)
**Status:** BLOCKED
**Scope:** Read-only validation of the G31-G33 delta against the current
worktree source and test artifacts. No implementation test, migration, reset,
deployment, hosted request, OpenAI/RPC call, signer operation, transaction,
secret-value access, commit, or push was performed in this validation.

### V1 - Context, preservation, and allowed checks

- Read and routed from `process/context/all-context.md` through
  `process/context/tests/all-tests.md`, `process/context/tests/backend-tests.md`,
  `process/context/planning/all-planning.md`, the Phase 04 primary plan and
  report, the persistence supplement, the prefix-routing supplement, and this
  correction supplement.
- Current source/test files inspected were:
  `supabase/functions/ai-gateway/index.ts`,
  `supabase/functions/_shared/intent-store.ts`,
  `supabase/functions/_shared/path-prefix.ts`,
  `supabase/functions/session/index.ts`,
  `supabase/functions/agent-executor/index.ts`,
  `supabase/functions/_shared/persistence-composition.ts`,
  `supabase/functions/_shared/persistence-ports.ts`,
  `supabase/functions/_shared/card-store.ts`,
  `supabase/functions/_shared/session-challenge-store.ts`,
  `supabase/config.toml`, and the named correction, route, deploy-compatibility,
  schema-static, session, and executor tests.
- The pre-append supplement was 663 lines and 58,621 bytes with prefix SHA-256
  `a4493c211f088d562c1c7776ac12aeaaaed8e74cf5f14a0acb9cdb80f8490d23`.
  Lines 1-663 above are preserved byte-for-byte by this append.
- Allowed checks run in this PVL:
  `node .claude/skills/vc-context-discovery/scripts/discover-context.mjs --feature pact --json`
  (PASS, no discovery failures), `node scripts/check-no-secrets.mjs`
  (PASS, 1001 scanned / 0 findings), `git diff --check` (PASS), and static
  `rg` source/test searches. No implementation test command was run.

### V2 - Current source findings

| Finding | Severity | Current evidence and disposition |
|---|---|---|
| G31 gateway auth closure | FAIL | `supabase/functions/ai-gateway/index.ts:279-345` permits local injected provider/card/catalog/store composition without requiring `SESSION_HMAC_SECRET` or persisted session wiring. The request gate at `:184-217` authenticates only when `sessionSecret` is defined and checks `findSession` only when `sessionPersistence` is defined; `:228-240` can then read the card and `:248-252` can invoke provider/store work. `:317-323` does not reject the missing-secret or missing-session cases. |
| G32 intent read scope | FAIL | `supabase/functions/_shared/intent-store.ts:228-237` (409 replay), `:264-275` (`getById`), and `:291-298` (`getByIdempotencyKey`) emit intent GETs with only `intent_id` or `idempotency_key`; none carries `agent_id` and the existing card ownership relation predicate. The port inputs at `:38-47` also leave the idempotency lookup without an explicit agent scope. |
| G33 exact dispatch safety | CONCERN / NOT PROVEN | `supabase/functions/_shared/path-prefix.ts:17-58` is an existing own-slug normalizer and must not be broadened. The three handlers normalize before route dispatch at `session/index.ts:260-301`, `ai-gateway/index.ts:143-170`, and `agent-executor/index.ts:233-251`. Gateway/executor exact checks reject the named extra paths before protected work; session uses a broad prefix check at `:268`, parses the body at `:271-274`, and returns 404 later at `:301`. The required explicit extra-path tests and side-effect counters are absent from `prefix-routing.vitest.test.ts:134-350` and `:352-538`. |

The current `supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts:38-63`
uses `SESSION_HMAC_SECRET` but supplies no `sessionPersistence`; its accepted
token path therefore does not prove a matching non-revoked, non-expired stored
session. It also does not prove card-read ordering. The current
`supabase/functions/_shared/test/intent-store.vitest.test.ts:149-170` checks only
the identifier predicate and duplicate-row behavior; it does not assert owner
and agent predicates for all three GET paths or mismatched-scope denial.

### V3 - Gate classification and net result

| Gate | Classification | Required close condition |
|---|---|---|
| G31 | BLOCKED | `createGatewayCompositionRoot` rejects a missing/blank/unusable function-only secret even with injected dependencies; a protected request requires both token verification and `findSession` with the token hash and recovered wallet; provider, CardStore, and IntentStore counters stay at zero for missing-secret, missing-session, expired/revoked, and wrong-wallet cases. The valid path uses a matching in-memory-only session record. |
| G32 | BLOCKED | `getById`, `getByIdempotencyKey`, and the `insertIntent` 409 replay read each emit an intent identifier/key predicate, `agent_id=eq.<authoritative-agent>`, and a valid inner/equivalent `cards.owner_address=eq.<authenticated-owner>` relation predicate. Query-capture tests must deny mismatched owner or agent rows. No migration or `intents.owner_address` column is allowed. |
| G33 | CONDITIONAL / NOT PROVEN | The exact seven-row matrix below remains the only positive route set. Add the three own-slug-shaped bare negatives with request-ID, 404 `INPUT_INVALID`, and zero auth/provider/card/store/transport/session-persistence work assertions. Keep `path-prefix.ts` unchanged unless a handler exact-equality correction is proven necessary. |

**Net Gate: BLOCKED** - two source-level FAILs remain (G31 and G32), with one
additional unproven test-coverage concern (G33). The prior G24-G30 local result
at lines 479-520 is historical and is not promoted to remediation evidence.
The implementation-status text, G23 records, G13 histories, and H1-H3
appendices remain unchanged.

### V4 - Exact route matrix and G33 test binding

The route subject is the same production composition handler in each entrypoint,
not a detached normalizer helper:

| Function | Method | Bare route | Hosted route |
|---|---|---|---|
| `session` | POST | `/v1/session/challenge` | `/functions/v1/session/v1/session/challenge` |
| `session` | POST | `/v1/session/verify` | `/functions/v1/session/v1/session/verify` |
| `session` | POST | `/v1/session/revoke` | `/functions/v1/session/v1/session/revoke` |
| `ai-gateway` | GET | `/health` | `/functions/v1/ai-gateway/health` |
| `ai-gateway` | POST | `/v1/agent/intents` | `/functions/v1/ai-gateway/v1/agent/intents` |
| `agent-executor` | POST | `/v1/payments/preflight` | `/functions/v1/agent-executor/v1/payments/preflight` |
| `agent-executor` | POST | `/v1/payments/execute` | `/functions/v1/agent-executor/v1/payments/execute` |

The exact route source is `path-prefix.ts:17-58`, session dispatch at
`session/index.ts:263-301`, gateway dispatch at `ai-gateway/index.ts:147-170`,
and executor dispatch at `agent-executor/index.ts:237-315`. `GET /health` is
gateway-only. Wrong methods, wrong slugs, duplicate prefixes, encoded or
traversal forms, unknown paths, bare `/functions/v1/<slug>` with no remainder,
and `/health` on session/executor remain 404 `INPUT_INVALID`.

The G33-focused command is:

```bash
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

Before that command can close G33, the test must add and instrument these exact
bare candidates:

- `POST /session/v1/session/challenge/extra`
- `POST /ai-gateway/v1/agent/intents/extra`
- `POST /agent-executor/v1/payments/preflight/extra`

Each must return 404 with `code: INPUT_INVALID` and its request ID, while fake
session persistence, provider, CardStore, IntentStore, and read-only transport
counters all remain zero. The existing positives in
`prefix-routing.vitest.test.ts:135-205` and existing negatives in
`:207-350` and `:406-538` remain required. Once G31 is corrected, the hosted
gateway positive must use a valid bearer token plus matching fake session row;
it must not regain the current unauthenticated fixture behavior at
`prefix-routing.vitest.test.ts:74-87`.

### V5 - G31/G32 exact close assertions

G31 must use the existing gateway correction test path and command above in
`gateway-composition-correction.vitest.test.ts:35-73`. Its assertions must
cover, in order:

1. Missing `SESSION_HMAC_SECRET` returns a closed unavailable response from the
   production root, even when provider/card/catalog/store are injected.
2. A configured secret with no persisted session, an expired/revoked session,
   and a wallet mismatch each stop before provider, CardStore, or IntentStore
   work.
3. The valid path uses an in-memory-only `SessionPersistence` record whose
   stored token hash and wallet match the verified token; no secret value is
   printed, persisted, or asserted as output.
4. Auth and persistence failures remain the existing closed error surface; no
   API code, health key, provider behavior, or route is added.

G32 must use `intent-store.vitest.test.ts:59-206` and capture every PostgREST
request. `getById`, `getByIdempotencyKey`, and the 409 replay lookup must assert
the owner relation and authoritative `agent_id` predicates. If the current
`IntentIdempotencyGetInput` cannot carry complete server scope, the shared port
at `intent-store.ts:44-47` must gain an explicit authoritative `agentId` and
all callers must pass it; client input cannot supply or infer authority. The
existing card relation at `card-store.ts:165-192` and the `cards` table relation
are the only ownership basis. No unscoped result may be returned or used for
authorization.

### V6 - Required reruns and evidence boundary

The following are future EXECUTE/EVL commands. They were not run in this PVL;
no RED or GREEN output is claimed. Genuine targeted RED must precede each
source correction, and an all-pass, all-fail, missing-file, compile, or
infrastructure failure is invalid RED.

First rerun G31-G33:

```bash
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
```

Then rerun G24-G30 and the regression gates:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

The applicable local Deno checks remain non-hosted and non-live evidence only:

```bash
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
```

Current-shell discovery returned no executable path for `deno` or `supabase`.
The earlier Deno 2.9.6 and Supabase CLI 2.117.0 records in the Phase 04
report/context are historical and are not rerun evidence here. No Deno result,
hosted route result, or remote schema result is claimed.

### V7 - Known gaps, approvals, and handoff

- Hosted gaps remain: local fake/static checks cannot prove Supabase platform
  JWT behavior, deployed composition, hosted prefix routing, remote session or
  intent schema, regional RPC, or live `gpt-5.6-luna` access. The Phase 04
  report still classifies the latest H1 as BLOCKED, H2 as BLOCKED, and H3 as
  PARTIAL at `phase-04-ai-gateway-executor_REPORT_08-09-26.md:789-845`.
- Schema gap remains: `supabase/migrations/202609120001_persistence_contracts.sql`
  exists and is static-only; its additive checks are source-visible at
  `:1-222`, while `supabase/test/schema-static.test.ts:17-151` is only a static
  future/local gate. The migration has not been applied and remote schema
  parity is UNKNOWN/HYBRID-ONLY. No reset, migration, or schema application is
  authorized by this contract.
- Separate migration approval: a new explicit approval is required before
  applying `202609120001_persistence_contracts.sql`, running any remote schema
  parity lane, or resetting a database. This validation grants none.
- Separate G13 approval: only after G31-G33 and the complete G24-G30 rerun plus
  independent EVL are green may a staging-only three-function redeploy be
  separately approved. Historical G13 results remain historical and cannot be
  reused.
- Separate H1-H3 approval: only after the migration/schema prerequisite has a
  separately approved result, post-correction G13 succeeds under its own
  approval, and local correction plus EVL are green may fresh H1-H3 approval be
  considered. Prior H1/H2/H3 failures and partial health evidence are never
  promoted to success.

**Accepted by:** AUTOPILOT VALIDATE for artifact validation only; standing
execute consent does not override this BLOCKED gate or authorize implementation,
migration, deployment, hosted work, or live calls.

**Handoff:** Keep this supplement active at `Status: BLOCKED`. Return to the
approved correction execution lane only after G31 and G32 source/test failures
are fixed and the three explicit G33 side-effect cases are added. Capture
genuine RED, implement the minimum correction, rerun G31-G33, rerun G24-G30
and the regression gates, then request independent EVL. Do not advance to
G13, migration/schema parity, or H1-H3 from this contract.

**Gate: BLOCKED**
**Selected artifact:** `process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`
**Changed path:** this supplement only; no source, test, migration, report, or historical artifact was changed.

## Additive PVL Disposition

The effective PVL disposition is **CONDITIONAL**, not blocked. The `BLOCKED`
labels above are retained verbatim as historical evidence and as boundaries on
hosted, migration, deployment, and live-call work; they do not mean that the
local correction plan lacks an executable RED-first path.

G31 and G32 bind the current source failures to exact RED-first tests, minimum
corrections, and post-fix green assertions. G33 binds the required bare-path
side-effect cases, route matrix, and rerun gate. Execution remains unclosed
until those genuine RED inputs, minimum fixes, G31-G33 and G24-G30 reruns,
regression gates, and independent EVL are complete and green.

**Effective gate:** CONDITIONAL
**Disposition:** Accepted by AUTOPILOT VALIDATE for artifact validation and
handoff to the separately approved correction execution lane only; no
implementation, migration, deployment, hosted work, or live call was run.

## Local G31-G33 Execution Status (2026-09-13)

**Mode:** AUTOPILOT | EXECUTE
**Scope:** G31-G33 only, local and reversible. The preceding 909 lines remain
historical and unchanged. No main Phase 04 report append was made.

### RED-first evidence

- G31 exact command (`gateway-composition-correction.vitest.test.ts`): `2`
  tests, `1` failure, `1` pass. The failure was targeted: injected gateway
  dependencies reached protected work when `SESSION_HMAC_SECRET` was missing.
- G32 exact command (`intent-store.vitest.test.ts`): `6` tests, `2` failures,
  `4` passes. The failures were targeted query-scope assertions showing that
  intent reads and replay reads lacked the required owner/agent predicates.
- G33 exact command (`prefix-routing.vitest.test.ts`): final RED was `13`
  tests, `1` failure, `12` passes after adding the malformed-body own-slug
  candidate. The failure was targeted: the pre-correction session dispatcher
  parsed an extra bare route before rejecting it. An earlier valid-body-only
  run was `13/13` and is explicitly not counted as RED evidence.

### GREEN and regression evidence

- G31 GREEN: `2/2` tests.
- G32 GREEN: `6/6` tests.
- G33 GREEN: `13/13` tests, including exact bare/hosted positives, existing
  negatives, and the three side-effect-free own-slug-shaped bare candidates.
- Post-remediation G24-G30 focused set: `48/48` tests across runtime,
  auth/health, session composition, gateway composition, executor read-only,
  composition roots, intent scope, prefix routing, provider config, and deploy
  compatibility.
- Full relevant Vitest command: `35/35` files and `198/198` tests.
- Typecheck GREEN; lint GREEN; AICD GREEN (`0` failures).
- Secret scanner GREEN (`1001` scanned, `0` findings); the exact name-only
  secret/SDK search found only approved names and existing documentation/static
  checks. No secret value was accessed or recorded.
- `git diff --check` GREEN.

### Corrections and boundaries

- Gateway production composition now requires a nonblank function-only
  `SESSION_HMAC_SECRET` and a matching non-revoked, non-expired wallet-bound
  persisted session before provider, card, or intent work. Health remains public
  with the existing exact seven-key shape; no API code was added.
- Intent `getById`, `getByIdempotencyKey`, and the 409 replay lookup now carry
  the server-bound agent predicate and `cards.owner_address` relation filter,
  with defensive mismatch denial and the existing closed persistence errors.
- Session handler dispatch now exact-matches the three existing routes before
  parsing; `normalizeFunctionPath` was not changed and no route was added.
- Deno and Supabase CLI were unavailable in the current shell, so no Deno
  checks or hosted/Supabase commands were run. Migration/reset, deployment,
  G13, H1-H3, OpenAI/RPC/hosted requests, transactions, signer construction,
  commit, and push were not run.

**G31-G33 local status: GREEN ONLY.** Independent EVL, remote schema parity,
post-correction G13, migration approval, and fresh H1-H3 approval remain
pending. Historical G24-G30 results and all prior evidence remain preserved.

## Additive EVL Clarification - G32 (2026-09-13)

**Mode:** AUTOPILOT | EVL  
**Status:** GREEN (local source/test evidence only)

The residual G32 concern is reclassified GREEN under the binding persistence
contract. `IntentStore.getById` requires `ownerAddress` and makes `agentId`
conditional; omitting the `agent_id` predicate when that optional value is
absent is allowed. The owner predicate remains mandatory, and the agent
predicate is emitted whenever `agentId` is supplied.

Exact evidence: the port contract is recorded at the persistence supplement
`..._PLAN_12-09-26.md:705`; `intent-store.ts:38-42` defines the optional input,
`:119-123` emits the conditional agent predicate plus unconditional
`cards.owner_address` relation filter, and `:292-315` uses that scoped query
with defensive owner/agent mismatch denial. The focused test at
`intent-store.vitest.test.ts:161-220` covers the supplied-agent query, the
omitted-agent path with duplicate-row fail-closed behavior, and mismatched
owner/agent denial; the recorded focused result is `6/6` at lines 922 and
935 above. The 409 replay at `intent-store.ts:254-281` remains scoped with
the authoritative intent agent. This clarification is additive and does not
rewrite historical evidence. No implementation, test, external service, or
live lane was accessed or changed in this EVL inspection.

## Independent Correction EVL and G22 Disposition (2026-09-13)

This is an additive process record. Lines 1-990 above, the primary Phase 04
report, and all prior evidence remain immutable. This record does not authorize
implementation, migration, reset, deployment, hosted work, OpenAI/RPC calls,
signer operations, transactions, secret-value access, commit, or push.

### Local EVL Result

- G31: **2/2 GREEN** with the mandatory owner/session predicate and zero
  protected work on rejected paths.
- G32: **6/6 GREEN** with the mandatory owner predicate and conditional agent
  predicate when an authoritative agent value is supplied.
- G33: **13/13 GREEN**.
- Post-correction G24-G30 rerun: **48/48 GREEN**.
- Prefix routing: **12/12 GREEN**; deploy compatibility: **8/8 GREEN**.
- Full relevant Vitest regression: **35 files / 198 tests GREEN**.
- Typecheck, lint, AICD, and `git diff --check`: **GREEN**.
- Secret scan: **1001 scanned / 0 findings**; diagnostic tokens: **zero**.
- API codes remain exactly **15**; no `openai` package/import exists; the
  read-only executor path contains no signer, broadcast, gas, send, or
  payment-send operation.
- Deno local checks were unavailable and are not claimed.

### G22 Result and Boundary

- The exact linked diff command was rerun successfully against the approved
  staging project/ref `myotkovmgzdabuirkqlx`:
  `npx --yes supabase db diff --linked --schema public --project-ref myotkovmgzdabuirkqlx`.
- The shadow database built and applied local migrations `202609080001` and
  `202609120001`. Output was non-empty and included
  `alter table public.payment_attempts enable row level security;` plus a
  `public.rls_auto_enable()` event-trigger definition.
- G22 is therefore **UNKNOWN / DRIFT**, not GREEN. No schema, migration, reset,
  or push was performed. If the difference is a true contract mismatch, it
  requires a later plan and separate approval.

### Current State and Next Approval

- Existing G13 versions `v8`/`v9` and H1-H3 results predate this correction and
  are not reused. The latest correction is not deployed.
- Phase 04 remains **NOT VERIFIED / NOT CLOSED**.
- The next exact action is separate approval for a corrected G13 staging
  redeploy, then hosted smoke/health. Fresh H1-H3 approval is considered only
  after that result. G22 remains a hard stop for schema claims.

**Independent correction EVL classification:** local GREEN only; G22
UNKNOWN/DRIFT; latest correction undeployed; Phase 04 NOT VERIFIED / NOT CLOSED.

### G22 Migration-List Clarification (Additive)

The approved staging migration list showed both `202609080001` and
`202609120001` as applied. This records observed migration state only; the
continuation above performed no migration, reset, schema change, or push.

## Region Remediation Delta - G34 (2026-09-13)

**Mode:** AUTOPILOT | PLAN-SUPPLEMENT only  
**Status:** NOT RUN; NOT READY FOR EXECUTE, STAGING CONFIGURATION, G13, OR H1-H3  
**Scope:** This additive delta corrects expected-versus-observed region binding in
the existing Phase 04 runtime composition. It does not implement code, run tests,
set configuration, access secrets, migrate, deploy, call a provider/RPC/hosted
endpoint, construct a signer, transact, commit, or push. All lines before this
section remain byte-identical, including G22 UNKNOWN/DRIFT, prior G13 and H1-H3
history, and all earlier local/EVL classifications.

### Approved Region Decision

The staging project `myotkovmgzdabuirkqlx` may later receive exactly one
non-secret expected-region setting:

```text
PACT_EXPECTED_REGION=ap-southeast-1
```

This setting name is bound because custom `SUPABASE_` environment names are
reserved by Supabase. `PACT_EXPECTED_REGION` is the operator-configured expected
region. `SB_REGION` remains platform/runtime-observed only and must never be
overridden, synthesized, or used as the expected value. The only local
compatibility is an explicitly supplied `SUPABASE_FUNCTION_REGION` value in a
local/test composition input; it is not a deployed fallback and must not be
included as the production Deno binding.

Production composition must require `PACT_EXPECTED_REGION`, or an explicitly
injected expected-region value in a non-deployed composition input. It must not
default to `us-east-1` when deployed. A missing expected value, missing observed
`SB_REGION`, or non-exact mismatch must fail closed before provider, persistence,
CardStore/IntentStore, or RPC work. No region fallback, alias, or inferred
observed value is permitted.

The approved equal case is exactly:

```text
expected: PACT_EXPECTED_REGION=ap-southeast-1
observed: SB_REGION=ap-southeast-1
```

No production or fallback region is approved. The setting is not to be created
or changed during this PLAN-SUPPLEMENT or PVL.

### Exact Current Source Targets

The later correction is limited to the following current source regions and
their existing composition/health contracts:

| File | Current target lines | Required disposition |
|---|---:|---|
| `supabase/functions/session/index.ts` | `311-329`, `350-377`, `400-411` | Remove deployed `us-east-1` expectation fallback; bind expected region from `PACT_EXPECTED_REGION` (or explicit local/test expected input), require observed `SB_REGION`, keep the Option A production persistence selection, and pass the observed/expected truth without synthesizing either value. |
| `supabase/functions/ai-gateway/index.ts` | `111-133`, `136-190`, `274-378`, `529-543` | Keep public health reachable and side-effect-free; map health `configuredRegion` to the observed `SB_REGION` or non-secret `unknown` marker and `expectedRegion` to the explicit expected setting/unknown marker; remove deployed `us-east-1` fallback and fail protected gateway work before auth/provider/card/store work when either region value is absent or mismatched. |
| `supabase/functions/agent-executor/index.ts` | `223-315`, `392-449`, `465-480` | Remove deployed `us-east-1` expectation fallback and local observed-region synthesis; require exact expected/observed region equality before session, persistence, intent/card, or read-only RPC work, while preserving the static-only read path and no-signer boundary. |
| `supabase/functions/_shared/health.ts` | `5-31` | Preserve the exact seven-key response. `configuredRegion` is the non-secret observed runtime region (`SB_REGION`, or `unknown` when absent); `expectedRegion` is the non-secret configured expectation (`PACT_EXPECTED_REGION`, explicit local expected input, or `unknown` when absent). Do not add an `SB_REGION` key or expose environment values beyond these existing fields. |

The existing `handleHealthRequest` target at
`supabase/functions/ai-gateway/index.ts:111-133` may return health while the
region is missing or mismatched. Health must show the observed/expected truth
without secret values; protected routes must fail closed. The existing exact
keys remain `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`.

### G34 RED-First Contract

During a later separately approved local EXECUTE, extend the existing focused
composition test before changing the roots:

```text
supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts:17-84
```

Run this exact command after the test assertions are added and before the
correction:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
```

The RED must be genuine and targeted. Missing-file, collection/compile,
infrastructure, all-pass, and all-fail output is invalid RED and is a hard stop.
This command is not run during PLAN-SUPPLEMENT or PVL.

The focused test must exercise the same `startSessionServer`,
`startGatewayServer`, and `startExecutorServer` composition paths used by
`Deno.serve`, with fake provider/store/card/session/RPC dependencies and explicit
counters. It must contain these exact cases:

1. **Missing expected:** omit `PACT_EXPECTED_REGION` and provide observed
   `SB_REGION=ap-southeast-1`; local compatibility may be tested separately with
   an explicitly supplied `SUPABASE_FUNCTION_REGION`, but the deployed-shaped
   root must not silently use it. Protected work fails closed and provider,
   persistence/store, CardStore/IntentStore, and RPC counters remain zero.
2. **Missing observed:** provide
   `PACT_EXPECTED_REGION=ap-southeast-1` and omit `SB_REGION`. Protected work
   fails closed; no observed value is synthesized from expected, compatibility,
   card injection, or any other input; provider, persistence/store,
   CardStore/IntentStore, and RPC counters remain zero.
3. **Mismatch:** provide expected `ap-southeast-1` and observed `us-east-1`.
   Protected work fails closed with the existing region/config failure surface
   before provider, persistence/store, CardStore/IntentStore, or RPC work; all
   such counters remain zero.
4. **Equal observed staging region:** provide both exact values as
   `ap-southeast-1`. The composition is not rejected for region mismatch, and
   the public health response reports `configuredRegion=ap-southeast-1` and
   `expectedRegion=ap-southeast-1` with the unchanged seven keys. Any protected
   side effects in this case must occur only after the existing auth and
   dependency gates; the failure-case zero-side-effect assertions above remain
   mandatory.
5. **No fallback/static binding:** inspect the three Deno environment maps and
   composition roots to prove `PACT_EXPECTED_REGION` is the deployed expected
   binding, `SB_REGION` is observed-only, `SUPABASE_FUNCTION_REGION` is local
   compatibility only when explicitly supplied, and no deployed path defaults
   to `us-east-1`.

The test must also retain the existing `SB_REGION`-versus-expected mismatch
case and all previous G24-G30/G31-G33 assertions. No external provider, RPC,
Supabase, migration, or hosted request is allowed in G34.

### G34 Gate and Local Regressions

**G34 - Region binding and fail-closed composition:** the focused RED-to-GREEN
test proves missing expected, missing observed, mismatch, exact equal
`ap-southeast-1`, health truth, no deployed `us-east-1` fallback, and zero
provider/persistence/store/CardStore/IntentStore/RPC side effects on every
rejected protected path. G34 is **NOT RUN**. It cannot promote prior G24-G30 or
G31-G33 results; those must be rerun after the correction and independently
classified by EVL.

After G34 GREEN, rerun the existing local correction and regression gates:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Applicable Deno checks remain local/non-hosted only. No missing Deno/Supabase
tooling result may be represented as G34 evidence. No secret value may be
accessed or recorded.

### Later Approval Boundary and State Disposition

Only after G34 and the complete local correction/regression set are GREEN and
independent EVL is complete may a separate approval be requested to set the
single non-secret staging configuration on project
`myotkovmgzdabuirkqlx`:

```text
PACT_EXPECTED_REGION=ap-southeast-1
```

That later configuration action must not set, override, or synthesize
`SB_REGION`. It is staging-only, has no production equivalent in this delta,
and does not authorize migration, reset, provider/RPC/hosted calls, or a
deployment. After the setting is approved and present, a further separate
approval is required for the corrected three-function staging G13 redeploy and
status verification. Prior G13 `v8`/`v9` and all earlier G13/H1-H3 records
remain historical and cannot be reused.

Fresh H1-H3 approval remains downstream of local GREEN, independent EVL, any
separately approved schema/migration prerequisite, the approved setting, and a
successful corrected G13 redeploy. Until a fresh H1 proves the equal-region
hosted lane, **model availability remains UNKNOWN**, even if local health shows
the configured/expected/observed region truth. G22 remains **UNKNOWN/DRIFT**;
this delta neither resolves nor reclassifies it.

**G34 status:** NOT RUN; region-remediation correction required.  
**Next valid state:** PVL of this additive delta, then separately approved local
EXECUTE only; no staging configuration, G13 redeploy, migration, hosted/live
call, or H1-H3 action is authorized here.

## 11. Validate Contract - G34 Region Remediation Delta (2026-09-13)

**Mode:** AUTOPILOT | VALIDATE (PVL only)  
**Status:** CONDITIONAL  
**Scope:** Read-only validation of the G34 region-remediation delta against the
current session, gateway, executor, health/config, tests, context, and Phase 04
report. This contract records an executable local RED-first boundary. It does not
claim implementation, test, deployment, staging configuration, secret setting,
migration, reset, hosted request, OpenAI/RPC call, signer operation, transaction,
commit, or push.

### V1 - Preservation, context, and allowed evidence

- The pre-append supplement was `92,340` bytes and `1,230` lines with SHA-256
  `bc45f894b9efa687980a4ec30afa87575463a54604c8c2b79640077e04d07b1f`. This
  subsection is append-only; those prior bytes, including the G22 disposition,
  prior G13 records, H1-H3 history, and earlier G24-G33 classifications, must
  remain byte-identical.
- Routed context was read from `process/context/all-context.md`,
  `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
  `process/context/tests/backend-tests.md`, and
  `process/context/tests/live-e2e.md`. The Phase 04 report was read as the
  historical runtime boundary, including its G22 record at
  `phase-04-ai-gateway-executor_REPORT_08-09-26.md:847-915`, corrected G13 record
  at `:917-982`, and latest H1-H3 bounded rerun at `:770-845`.
- Read-only checks completed before this append: context discovery PASS with no
  failures; context routing PASS; context audit PASS (`0` failures); protocol
  discovery PASS (`0` failures); Pact plan discovery PASS; secret scan PASS
  (`1,001` scanned, `0` findings); `git diff --check` PASS; and static `rg`
  source/test/config searches. No implementation test command was run.
- The plan-artifact validator reports `5` structural failures and `6` warnings
  for this supplement shape. They are bounded artifact-shape concerns inherited
  from the additive plan format, not a missing G34 contract boundary. They do
  not authorize rewriting prior bytes.

### V2 - Exact current-source findings

| Surface | Current evidence | G34 disposition |
|---|---|---|
| Session root | `supabase/functions/session/index.ts:311` defines `EXPECTED_REGION = "us-east-1"`; `:320-322` defaults the expected region; `:350-375` reads `SUPABASE_FUNCTION_REGION` as expected/configured and synthesizes local observed state; `:400-409` passes `SUPABASE_FUNCTION_REGION` into the production Deno environment map. | Expected RED. Production must use `PACT_EXPECTED_REGION` for expected and `SB_REGION` for observed, with no deployed fallback. `SUPABASE_FUNCTION_REGION` is permitted only as an explicitly supplied local/test compatibility input. |
| Gateway root | `supabase/functions/ai-gateway/index.ts:142` defaults the entrypoint expectation to `us-east-1`; `:274` repeats the constant; `:290-300` treats `SUPABASE_FUNCTION_REGION` as the expected/configured value and `:293` synthesizes observed region from local card injection; `:529-540` binds `SUPABASE_FUNCTION_REGION` in production. Protected checks are at `:178-190`; health is at `:111-133`. | Expected RED. Missing expected/observed or mismatch must fail before auth/provider/card/store work; health may remain public and must report truth without side effects. |
| Executor root | `supabase/functions/agent-executor/index.ts:245-248` compares against `EXPECTED_REGION`; `:400-406` derives expected from `SUPABASE_FUNCTION_REGION` and synthesizes observed region for local injection; `:421-435` composes the read-only/persistence path; `:465-478` retains the `us-east-1` constant and production `SUPABASE_FUNCTION_REGION` binding. | Expected RED. Require exact `PACT_EXPECTED_REGION`/`SB_REGION` equality before session, persistence, intent/card, or static RPC work while retaining `eth_chainId`/`eth_call` only and the no-signer boundary. |
| Provider/model config | `supabase/functions/ai-gateway/openai-provider.ts:62-72` still defaults provider region to `us-east-1`; `:83-92` applies the model gate. Gateway imports the canonical JSON at `ai-gateway/index.ts:43` and parses it at `:321-328`; the source is `config/ai/model-config.json:1-5`; strict loader/guards are `packages/domain/src/model-config.ts:44-52,60-89` and `packages/domain/src/schemas.ts:349-366`. | Static correction must remove any deployed region default, preserve canonical `openai`/`gpt-5.6-luna`/`allowFallback:false`, and retain unset-or-exact `OPENAI_MODEL`; no model/provider fallback is allowed. |
| Health/config | `supabase/functions/_shared/health.ts:5-31` defines the exact seven-key shape. Existing platform settings are explicit at `supabase/config.toml:2-10` with `verify_jwt = false` for all three functions. | Preserve public, side-effect-free health with exactly `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`; application auth remains the protected-route boundary. |
| Existing tests | `runtime-composition-correction.vitest.test.ts:17-84` currently exercises the old `SUPABASE_FUNCTION_REGION`/`SB_REGION` mismatch and source names, but has no `PACT_EXPECTED_REGION` missing/equal/no-fallback cases. `deploy-compat.vitest.test.ts:145-149` still asserts the old `us-east-1` pin. | The exact focused test is an executable RED-first target and must be extended before correction. The stale static assertion is a required regression-test correction, not a reason to weaken G34. |

The current source is expected to fail the new G34 assertions. This is not a
missing contract boundary: the named roots, health shape, config loader, exact
focused test, and regression commands all exist. Therefore G34 is CONDITIONAL,
not BLOCKED.

### V3 - Binding region semantics and safety contract

1. **Expected versus observed:** `PACT_EXPECTED_REGION` is the operator-configured
   expected region in deployed composition. `SB_REGION` is the
   platform/runtime-observed region. They are separate values and must not be
   aliased, synthesized, overridden, or inferred from one another.
2. **Approved staging values:** the later staging setting is exactly
   `PACT_EXPECTED_REGION=ap-southeast-1`; the equal observed case is
   `SB_REGION=ap-southeast-1`. No deployed `us-east-1` fallback, alias, or
   default is permitted anywhere in the three roots, provider construction, or
   Deno environment maps.
3. **Local compatibility only:** `SUPABASE_FUNCTION_REGION` may appear only in an
   explicitly supplied local/test composition input that declares compatibility.
   It must not be the production Deno binding, the deployed expected-region
   source, or a fallback for `PACT_EXPECTED_REGION`/`SB_REGION`. A local test
   using this name must make that compatibility mode explicit rather than infer
   it from injected card/provider/RPC dependencies.
4. **Fail-closed protected work:** missing expected, missing observed, or any
   non-exact mismatch must stop before provider, persistence, session lookup,
   CardStore/IntentStore, or RPC work. Rejected cases must retain the existing
   closed error surface and request correlation; no API code is added.
5. **Health:** public `GET /health` remains reachable without application auth,
   performs no provider, persistence, card, or RPC work, and returns exactly the
   seven existing keys. `configuredRegion` is observed `SB_REGION` or non-secret
   `unknown`; `expectedRegion` is `PACT_EXPECTED_REGION`, explicit local expected
   input, or non-secret `unknown`. No `SB_REGION` key or secret value is exposed.
6. **Model/config:** the canonical model config remains the only authority;
   `parseModelConfigJson`/the canonical loader and `assertModelConfigAllowsCall`
   must continue to enforce `provider=openai`, `model=gpt-5.6-luna`, and
   `allowFallback=false` before fetch. `OPENAI_MODEL` remains unset-or-exact.

### V4 - Exact G34 RED-first command and assertions

During a separately approved local EXECUTE, extend
`supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts`
before changing the roots. The exact command is:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
```

This command is future-only and was not run in PVL. The test must exercise the
actual `startSessionServer`, `startGatewayServer`, and `startExecutorServer`
paths used by `Deno.serve`, with fake dependencies and explicit counters. The
RED must be targeted and compile: missing-file, collection/compile,
infrastructure, all-pass, and all-fail output is invalid RED and is a hard stop.

The focused cases must prove:

- Missing expected: `SB_REGION=ap-southeast-1` with no `PACT_EXPECTED_REGION`
  rejects protected work and leaves provider, persistence/session,
  CardStore/IntentStore, and RPC counters at zero. An explicitly marked local
  `SUPABASE_FUNCTION_REGION` compatibility fixture may be tested separately.
- Missing observed: `PACT_EXPECTED_REGION=ap-southeast-1` with no `SB_REGION`
  rejects protected work and does not synthesize the observed value from the
  expected value, compatibility input, or injected dependencies.
- Mismatch: expected `ap-southeast-1`, observed `us-east-1`, rejects before all
  protected side effects with the existing region/config error surface.
- Equal case: expected and observed both `ap-southeast-1` are not rejected for
  region mismatch; public health reports both values with the unchanged seven
  keys. Any protected work remains subject to the existing auth/dependency
  gates and is not needed to prove the equal-region health assertion.
- Static binding: the three Deno maps use `PACT_EXPECTED_REGION` and `SB_REGION`,
  never production `SUPABASE_FUNCTION_REGION`, and no source path defaults to
  `us-east-1`. The provider default at
  `supabase/functions/ai-gateway/openai-provider.ts:71` is included in this
  no-fallback assertion.

### V5 - G34 gate and regression command set

**G34 classification:** `CONDITIONAL / NOT RUN`. The contract is executable,
but current source is expected RED until the region source/binding correction and
focused assertions are implemented. G34 does not promote prior G24-G30 or
G31-G33 results; they require rerun and independent EVL after correction.

After genuine G34 GREEN, run the following exact local regression commands in
order and record actual results. They are future EXECUTE/EVL commands, not PVL
evidence:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Applicable Deno checks remain local/non-hosted only; unavailable Deno or
Supabase tooling cannot be represented as G34 evidence. No command in this
contract accesses secret values or makes a provider/RPC/hosted request.

### V6 - G22 drift and approval boundaries

- G22 remains `UNKNOWN/DRIFT`: the Phase 04 report records the successful
  read-only linked diff and non-empty output at
  `phase-04-ai-gateway-executor_REPORT_08-09-26.md:861-875`, including
  `payment_attempts` RLS enablement and `public.rls_auto_enable()`. G34 does not
  resolve, hide, reclassify, apply, reset, or rewrite that drift. Any true schema
  mismatch requires a later plan and separate migration/schema approval.
- **Separate staging config and secret setting approval:** only after G34, the
  complete local regression set, and independent EVL are green may an operator
  separately approve setting the single non-secret staging value
  `PACT_EXPECTED_REGION=ap-southeast-1` on project
  `myotkovmgzdabuirkqlx`. It must not set, override, or synthesize `SB_REGION`.
  Any required staging secret provisioning, including function-only
  `SESSION_HMAC_SECRET` or provider credentials, is a separate out-of-band
  operator approval and names-only/redacted boundary; no secret value belongs in
  this artifact or PVL.
- **Separate G13 approval:** after the approved setting is present, a new,
  explicit staging-only approval is required for the corrected three-function
  G13 redeploy and status verification. Prior G13 `v8`/`v9` records remain
  historical and cannot be reused.
- **Separate H1 approval:** fresh H1 provider execution requires its own explicit
  live/provider approval after local G34/regressions, independent EVL, any
  separately approved schema prerequisite, approved staging configuration, and
  successful corrected G13. H1 remains fail-closed if region/model access is
  unavailable; no local health result proves model availability. H2 and H3 retain
  their own separate approvals as well.

### V7 - Net gate, preservation, and handoff

**Net Gate: CONDITIONAL** - the G34 contract is executable and all required
boundaries are named, while current source is expected RED for the old expected
region source, observed-region synthesis, production custom binding, provider
fallback, and missing focused assertions. No missing contract boundary warrants
BLOCKED. This is not EXECUTE approval and grants no staging config/secret, G13,
migration, hosted, provider, RPC, or H1-H3 authorization.

The next valid state is separately approved local EXECUTE: add the G34 assertions,
capture genuine targeted RED, make the minimum correction, run G34 and the exact
regression set, and request independent EVL. Preserve all prior supplement bytes,
the Phase 04 report, G22 drift, G13 histories, and H1-H3 classifications.

**Gate: CONDITIONAL**  
**Selected artifact:** `process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`  
**Current result:** G34 validation contract bound; G34 NOT RUN; no test,
deployment, live, secret-setting, migration, or hosted result claimed.

## Local G34 Execution Status (2026-09-13)

**Mode:** AUTOPILOT | EXECUTE  
**Scope:** G34 only, local and reversible. All prior supplement lines,
historical G24-G33 results, the Phase 04 report, G22 disposition, G13 history,
and H1-H3 records remain unchanged. No main Phase 04 report append was made.

### RED-first and GREEN evidence

- Exact G34 RED command:
  `corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts`
  ran after the assertions were added and before the source correction. Result:
  `5` tests, `3` passed, `2` targeted failures. The failures were the stale
  `us-east-1` health expectation and absent `PACT_EXPECTED_REGION` production
  binding assertions. This was genuine targeted RED, not a missing-file,
  compile, infrastructure, all-pass, or all-fail substitute.
- Exact G34 GREEN result: `1` file, `5/5` tests.
- G34 rejection cases prove missing expected, missing observed, and mismatched
  expected/observed regions stop session, gateway, and executor protected work
  with provider, persistence/session, CardStore/IntentStore, and RPC counters at
  zero. The equal case reports the observed and expected `ap-southeast-1` values
  with the unchanged exact seven-key health shape.
- Static source assertions prove the three Deno maps use
  `PACT_EXPECTED_REGION` and `SB_REGION`, production maps do not bind
  `SUPABASE_FUNCTION_REGION`, and no runtime root or OpenAI provider defaults to
  `us-east-1`. Explicit local/test inputs may still supply equal
  `SUPABASE_FUNCTION_REGION` and `SB_REGION` through the compatibility path.

### Focused and regression gates

- Post-correction focused gates: runtime composition `5/5`; auth/health `3/3`;
  session composition `2/2`; gateway composition `2/2`; executor read-only
  `3/3`; composition roots `5/5`; intent scope `6/6`; prefix routing `13/13`;
  provider config `4/4`; deploy compatibility `8/8`.
- Full relevant Vitest command: `35/35` files and `201/201` tests GREEN.
- Typecheck GREEN; lint GREEN; AICD GREEN (`0` failures).
- Secret scanner GREEN (`1002` scanned, `0` findings). The exact name-only
  secret/SDK search found only approved names, tests, documentation, and static
  boundary assertions; no secret value was accessed or recorded.
- `git diff --check` GREEN.

### Implementation and boundary status

- Runtime composition now requires explicit expected/observed region values;
  deployed composition reads `PACT_EXPECTED_REGION` and observed `SB_REGION`.
  Missing values and exact mismatches fail closed before protected provider,
  persistence, card/store, session lookup, or RPC work. No deployed
  `SUPABASE_FUNCTION_REGION` binding, observed-region synthesis, or
  `us-east-1` fallback remains.
- Public gateway health remains side-effect-free with exactly
  `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`.
  It reports observed/configured truth and does not claim model access or region
  success.
- The approved staging setting was not created or changed. `SB_REGION` was not
  set, overridden, or synthesized. No migration/reset, deployment, hosted
  request, OpenAI/RPC call, transaction, signer construction, commit, or push
  was run.
- Deno and Supabase CLI were unavailable in the current shell; no Deno check or
  bundle result is claimed.

**G34 local status: GREEN ONLY.** Independent EVL remains required. Hosted JWT
behavior, remote schema/persistence parity, regional RPC behavior, live model
access, corrected G13 deployment, and fresh H1-H3 evidence remain unresolved
and separately approval-gated. G22 remains UNKNOWN/DRIFT.

## Region Semantics Supersession - G35 (2026-09-13)

**Mode:** AUTOPILOT | PLAN-SUPPLEMENT only  
**Status:** READY FOR PVL; NOT READY FOR EXECUTE, STAGING CONFIGURATION, G13, OR H1-H3  
**Scope:** This additive delta supersedes only the prior G34 normative region
semantics and its stale exact-equality/static clauses. It does not rewrite the
G34 RED/GREEN record, any prior plan byte, G22, G13 history, H1-H3 history, or
any other evidence. No implementation, test execution, staging setting,
migration, reset, deployment, provider/RPC/hosted request, secret access,
signer operation, transaction, commit, or push is authorized here.

### Corrected Region Contract

Supabase Edge Functions are globally distributed. `SB_REGION` is therefore the
platform-observed execution location, not the Supabase project region and not a
value that the application may override or synthesize.

- `PACT_EXPECTED_REGION` is the single operator-configured project/provider
  expected-region source for deployed composition. The approved staging value
  is exactly `us-east-1`.
- `SB_REGION` is observed-only platform input. It is not required to equal
  `PACT_EXPECTED_REGION`; the observed staging example `ap-southeast-1` is
  accepted when the expected project region is `us-east-1`.
- `SUPABASE_FUNCTION_REGION` remains explicit local/test compatibility only. A
  local compatibility fixture may supply it deliberately, but it is not a
  second deployed configuration source, production Deno binding, fallback, or
  synthesized `SB_REGION` value.
- Protected production work requires a non-empty, non-`unknown` observed
  `SB_REGION` and a present, non-empty, valid expected region. Missing or
  unknown observed input, and missing, unknown, blank, or invalid expected
  input, fail closed before provider, persistence/session, CardStore/IntentStore,
  or RPC work. A valid expected region plus a different valid observed edge
  location must not fail solely for non-equality.
- The existing auth, wrong-chain, dependency, provider, persistence, static-RPC,
  signer, and route gates remain unchanged. This correction must not weaken or
  bypass any unrelated gate merely to demonstrate region acceptance.
- Public health remains side-effect-free and returns exactly
  `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`.
  `configuredRegion` is the observed `SB_REGION` or non-secret `unknown` marker;
  `expectedRegion` is `PACT_EXPECTED_REGION`, an explicitly supplied local
  compatibility expectation, or non-secret `unknown` when absent. No extra
  `SB_REGION` key is added.
- The canonical model configuration remains the sole model authority with the
  existing `openai` / `gpt-5.6-luna` / `allowFallback:false` pin. No second
  model/config source, inline replacement, provider fallback, or canonical pin
  change is permitted. Model-access status remains **UNKNOWN** until a fresh
  H1 is run after this region contract passes; local health is not model-access
  evidence.

The prior G34 equal-region contract (`ap-southeast-1` expected and observed),
its old mismatch assertions, and its `us-east-1`-must-not-appear static clause
are historical/stale plan clauses from the superseded interpretation. They are
not current acceptance criteria. The G34 local result remains preserved as
historical evidence, but it does not prove G35.

### G35 Exact Touchpoints and RED-First Tests

The later approved local EXECUTE must update only the region-related assertions
and fixtures in these existing files, without changing unrelated auth, wrong-chain,
read-only, provider, persistence, route, or model-pin assertions:

- `supabase/functions/session/index.ts`
- `supabase/functions/ai-gateway/index.ts`
- `supabase/functions/ai-gateway/openai-provider.ts`
- `supabase/functions/agent-executor/index.ts`
- `supabase/functions/_shared/region-config.ts`
- `supabase/functions/_shared/health.ts`
- `supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts`
- `supabase/functions/_shared/test/auth-health-correction.vitest.test.ts`
- `supabase/functions/_shared/test/deploy-compat.vitest.test.ts`

The exact RED-first focused commands are:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
```

These commands are future EXECUTE commands and were not run while appending this
delta. Each focused test must compile and fail with targeted region-semantic
assertions after the assertions are added and before the minimum source
correction. Missing-file, collection/compile, infrastructure, all-pass, and
all-fail output is invalid RED and is a hard stop.

The runtime-composition test must exercise the actual `Deno.serve` composition
paths through `startSessionServer`, `startGatewayServer`, and
`startExecutorServer`, using fake dependencies and explicit counters. Its exact
cases are:

1. **Accepted project/edge composition:** use
   `PACT_EXPECTED_REGION=us-east-1` and `SB_REGION=ap-southeast-1`. Region
   composition must not return the existing region-mismatch failure. Any later
   response must be attributable to the existing auth/dependency gates, not a
   false equality requirement.
2. **Missing expected:** omit `PACT_EXPECTED_REGION` while providing
   `SB_REGION=ap-southeast-1`. Protected work fails closed and provider,
   persistence/session, CardStore/IntentStore, and RPC counters remain zero.
3. **Unknown or invalid expected:** separately use an explicit `unknown` value
   and a malformed/invalid expected value with a non-empty observed region.
   Both fail closed before all protected side effects. The approved
   `us-east-1` value remains the only staging expected-region setting.
4. **Missing or unknown observed:** use `PACT_EXPECTED_REGION=us-east-1` with
   missing `SB_REGION`, then with `SB_REGION=unknown`. Both fail closed without
   synthesizing observed state from the expected value, local compatibility,
   card injection, or any other dependency. All protected counters remain zero.
5. **Health truth and exact shape:** with expected `us-east-1` and observed
   `ap-southeast-1`, public health returns `200`, preserves the request ID,
   reports `configuredRegion=ap-southeast-1` and `expectedRegion=us-east-1`,
   and has exactly the seven existing keys. Health performs no provider,
   persistence, card, or RPC work.
6. **Local compatibility preservation:** an explicitly marked local/test
   fixture may provide `SUPABASE_FUNCTION_REGION` as its compatibility expected
   input. The test must prove this does not become the deployed binding, does
   not override observed `SB_REGION`, and does not make an otherwise valid
   project/edge pair require exact equality.
7. **Static binding/model safety:** inspect the three production Deno maps and
   the provider/config path. Production reads `PACT_EXPECTED_REGION` and
   observed `SB_REGION`; production does not bind `SUPABASE_FUNCTION_REGION`,
   hard-code a region fallback, or add a second model source. The canonical
   model pin and `allowFallback:false` assertions remain intact.

The auth-health test must retain the exact seven-key health assertion while
changing only its region fixture to expected `us-east-1` and observed
`ap-southeast-1`. The deploy-compatibility test must replace the stale blanket
`us-east-1` absence assertion with a narrower assertion that no deployed
fallback/default is present; it must continue to require the explicit
`PACT_EXPECTED_REGION` and observed `SB_REGION` bindings and forbid a
production `SUPABASE_FUNCTION_REGION` binding. These are additive test-contract
updates, not permission to weaken auth or unrelated chain/route checks.

### G35 Gate and Required Regression Commands

**G35 - Project/edge region composition:** the RED-to-GREEN focused set proves
that `us-east-1` expected plus `ap-southeast-1` observed is accepted for region
composition; missing, unknown, or invalid expected input and missing/unknown
observed input fail closed; rejected paths have zero provider/persistence/
CardStore/IntentStore/RPC effects; health has the exact seven-key shape and
observed/configured truth; local compatibility remains explicit; and no second
model/config source or canonical pin change is introduced. G35 is **NOT RUN**.

After genuine G35 GREEN, rerun the existing correction and regression commands
below in a later approved EXECUTE/EVL. They are not PVL evidence:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

G24-G34 local results remain historical until the corrected G35 contract and
the applicable reruns are independently classified by EVL. No prior equal-region
GREEN result is reused as G35 success. G31 auth closure, G32 scoped intent reads,
G33 exact dispatch, wrong-chain behavior, and the no-signer/static-RPC boundary
remain regression requirements.

### Preservation, Approvals, PVL Handoff, and State

- G22 remains exactly **UNKNOWN/DRIFT**. The linked diff observation, non-empty
  output, RLS enablement, `public.rls_auto_enable()` event-trigger observation,
  migration-list clarification, and the requirement for a later plan plus
  separate migration/schema approval are preserved. G35 does not resolve,
  reclassify, apply, reset, hide, or rewrite G22.
- All prior G24-G34 evidence, G13 `v8`/`v9` history, H1-H3 history, and the
  prior G34 local GREEN record remain immutable historical records. This delta
  does not promote them, erase them, or claim that hosted region behavior is
  proven.
- Only after G35, the complete applicable local regression set, and independent
  EVL are green may a separate staging setting step be considered. That step
  uses exactly `PACT_EXPECTED_REGION=us-east-1` for project
  `myotkovmgzdabuirkqlx`. It must not set, override, or synthesize `SB_REGION`.
  No setting command is run or authorized by this plan supplement.
- The corrected three-function G13 staging redeploy remains a later, separate
  explicit approval after the approved setting step. Fresh H1-H3 approvals and
  fresh evidence remain separate downstream approvals after corrected G13;
  model access remains **UNKNOWN** until fresh H1 after the region contract
  passes. H2 and H3 retain their own approval boundaries.
- The next valid action is PVL against this exact append-only artifact. PVL must
  bind G35, the named files, the exact RED-first and regression commands, the
  supersession of stale G34 equality clauses, preservation of G22
  `UNKNOWN/DRIFT`, and the no-implementation/no-setting/no-live boundary. PVL
  must not run any test or configuration command.

**G35 status:** NOT RUN; corrected region-semantics implementation required.  
**Effective gate:** CONDITIONAL for PVL handoff only.  
**Next valid state:** PVL, then separately approved local EXECUTE; no staging
setting, G13 redeploy, migration, hosted/live call, or H1-H3 action is
authorized by this delta.

## 12. Validate Contract - G35 Region Semantics (2026-09-13)

**Mode:** AUTOPILOT | VALIDATE (PVL only)  
**Status:** CONDITIONAL  
**Scope:** Read-only validation of the G35 region-semantics delta against the
current source, tests, deployment compatibility checks, Phase 04 report, prior
G34 delta, and the supplied official global-edge assumption. This subsection is
an executable local contract only. It claims no implementation, test execution,
staging setting, secret access, migration, reset, deployment, hosted request,
OpenAI/RPC call, signer operation, transaction, commit, or push.

### V1 - Preservation, evidence boundary, and current findings

- The pre-append supplement was `123,078` bytes and `1,697` lines with SHA-256
  `b4a908c1fb0bd224369722b6537ad78618465bdfe364b79c143076b54dba44bf`. This
  subsection is append-only; those bytes, including the G34 RED/GREEN record,
  G22 disposition, G13 history, H1-H3 history, and G35 plan text, must remain
  byte-identical.
- Routed context was read from `process/context/all-context.md`,
  `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
  `process/context/tests/backend-tests.md`, and
  `process/context/tests/live-e2e.md`. The Phase 04 report, the prior G34
  validation delta, session/gateway/executor roots, health/config tests, and
  deploy-compatibility test were read directly.
- Allowed PVL checks completed before this append: context routing PASS;
  context audit PASS (`0` failures); protocol discovery PASS (`0` failures);
  Pact plan discovery PASS; secret scan PASS (`1,002` scanned, `0` findings);
  `git diff --check` PASS; and static source/test/config searches PASS. No
  implementation or runtime test command was run.
- The plan-artifact validator reports `4` structural failures and `6` warnings
  for the legacy additive supplement shape. These are bounded artifact-shape
  concerns and do not justify rewriting prior bytes or classifying G35 BLOCKED.
- The official global-edge premise is accepted for this contract: Supabase Edge
  Functions can execute at a platform-observed edge location distinct from the
  configured project/provider region. Local/static checks can validate the
  application boundary but cannot prove hosted placement or hosted `SB_REGION`.
  G13 and H1-H3 therefore remain separate downstream evidence lanes.

### V2 - Exact current-source disposition

| Surface | Current evidence | G35 disposition |
|---|---|---|
| Region resolver | `supabase/functions/_shared/region-config.ts:3-25` trims values, falls back to `SUPABASE_FUNCTION_REGION` when `PACT_EXPECTED_REGION` is absent, and `regionsMatch` requires exact equality. It does not reject `unknown` or malformed non-empty values. | Expected targeted RED. Keep the local compatibility fallback explicit and non-deployed, but add valid/unknown/invalid input handling and stop treating valid project/edge inequality as a mismatch. |
| Session root | `supabase/functions/session/index.ts:319-323` and `:351-360` require `regionsMatch`; the production map at `:405-415` already reads `PACT_EXPECTED_REGION` and `SB_REGION`. | The production map is correctly named, but the protected composition still requires equality. Missing, unknown, and invalid values must fail closed before session persistence; valid `us-east-1` expected plus `ap-southeast-1` observed must pass the region gate. |
| Gateway root | `supabase/functions/ai-gateway/index.ts:143-164` exposes health; `:186-190` and `:404-407` require equality; `:289-339` composes the root; `:529-543` reads the two deployed inputs. The module comment at `:4-5` still names the superseded `SUPABASE_FUNCTION_REGION` equality model. | Health remains public and side-effect-free. Protected work must validate presence/validity, not equality, before auth/provider/card/store work. The stale comment/static expectation must not remain the source of G35 semantics. |
| Executor root | `supabase/functions/agent-executor/index.ts:246-248` requires equality before work; `:399-439` composes the read-only path; `:468-481` reads the two deployed inputs. | Replace only the region equality boundary with valid expected/observed presence checks. Preserve persisted authority, wrong-chain rejection, static RPC, and no-signer behavior. |
| Health | `supabase/functions/_shared/health.ts:5-31` returns exactly seven keys. Current health fixtures use equal regions at `health.vitest.test.ts:5-23` and `auth-health-correction.vitest.test.ts:48-67`. | Update only region fixtures/assertions to expected `us-east-1`, observed `ap-southeast-1`; retain exact keys, correlation, public reachability, and zero provider/persistence/card/RPC work. |
| Focused tests | `runtime-composition-correction.vitest.test.ts:18-71,85-160,162-205` contains G34 equality fixtures and a blanket no-`us-east-1` assertion; `auth-health-correction.vitest.test.ts:48-100` uses equal regions; `deploy-compat.vitest.test.ts:145-153` rejects any `us-east-1` in a root. | These are stale for G35 and must be changed only in the region assertions/fixtures. The new accepted-inequality and invalid-input assertions are expected to produce targeted RED before correction. |
| Model/config | `ai-gateway/index.ts:321-328` parses the bundled canonical model JSON; `openai-provider.ts:62-85` applies the model guard; `packages/domain/src/model-config.ts:44-89` and `packages/domain/src/schemas.ts:349-366` define the single pin and unset-or-exact `OPENAI_MODEL` rule; `provider-config.test.ts:16-56` covers it. | No model source, provider, model, fallback, `OPENAI_MODEL`, or canonical pin change is allowed. The approved `us-east-1` value must not be confused with a model/provider region fallback. |

The current source and existing G34 equality assertions are expected to be RED
for the new G35 accepted-inequality assertion. This is not a missing contract
boundary: all roots, the resolver, exact health shape, focused tests, and
regression commands exist. Therefore G35 is CONDITIONAL, not BLOCKED.

### V3 - Binding G35 contract

1. **Accepted project/edge pair:** the exact deployed-shaped inputs are
   `PACT_EXPECTED_REGION=us-east-1` and `SB_REGION=ap-southeast-1`. The region
   gate must not return the existing region-mismatch failure solely because the
   valid observed edge location differs from the valid expected project region.
   Any later auth, dependency, provider, persistence, or chain result is tested
   separately and is not converted into region success.
2. **Expected input closure:** missing, blank, `unknown`, or malformed expected
   input fails closed before provider, persistence/session, CardStore/IntentStore,
   or RPC work. The focused invalid fixture must be an explicit malformed value
   such as `not_a_region`; no broad project-region allowlist may be invented.
3. **Observed input closure:** missing, blank, `unknown`, or malformed observed
   `SB_REGION` fails closed before the same protected side effects. The observed
   value is never synthesized from expected input, local compatibility input,
   card/provider/RPC injection, or a fallback.
4. **No override:** `SB_REGION` is platform/runtime-observed only. No source,
   test fixture, production Deno map, or staging-setting instruction may set,
   override, or synthesize it. `SUPABASE_FUNCTION_REGION` is local/test
   compatibility only when explicitly supplied and is not a deployed binding.
5. **Health:** public `GET /health` remains side-effect-free and returns exactly
   `requestId,configuredRegion,expectedRegion,chainId,provider,model,modelAvailable`.
   For expected `us-east-1` and observed `ap-southeast-1`, it reports
   `configuredRegion=ap-southeast-1` and `expectedRegion=us-east-1`; no
   `SB_REGION` key is added and no secret/environment map is exposed.
6. **Unchanged contracts:** the existing application-auth ordering and closed
   error surface remain intact (`gateway-composition-correction.vitest.test.ts:39-179`,
   `auth-health-correction.vitest.test.ts:69-100`); the canonical model and
   `OPENAI_MODEL` rules remain intact (`provider-config.test.ts:16-56`); the
   read-only executor permits only `eth_chainId` and `eth_call`
   (`agent-executor/chain-client.ts:49-97` and
   `executor-read-only-composition-correction.vitest.test.ts:9-60`); and no
   signer, broadcast, gas, payment-send, or `AGENT_SIGNER_PRIVATE_KEY` path is
   introduced. No API code, route, RPC authority, signer contract, or model
   contract may change.

### V4 - Exact RED-first commands and assertions

During a later separately approved local EXECUTE, update only the G35
region-related assertions and fixtures in the existing focused files, then run
these exact commands before the minimum source correction:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
```

The RED must compile, find the named file, and contain targeted G35 failures.
Missing-file, collection/compile, infrastructure, all-pass, or all-fail output
is invalid RED and is a hard stop. The runtime test must exercise the actual
`startSessionServer`, `startGatewayServer`, and `startExecutorServer` paths with
fake dependencies and counters. It must cover the accepted pair, missing/
unknown/invalid expected, missing/unknown/invalid observed, zero protected
side effects on every rejected path, and exact health truth. The auth-health
test must retain the exact seven-key and protected-route assertions. The
deploy-compat test must require the two explicit deployed bindings, forbid a
production `SUPABASE_FUNCTION_REGION` binding, and reject a deployed
region-default/fallback pattern rather than rejecting the approved literal
`us-east-1` everywhere.

### V5 - G35 GREEN and local regression commands

**G35 classification:** `CONDITIONAL / NOT RUN`. The contract is executable and
the current equality implementation is expected to fail the new accepted-edge
case. No G35 result is claimed here. After genuine focused GREEN, run the exact
local regression set below in a later EXECUTE/EVL; none of these commands were
run during this PVL:

```bash
corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/auth-health-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/session-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/gateway-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/executor-read-only-composition-correction.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/composition-roots.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/intent-store.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/prefix-routing.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test supabase/test
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Applicable Deno checks remain local/non-hosted only. No local result proves
global-edge placement, hosted `SB_REGION`, remote schema parity, model access,
or regional RPC behavior.

### V6 - G22 drift and separate approvals

- G22 remains exactly **UNKNOWN/DRIFT**. The Phase 04 report records the
  read-only linked diff at `phase-04-ai-gateway-executor_REPORT_08-09-26.md:861-875`,
  including non-empty output for `payment_attempts` RLS and the
  `public.rls_auto_enable()` event trigger. G35 does not resolve, reclassify,
  apply, reset, hide, or rewrite this drift; any schema mismatch requires a
  later plan and separate migration/schema approval.
- Only after G35, the complete applicable local regression set, and independent
  EVL are green may an operator separately approve the non-secret staging
  setting `PACT_EXPECTED_REGION=us-east-1` for project
  `myotkovmgzdabuirkqlx`. That step must not set, override, or synthesize
  `SB_REGION`, and no setting command is authorized here.
- After the setting step, a separate explicit staging-only approval is required
  for the corrected three-function G13 redeploy and status verification. Prior
  G13 `v8`/`v9` records remain historical and cannot be reused.
- Fresh H1-H3 approvals remain separate and downstream of local G35 GREEN,
  independent EVL, any separately approved schema prerequisite, the approved
  staging setting, and successful corrected G13. Model access remains UNKNOWN
  until fresh H1; local health is not model-access evidence.

### V7 - Net gate, preservation, and handoff

**Net Gate: CONDITIONAL** - G35 has a concrete source/test boundary, exact
accepted and fail-closed cases, RED-first commands, regression commands, and
separate approval gates. Current equality checks and source behavior are the
expected targeted RED for the accepted global-edge pair; the stale G34
same-region and blanket `us-east-1`-absence clauses are explicitly superseded
without rewriting them. No missing contract boundary warrants BLOCKED.

The next valid state is separately approved local EXECUTE: add the G35
assertions/fixtures, capture genuine targeted RED, make the minimum region-only
correction, run G35 and the listed local regressions, and request independent
EVL. Preserve all prior supplement bytes, G22 drift, G13 histories, H1-H3
classifications, model/auth/RPC/signer contracts, and the exact seven-key health
shape.

**Gate: CONDITIONAL**  
**Selected artifact:** `process/features/pact/active/pact-mvp_08-09-26/phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`  
**Current result:** G35 validation contract bound; G35 NOT RUN; no test,
configuration, deployment, live, secret-setting, migration, or hosted result
claimed.

## Local G35 Execution Status (2026-09-13)

**Mode:** AUTOPILOT | EXECUTE  
**Scope:** G35 only, local and reversible. Prior G24-G34 evidence, G22
UNKNOWN/DRIFT, G13 history, H1-H3 history, and the prior G35 contract remain
unchanged. No main Phase 04 report append was made.

### RED-first and waiver evidence

- Runtime-composition RED command:
  `corepack yarn vitest run supabase/functions/_shared/test/runtime-composition-correction.vitest.test.ts`
  produced `5` tests with `2` targeted failures and `3` passes. The failures
  were the accepted `PACT_EXPECTED_REGION=us-east-1` plus observed
  `SB_REGION=ap-southeast-1` cases still rejected by the old equality gate.
  This was genuine targeted RED, not a missing-file, compile, infrastructure,
  all-pass, or all-fail substitute.
- Auth-health RED command produced `3/3` and deploy-compatibility RED command
  produced `8/8` after their G35 fixture/static-assertion updates. These are
  structural waivers for G35 RED: the updated assertions were already
  satisfied by the existing public health shape and explicit deployed
  bindings, so no false failure was introduced merely to manufacture RED.

### G35 GREEN evidence

- Runtime composition: `5/5` tests GREEN.
- Auth/health: `3/3` tests GREEN.
- Deploy compatibility: `8/8` tests GREEN.
- G35 proves the valid project/edge composition (`us-east-1` expected,
  `ap-southeast-1` observed) is not rejected for region inequality; missing,
  unknown, and malformed expected/observed values fail closed before protected
  work; health reports observed/configured truth with exactly seven keys; and
  no deployed region fallback or production `SUPABASE_FUNCTION_REGION` binding
  was added.

### Required reruns and local gates

- G24-G34 focused rerun set: `10` files, `51/51` tests GREEN, including prefix
  routing `13/13` and deploy compatibility `8/8`.
- Full relevant Vitest command: `35/35` files and `201/201` tests GREEN. An
  initial `200/201` result exposed the stale pre-G35 `wrong-region` unit case;
  it was narrowed to an invalid observed-region case within G35 scope, then
  the exact full command passed.
- Typecheck GREEN; lint GREEN; AICD GREEN (`0` failures).
- Secret scanner GREEN (`1002` scanned, `0` findings). The exact approved-name
  secret/SDK scan completed with no secret value accessed or recorded.
- `git diff --check` GREEN.
- Deno and Supabase CLI were unavailable (`command -v` returned no path), so no
  Deno checks, bundles, hosted requests, or Supabase commands were run or
  claimed.

### Implementation and boundary status

- The shared region helper now trims inputs, rejects blank/`unknown`/malformed
  region values, and treats valid expected project and observed edge regions
  as separate facts without requiring equality. The gateway’s direct
  equality check was aligned with that shared gate; session and executor use
  the shared gate unchanged at their composition boundaries.
- Health implementation and the exact seven-key contract are unchanged; only
  local region fixtures/assertions were corrected. The canonical model source,
  `allowFallback:false`, auth ordering, PostgREST scopes, read-only executor,
  and no-signer/no-broadcast boundaries were not changed.
- G35 is **GREEN for local/static scope only**. Model access remains UNKNOWN
  until fresh H1 after the corrected region gate. Hosted global-edge behavior,
  remote schema parity, G22 drift, corrected G13, and fresh H1-H3 remain
  unresolved and separately approval-gated. No staging setting was created or
  changed; `SB_REGION` was not set, overridden, or synthesized.

**G35 local status: GREEN ONLY; EVL REQUIRED.**
