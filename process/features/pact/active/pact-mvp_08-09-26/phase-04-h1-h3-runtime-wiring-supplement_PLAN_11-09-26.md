---
name: plan:phase-04-h1-h3-runtime-wiring-supplement
description: "Phase 04 plan supplement for real staging adapters and H1-H3 runtime wiring"
date: 11-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
---

# Phase 04 H1-H3 Runtime Wiring Plan Supplement

**Mode:** PLAN-SUPPLEMENT
**Date**: 2026-09-11
**Status**: NOT READY FOR H1-H3
**Complexity**: COMPLEX
**Primary execute anchor:** G14-G17 tasks in this supplement, after the next PVL
writes the required Validate Contract delta and explicit EXECUTE approval.
**Supporting phase files:** the primary Phase 04 plan, report, hybrid gate pack,
and phase blast-radius registry listed below; all are read-only historical inputs.

## Overview

This supplement closes the planning boundary between the verified fake-backed
Phase 04 behavior and the still-unwired staging/runtime boundaries needed for
H1-H3. It is intentionally additive: it specifies production adapters, exact
tests, and approval gates without claiming that any adapter, hosted function,
health route, or live provider/RPC path exists.

**Scope:** plan/spec only. This artifact does not authorize implementation, tests,
migrations, deployment, report edits, evidence collection, secret access, OpenAI/RPC
calls, transactions, commits, or pushes. The original Phase 04 plan, original V1-V7
Validate Contract, original Validate Contract delta, Phase 04 report, and original
failed G13 evidence remain historical records and must not be rewritten or reflowed.

**Authoritative existing artifacts:**

- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md`
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-hybrid-gate-pack_10-09-26.md`

**Status:** NOT READY FOR H1-H3. This supplement is ready for PVL only. G13 and
H1-H3 remain separately approval-gated; no live or hosted result is claimed.

## EVL Amendment — G14-G17 Local Runtime Wiring (2026-09-11)

This amendment records the completed local G14-G17 implementation and EVL. It
is additive and does not rewrite the original V1-V7 contract, the prior delta,
the original bare-ethers G13 failure, or the earlier deployment-only G13
success. The new runtime wiring has **not** been deployed; current staging does
not reflect it.

- Genuine RED was captured before implementation for all four G14-G17 focused
  runtime tests.
- Focused G14-G17 tests: **4/4 GREEN**.
- Relevant Vitest regression: **119/119 GREEN**.
- Function regression: **13/13 GREEN**.
- G1-G6 and G8: **GREEN**.
- G7: **CI-only/non-binding**, not run as a local binding gate.
- G12a: **6/6 GREEN**.
- G12b: **GREEN under Deno 2.9.6**.
- Typecheck, lint, AICD, and `git diff --check`: **GREEN**.
- Secret scan: **975 scanned / 0 findings**.
- `deno.lock`: absent. `AGENT_SIGNER_PRIVATE_KEY`: absent by name.
- Local session, gateway, executor, and health behavior: verified.
- Remote schema parity: **UNKNOWN / HYBRID-ONLY**; no safe read-only parity
  verifier was run.

The earlier G13 deployment-only success remains preserved and is not re-used as
evidence for the new wiring. A post-runtime G13 staging redeploy is required
before H1-H3. H1, H2, and H3 were **NOT RUN** and remain separately
approval-gated. This EVL does not authorize deployment, migration, OpenAI/RPC
calls, transactions, secret access, commit, or push.

**Current classification:** LOCAL G14-G17 EVL GREEN; G13 post-runtime redeploy
PENDING; H1-H3 NOT RUN / approval-gated; remote schema parity UNKNOWN.

### Implementation/EVL Checklist State

- [x] Capture genuine RED for G14-G17 before implementation.
- [x] Implement and verify local G14-G17 runtime wiring behind the approved
  boundaries.
- [x] Focused G14-G17 tests GREEN (4/4); relevant Vitest GREEN (119/119);
  function regression GREEN (13/13).
- [x] Rerun G1-G6/G8, G12a, and G12b with the recorded local results; keep G7
  CI-only/non-binding.
- [x] Verify typecheck, lint, AICD, secret scan, and diff-check; record
  `deno.lock` and signer absence.
- [x] Verify local session, gateway, executor, and health behavior.
- [ ] Perform post-runtime G13 staging redeploy under separate approval; current
  staging does not reflect the new runtime wiring.
- [ ] Run H1-H3 under separate approval after post-runtime G13 and schema-parity
  prerequisites are resolved.

## 1. Gap Matrix

| Existing placeholder / exact source | Missing production boundary | Adapter or wiring to plan | Local RED/GREEN strategy | Hybrid evidence |
|---|---|---|---|---|
| `supabase/functions/session/index.ts:186-199`: HTTP path returns `501` with `HTTP session adapter requires the persistence boundary`; `SessionStore` is `Map`-backed at `:56-63`. | Supabase Function must persist challenges/sessions, atomically consume a challenge, and revoke by hash without exposing bearer material. | Add a `SessionPersistence` port and Supabase PostgREST/RPC adapter. Keep `requestChallenge`, signature verification, token issuance, and error mapping pure; inject the adapter into the HTTP entrypoint. | Add a RED HTTP-adapter test for challenge → verify → second verify → revoke against a fake/PostgREST-shaped store. GREEN requires persistence calls, atomic zero-row second consume, hash-only writes, and no raw token/signature. | H3 health proves function reachability/configuration; H2 must use an authenticated disposable session only if the approved lane needs it. No service-role value or session token enters evidence. |
| `supabase/functions/ai-gateway/index.ts:28-35` has no intent store dependency; `:187-204` returns an intent but does not persist it; HTTP `:217-237` returns `501` for the persistence boundary. | Regional function must authenticate the session, resolve the authoritative card snapshot, call the raw-fetch provider, persist attribution/hash/expiry, and return the stable envelope. | Add an `IntentStore` port and HTTP composition root. Wire `OpenAiProvider` from runtime config, session middleware, card snapshot reader, catalog, and store; never import executor/signer code. | Add RED composition tests for valid persist, provider/model/schema failure with zero persistence, wrong region before provider, and merchantId-only output. GREEN requires one store write only after all validation passes. | H1 records only provider/model/request ID/latency/decision; H2 separately proves read-only preflight. H1 failure is a mapped error and no intent/payment side effect. |
| `supabase/functions/ai-gateway/openai-provider.ts:116-120` sends only `content-type`; `:42-52` maps provider status but no runtime API-key composition is shown. | Server-side raw fetch must authenticate to OpenAI without leaking the key, preserve the pinned model and request shape, and discard raw provider errors. | Add a function-only API-key/header boundary to the provider composition root; keep raw fetch behind `AiProvider`. Capture provider request ID and latency in redacted logs only. | Add RED provider-port tests for Authorization header presence by name-only fake, no key in returned error/log fixture, `store:false`, strict `pact_agent_intent`, and retry budget. GREEN requires one retry only for 429/502/503 and no retry for other statuses. | H1 capability + one structured request, at most one allowed retry, `gpt-5.6-luna`, `allowFallback:false`; no raw body/prompt/key in the H1 artifact. |
| `supabase/functions/agent-executor/chain-client.ts:37-43` defines `PaymentClient` but has no real implementation; HTTP `agent-executor/index.ts:220-241` returns `503` and explicitly rejects a signer env. | H2 needs a regional, read-only chain adapter from `CREDITCOIN_RPC_URL`; it must call `eth_call`/static preflight only and must not construct a signer. Full execute/reconcile behavior remains separately protected by the existing C-DDL state machine. | Add a `ReadOnlyRpcPaymentClient`/adapter composition for `readCard` and `preflight`; use an ethers `JsonRpcProvider` only for read/static calls. Do not route H2 through `handleExecute`, `sendPayment`, `Wallet`, or `AGENT_SIGNER_PRIVATE_KEY`. Keep the existing `PaymentClient` send/reconcile port for the already-tested execute lane and wire it only in the explicitly authorized payment lane. | Add RED adapter tests with a fake JSON-RPC transport asserting `eth_call` only, `from=agent`, server-bound card/merchant/asset/nonce, zero signer construction, zero send/broadcast, and wrong-chain rejection. GREEN also reruns executor fake tests for idempotency, store-before-wait, timeout reconciliation, and status-1-only settlement. | H2 records decision/reasonCode/chainId/checkedAt/correlation IDs only. Budget is read-only RPC, max three attempts, zero transactions/gas/signers. |
| `supabase/functions/_shared/health.ts:15-31` only builds a shape; `apps/edge/src/index.ts:31-49,137-145` permits and forwards `GET /health`; `apps/edge/wrangler.toml:8` has an empty URL and `:14-15` no active rate-limit binding. | Public edge needs one non-secret GET health route and fixed upstream wiring; regional function needs a matching health response without model calls or chain mutation. | Implement the regional `GET /health` composition in the function entrypoint/shared route and preserve edge fixed-URL forwarding. H3 must use the concrete deployed URL as output, never invent it in committed config. | Add RED edge/regional route tests for exact method/path, response schema, no auth requirement, no provider/RPC call, no secrets, and fixed upstream. GREEN requires stable JSON and correlation header. | H3 records fixed URL, expected/actual region, URL binding proof, and the exact non-secret response shape. A blank `wrangler.toml` URL is not H3 evidence. |

## 2. Session Persistence Adapter

### Boundary and credential choice

Create a narrow `SessionPersistence` interface with operations for inserting a
challenge, atomically consuming a challenge by `nonce_hash`, inserting a session,
looking up a session by `token_hash`, and revoking a session. The existing pure
functions in `supabase/functions/session/index.ts:65-169` remain the behavioral
authority; the adapter replaces only the in-memory `Map` store at the HTTP boundary.

Use the Supabase URL plus anon/public client path with RLS-safe policies or a
dedicated security-definer SQL function that exposes only the required operations.
The adapter must not accept a browser-supplied role, wallet, session ID, or raw
token as authority. `SUPABASE_SERVICE_ROLE_KEY` is **not a prerequisite for the
planned implementation**. It may be considered only if the approved RLS-safe
function boundary cannot perform the atomic operations; that would be a new,
explicitly documented security decision and a PVL blocker until reviewed. It must
never be added to edge/browser configuration or the H1-H3 lane by default.

### Required semantics, matching current DDL

- Challenge expiry is five minutes and session expiry is thirty minutes, matching
  `supabase/migrations/202609080001_sessions_and_intents.sql:25-44` and the
  constants in `packages/domain/src/session-token.ts:15-22`.
- Store only lowercase SHA-256 hex hashes in `nonce_hash` and `token_hash`; the
  `64`-hex checks and indexes at migration `:25-47` remain required. Never add
  plaintext token, signature, bearer, or nonce columns.
- Verify must execute an atomic update equivalent to
  `UPDATE session_challenges SET consumed_at=now() WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING ...`.
  A zero-row result is `AUTH_INVALID`; it must not issue a session.
- Session issuance stores only the hash of the HMAC token. `SESSION_HMAC_SECRET`
  remains function-only, versioned for current/previous-secret overlap of one
  session TTL, and is never persisted in Postgres or returned by an adapter.
- Revoke verifies the wallet-bound token, finds by hash and wallet, and updates
  `revoked_at`; lookup must reject expired or revoked sessions.
- SQL/RLS tests must prove the authenticated path cannot read another wallet's
  session rows and that an anon/RLS-safe operation cannot insert arbitrary role or
  wallet ownership.

The migration already declares the required session DDL. No migration change is
part of this supplement; any DDL discrepancy is a BLOCKED implementation finding,
not permission to run a migration in H1-H3.

## 3. AI Gateway Wiring

Compose the regional route with `OpenAiProvider` from
`supabase/functions/ai-gateway/provider-port.ts:28-34` and
`openai-provider.ts:54-175`. The provider remains raw `fetch`, with no OpenAI SDK.
The composition must load the sole `config/ai/model-config.json` truth
(`gpt-5.6-luna`, `allowFallback:false`) through the existing domain loader and
assert `allowFallback === false` before any fetch. `OPENAI_MODEL` is unset-or-exact
only; no substitution or fallback branch is permitted.

The request must retain `store:false`, strict schema name `pact_agent_intent`,
`additionalProperties:false`, and exactly `merchantId`, `amountDecimal`, `purpose`,
and `confidence`. The server resolves card, agent, native asset, recipient,
allowlist, policy version, expiry, and canonical hash. Persist actual provider/model
attribution only after shared validation succeeds. Raw provider response bodies,
authorization headers, prompts, and keys never enter errors, logs, persistence, or
H1 evidence.

Use the existing closed 15-code surface in
`packages/domain/src/api.ts:14-32,146-211`; mapper changes require a separate
plan supplement. Retry exactly once, only for 429/502/503, reusing correlation
identity and never creating a payment retry. Any other failure, malformed output,
model mismatch, wrong region, or second retryable failure maps to the existing code
and stops before intent persistence or chain access.

## 4. Read-Only Executor Adapter

The requested H2 adapter is a distinct read-only runtime composition, not a new
payment authority and not a relaxation of the current executor invariants. Read
`CREDITCOIN_RPC_URL` as an operator-provided public runtime input and construct only
an ethers `JsonRpcProvider`. The adapter may use provider network identification,
`eth_call`, and static `preflightPay`/card reads. It must never construct
`Wallet`, load `AGENT_SIGNER_PRIVATE_KEY`, sign, broadcast, estimate a payment for
submission, or invoke `sendPayment`.

Use server-bound values from the persisted intent/card snapshot. Set the simulated
caller to the on-chain agent address and use the card-scoped nonce; reject client
recipient, asset, card, or nonce values. Assert the configured Creditcoin chain ID
before the static call and return a stable `NETWORK_CONFIG_INVALID` or
`PREFLIGHT_DECLINED` result on mismatch/decline.

The full executor path remains governed by
`agent-executor/index.ts:100-208` and `payment-reconciler.ts:14-31`:
first-claim plus row lock, store `txHash` before waiting, reconcile by nonce and
stored hash before any retry, never submit twice, and classify settled only from
`receipt.status === 1`. H2 must not call this send path. No treasury authority is
added: the adapter can read policy state and simulate the controller preflight only.

## 5. Health Route Contract

Public URL: `GET https://<EDGE_ORIGIN>/health`. The edge forwards only to the fixed
`SUPABASE_REGIONAL_FUNCTION_URL` at `/health`; direct regional diagnostic URL, when
needed by H3, is `GET https://<REGIONAL_FUNCTION_URL>/health`. No bearer or demo
credential is required, and the route performs no model call, database mutation,
signer operation, transaction, or arbitrary URL forwarding.

Exact JSON response shape, using the existing builder at
`supabase/functions/_shared/health.ts:5-31`:

```json
{
  "requestId": "req-...",
  "configuredRegion": "us-east-1",
  "expectedRegion": "us-east-1",
  "chainId": 102031,
  "provider": "openai",
  "model": "gpt-5.6-luna",
  "modelAvailable": false
}
```

`modelAvailable` is a boolean capability result, not a raw provider error. The
response contains no URL secret, API key, service-role key, signer key, prompt,
token, address beyond an approved public chain identifier, or raw exception.

## 6. RED-First Implementation Tasks

Implementation is not authorized by this artifact. When separately approved, run
each task as RED → observe genuine failure → minimal implementation → GREEN. A
fake-backed GREEN is valid only for deterministic boundaries; it may not be
reported as Supabase persistence, deployed liveness, live model access, or RPC
evidence.

1. Add RED tests for `SessionPersistence` composition, atomic consume-once,
   hash-only writes, TTL/revocation, RLS ownership, and HTTP route status. Then add
   the real adapter and obtain GREEN against the hermetic fake; a local green must
   not claim Supabase availability.
2. Add RED tests for `IntentStore` composition and provider wiring, including the
   15-code mapper, raw-error redaction, model pin, fallback rejection, `store:false`,
   merchantId-only schema, and retry budget. Then add the runtime composition and
   obtain GREEN with a fake fetch/provider and fake store.
3. Add RED tests for the read-only RPC adapter: `CREDITCOIN_RPC_URL`, chain ID,
   `eth_call`/static-only method set, server-bound `from=agent`, no signer/key,
   zero broadcast, and fail-closed errors. Then add the adapter and obtain GREEN
   with a fake JSON-RPC transport.
4. Add RED tests for `GET /health` at the regional entrypoint and edge fixed URL,
   exact response keys/types, correlation ID, no auth, no provider/RPC calls, and
   no secret material. Then add the route and obtain GREEN locally.
5. Run the existing executor fake tests without weakening them: duplicate
   idempotency has one send, tx hash is stored before wait, timeout reconciliation
   never resubmits, receipt status 0 never settles, and gateway cannot import the
   signer path.

## 7. Gates and Readiness

Preserve G1–G8 exactly, including G7 as non-binding CI-only when Deno/Supabase are
unavailable. Preserve G12a/G12b compatibility gates and keep G13 separate. Add the
following binding adapter checks after genuine RED/GREEN tests exist:

- **G14 session adapter:** fake/PostgREST contract, atomic zero-row replay,
  hash-only/TTL/revoke/RLS assertions, and HTTP composition.
- **G15 gateway composition:** provider/store injection, 15-code equivalence,
  redaction, pin/fallback/store/schema/retry assertions, and zero persistence on
  failure.
- **G16 read-only RPC adapter:** `CREDITCOIN_RPC_URL`, `eth_call`/static-only
  transport, chain/from/server-bound assertions, no signer/key/broadcast.
- **G17 health route:** edge-to-regional fixed URL, exact GET shape, no-auth and
  no-side-effect assertions.

G1–G8 and G12a/G12b must remain green; G13 is a separate staging-only approval
gate and is not implied by this supplement. H1–H3 require a separate explicit
approval after local EXIT and G13 prerequisites. No local green may be claimed from
an unavailable Supabase stack, hosted project, live OpenAI, or live RPC.

## 8. H1-H3 Hybrid Rerun Contract

The existing `phase-04-hybrid-gate-pack_10-09-26.md` remains the lane authority;
this section adds runtime-boundary prerequisites only.

- **H1:** one capability check plus one structured `gpt-5.6-luna` request, with at
  most one retry only on 429/502/503. Record provider, pinned model, provider
  request ID, latency, `decision`, `storeConfirmed:false`, and
  `allowFallbackAsserted:false`. Never record prompt/body/key/raw error.
- **H2:** one regional read-only preflight path using `CREDITCOIN_RPC_URL`,
  `eth_call`/static call only, max three read-only RPC attempts, zero transactions,
  zero gas, zero signer operations. Record decision, reason code, chain ID,
  checked time, and correlation IDs with approved redaction.
- **H3:** one `GET /health` through the fixed regional URL and edge binding. Record
  concrete URL, expected/actual region, match boolean, binding names, and exact
  health shape. Do not treat the committed blank `wrangler.toml` URL as proof.
- **Budgets:** OpenAI maximum three billable attempts total as defined by the
  existing pack; H2 maximum three read-only attempts; zero transactions,
  deployments, migrations, gas, or signer/key operations.
- **Redaction:** names only for environment inputs; no secret values, bearer
  tokens, prompt text, raw provider/RPC bodies, private keys, or unapproved
  addresses in logs or evidence.
- **Rollback/cleanup:** use only disposable staging state; revoke/expire any lane
  session and intent rows created by the lane; leave `SESSION_HMAC_SECRET`
  untouched; do not alter migration state. On failure, record a mapped blocker and
  stop; never manufacture a mock-green H result.
- **Hard stops:** missing required names, signer present or demanded,
  `allowFallback !== false`, model mismatch, `store !== false`, arbitrary upstream,
  non-static RPC, retry beyond budget, mainnet chain ID, raw secret-shaped output,
  or any request to mutate repo/runtime state outside the approved lane.

## Validate Contract

### Required Validate Contract Inputs

The next Validate Contract must be a new delta/superseding contract that consumes
this supplement without rewriting the original V1–V7 or its prior delta. It must
include:

- exact gap-matrix paths and line refs above, with adapter ownership and composition
  roots;
- session adapter contract, DDL predicates, 5-minute/30-minute TTLs, SHA-256
  64-hex hash-only rule, atomic consume SQL, HMAC rotation overlap, RLS choice, and
  explicit statement that `SUPABASE_SERVICE_ROLE_KEY` is not required unless a
  separately reviewed RLS-safe design proves it necessary;
- gateway raw-fetch wiring, server-only API-key boundary, pinned
  `gpt-5.6-luna`, `allowFallback:false`, `store:false`, merchantId-only schema,
  15-code mapper, redaction, and retry policy;
- read-only RPC adapter using `CREDITCOIN_RPC_URL`, `eth_call`/static-only proof,
  no signer/key, no treasury authority, plus preserved idempotency/reconcile
  invariants for the full executor;
- exact `GET https://<EDGE_ORIGIN>/health` and direct regional health URLs and JSON
  response shape;
- RED-first tests with genuine RED/GREEN acceptance and the G14–G17 binding tests;
- unchanged G1–G8/G12a/G12b, separate G13, explicit H approval, and the rule that
  unavailable Supabase cannot produce local green;
- the H1/H2/H3 budgets, redaction, cleanup/rollback, and hard stops in section 8;
- explicit prerequisites: staging/disposable Supabase deployment, fixed regional
  URL derived only from successful G13 output, expected region, `OPENAI_API_KEY`,
  `SESSION_HMAC_SECRET`, `DEMO_TOKEN`, `CREDITCOIN_RPC_URL`, and optional
  `OPENAI_MODEL` unset-or-exact. `SUPABASE_URL`/`SUPABASE_ANON_KEY` are platform
  inputs; service-role is not default. `AGENT_SIGNER_PRIVATE_KEY` must be absent.

**Validate status:** NOT READY / CONDITIONAL INPUTS REQUIRED. No implementation
handoff is valid until the next contract records these inputs, binds exact tests,
and preserves the historical evidence byte-for-byte.

## Acceptance Criteria

- Session HTTP routes use a real injected persistence adapter with hash-only,
  five-minute/30-minute TTL, atomic single-use, revoke, and RLS-safe semantics.
- Gateway HTTP wiring uses the raw-fetch provider with `gpt-5.6-luna`,
  `allowFallback:false`, `store:false`, merchantId-only output, the closed 15-code
  mapper, bounded retry, and no raw errors or persistence on failed validation.
- H2 uses only a `CREDITCOIN_RPC_URL` read-only/static adapter with no signer,
  private key, broadcast, gas, or treasury authority; full executor idempotency and
  reconciliation invariants remain intact.
- `GET https://<EDGE_ORIGIN>/health` and its fixed regional upstream return the
  exact non-secret shape in section 5 with no side effects.
- G14-G17 are genuine RED-first then GREEN tests; unavailable Supabase never
  produces local green, G13 remains separate, and H approval remains mandatory.
- The next Validate Contract records all inputs in this supplement and leaves the
  original V1-V7 and prior delta byte-for-byte unchanged.

## Phase Completion Rules

This supplement is complete only when plan discovery finds it in the Phase 04
task folder, the plan-completeness validator passes, the next Validate Contract
has recorded the required inputs, and the user explicitly approves any later
EXECUTE/G13/H1-H3 transition. It is not a Phase 04 verification or deployment
result and cannot advance the program to Phase 05.

## Implementation Checklist

- [ ] Write G14-G17 RED tests for session persistence, gateway composition, the
  read-only RPC adapter, and health routing.
- [ ] Implement the approved adapters behind injected ports only after genuine RED
  evidence is observed; keep domain authorities and historical artifacts read-only.
- [ ] Obtain binding local GREEN for G14-G17 and rerun unchanged G1-G8/G12a/G12b;
  keep G7 non-binding if its tools are unavailable.
- [ ] Obtain separate G13 approval and evidence before deriving the regional URL.
- [ ] Obtain separate H1-H3 approval and execute the hybrid rerun contract with
  budgets, redaction, cleanup, and hard stops.

## RFC / Design Decisions

- **Session credential:** RLS-safe anon/platform path is the default; service-role
  is not required unless a separately reviewed atomic persistence design proves it
  necessary.
- **AI provider:** raw fetch behind `AiProvider`; no SDK, fallback, model drift, or
  raw-error passthrough.
- **Executor H2 boundary:** static/read-only adapter is separate from the send and
  reconciliation path; no signer or treasury authority is introduced.
- **Health:** fixed regional upstream only; blank committed URL is configuration
  placeholder, never runtime evidence.

**Plan-completeness expectation:** the next PVL must verify this artifact's
Touchpoints, Public Contracts, Blast Radius, Verification Evidence, Test Infra
Improvement Notes, and Resume and Execution Handoff before any EXECUTE approval.

## Touchpoints

Read-only source boundaries are listed in the Gap Matrix. Future implementation may
touch only the session, gateway, executor, shared health, edge route/config, adapter
tests, and approved runtime configuration surfaces named there. Historical Phase 04
plan/report/hybrid pack and prior evidence are read-only.

## Public Contracts

The existing POST envelopes, closed 15-code API surface, C-SESSION/C-DDL/C-MODEL
rules, H1-H3 evidence shapes, fixed regional upstream, and new non-secret GET health
shape above. No new payment authority, fallback model, arbitrary upstream, or secret
surface is introduced.

## Blast Radius

Medium-high cross-runtime boundary work: Supabase session/gateway/executor
composition, one read-only RPC adapter, edge health forwarding, adapter tests, and
runtime input documentation. Database semantics are consumed from the existing
migration; no migration execution or DDL rewrite is authorized here. Security risks
are session replay, RLS bypass, provider secret leakage, arbitrary upstream, signer
construction, and false settlement; each is fail-closed and test-bound above.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G14 session adapter fake/RLS contract | Fully-Automated | Hash-only storage, TTL, atomic single-use, revoke, wallet isolation |
| G15 gateway composition/provider port | Fully-Automated | Pinned model, no fallback, store false, merchantId-only, 15-code redaction and retry |
| G16 read-only RPC adapter | Fully-Automated | CREDITCOIN_RPC_URL, static `eth_call`, server-bound preflight, no signer/broadcast |
| G17 health route | Fully-Automated | Exact GET URL/shape, fixed upstream, no auth or side effect |
| Existing G1-G8/G12a/G12b regression | Fully-Automated / CI reference per existing contract | No drift in domain, edge, functions, compatibility, mapper, secrets, or DDL pins |
| G13 staging deployment | Hybrid, separately approval-gated | Three function deployments and output-derived regional URL only |
| H1 live pinned model request | Hybrid, approval-gated | Live provider/model capability with redacted metadata and bounded retry |
| H2 regional read-only preflight | Hybrid, approval-gated | Regional static policy preflight with zero mutation |
| H3 fixed URL/health | Hybrid, approval-gated | Region match and concrete fixed upstream health response |

## Test Infra Improvement Notes

Add G14–G17 fake-backed mirrors and a RLS/PostgREST contract fixture during
EXECUTE. Keep Deno/Supabase execution non-binding when unavailable. A fake store,
fake fetch, or fake JSON-RPC transport proves adapter behavior only; it cannot be
promoted to hosted Supabase, live OpenAI, regional RPC, G13, or H1-H3 evidence.

## Resume and Execution Handoff

- **Selected plan file:** this supplement, alongside the primary Phase 04 plan at
  `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`.
- **Last completed step:** hosted bundle-resolution supplement and G12b are reported
  verified; G13 and H1-H3 remain not run.
- **Validate-contract status:** this supplement's required delta is pending; status
  is NOT READY / CONDITIONAL INPUTS REQUIRED.
- **Supporting context loaded:** `process/context/all-context.md`,
  `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
  `process/development-protocols/orchestration.md`, `plan-lifecycle.md`, and
  `pact-mvp-gates.md`, plus the Phase 04 plan/report/hybrid pack and named source.
- **Fresh-agent next step:** run plan discovery and PVL against this supplement;
  do not execute implementation or hybrid work until the new Validate Contract is
  written, reviewed, and explicitly approved.

**H1–H3 RUNTIME WIRING PLAN SUPPLEMENT COMPLETE — READY FOR PVL**

## Superseding Validate Contract Delta — G14-G17 Runtime Boundary

**Contract status:** NOT READY / CONDITIONAL INPUTS REQUIRED

This is an additive, superseding delta for this supplement only. It binds the
next PVL/EXECUTE handoff for G14-G17 without rewriting the original V1-V7
contract, its prior delta, the Phase 04 plan/report, or G13 evidence. G13
remains deployment-only GREEN. H1, H2, and H3 remain separately approval-gated
and are not implied by any G14-G17 result.

The original `## Validate Contract` section beginning at line 442 of
`process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md`
and the original failed G13 evidence remain read-only. No raw errors, secret
values, bearer tokens, prompts, provider/RPC bodies, private keys, production
target, 16th API error code, or behavior drift may enter source, logs, plans, or
evidence.

### Contract-Wide Preconditions and Command Policy

- Scope is limited to the exact runtime files and tests below, shared health/
  configuration boundaries, and the existing migration as a read-only schema
  authority. No migration execution, DDL rewrite, deployment, provider call,
  RPC call, transaction, or secret access is authorized by this contract.
- G1-G8 and G12a/G12b semantics remain unchanged and must be rerun after
  implementation. G7 remains CI-only/non-binding where the existing contract
  says so. Local Deno 2.9.6 checks do not prove hosted deployment, deployed
  liveness, region routing, model access, or RPC availability.
- `config/ai/model-config.json` remains the only model truth:
  `provider=openai`, `model=gpt-5.6-luna`, `allowFallback=false`. Raw `fetch`
  remains the only provider transport; no SDK, fallback, model substitution,
  arbitrary upstream, or second serializer is permitted.
- The closed 15-code API surface remains closed. Any raw error, `as string`
  escape, or 16th code is a hard stop requiring a new supplement.
- Yarn commands use `corepack yarn`, not ambient `yarn`; Deno commands use the
  pinned `npx --yes deno` form below and `--no-lock`.
- Commands must not read secret values. Later approved lane presence checks are
  names-only and redacted; they are not part of this plan-only session.

Common local verification commands, to run only after implementation and
explicit EXECUTE approval:

```bash
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Common full relevant Vitest command (executable after the planned files exist):

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
```

Applicable Deno 2.9.6 check/bundle commands:

```bash
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/session/deno.json -o /tmp/opencode/session.js supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/ai-gateway/deno.json -o /tmp/opencode/ai-gateway.js supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/agent-executor/deno.json -o /tmp/opencode/agent-executor.js supabase/functions/agent-executor/index.ts
```

These are local, non-hosted checks. They cannot be promoted to G13 deployment
acceptance or H1-H3 evidence.

### G14 — Session Runtime Persistence Boundary

**Purpose and actual files:** Replace the current `Map`-backed `SessionStore`
and HTTP `501` at `supabase/functions/session/index.ts:56-63,186-199` with an
injected `SessionPersistence` composition. Preserve pure behavior in
`supabase/functions/_shared/session-token.ts` and `supabase/functions/_shared/auth.ts`.
The schema authority is the read-only
`supabase/migrations/202609080001_sessions_and_intents.sql`; focused tests are
`supabase/functions/session/test/session.vitest.test.ts` and the non-binding
Deno reference `supabase/functions/session/test/session.test.ts`. Any new G14
adapter test stays under `supabase/functions/session/test/`.

**Focused command:**

```bash
corepack yarn vitest run supabase/functions/session/test/session.vitest.test.ts
```

**Full relevant command:** the Common full relevant Vitest command, followed by
the common typecheck, lint, AICD, secret scan, and diff-check commands.

**Required assertions:** insert challenge; atomically consume by `nonce_hash`;
insert and lookup session by `token_hash`; revoke by hash; lowercase SHA-256
64-hex hashes only; five-minute challenge TTL; 30-minute session TTL; wallet
binding; versioned function-only `SESSION_HMAC_SECRET` with old-secret overlap
of no more than one session TTL; no plaintext token/signature/bearer. Consume
must be equivalent to `UPDATE session_challenges SET consumed_at=now() WHERE
nonce_hash=$1 AND consumed_at IS NULL RETURNING ...`; zero rows are
`AUTH_INVALID`. RLS-safe paths cannot read another wallet or choose ownership.

**Expected output:** actual focused test counts and failures, if any. A passing
test command is not pre-claimed here. No token, secret, or raw persistence error
may appear in output/evidence.

**Acceptance:** challenge -> verify -> second verify -> revoke uses the injected
port; second consume is rejected; hashes, TTLs, RLS ownership, and revocation
pass; mapped errors are stable.

**Failure/hard stops:** `501`, `Map` authority, plaintext credential,
non-atomic consume, replay, wrong-wallet lookup, raw database error, or a
service-role default. `SUPABASE_SERVICE_ROLE_KEY` is not required by default;
making it necessary requires a separately reviewed RLS-safe decision and a new
PVL blocker resolution.

**AICD/evidence/classification:** session/auth and fail-closed security links;
redacted output belongs in the Phase 04 report appendix. Fully automated
local/CI fake/PostgREST contract evidence. No hosted Supabase persistence is
proven. Local tests allow no secrets, RPC, OpenAI, transactions, or hosted
writes; H2 may use a disposable authenticated session only after its own
approval.

### G15 — AI Gateway Runtime Composition

**Purpose and actual files:** Replace the HTTP `501` at
`supabase/functions/ai-gateway/index.ts:217-237` with composition of
`IntentStore`, session middleware, authoritative card snapshot, catalog, and
`OpenAiProvider`. Existing boundaries are
`supabase/functions/ai-gateway/provider-port.ts`,
`supabase/functions/ai-gateway/openai-provider.ts`,
`supabase/functions/ai-gateway/catalog.ts`,
`supabase/functions/_shared/intent-hash.ts`, `errors.ts`, and `redaction.ts`,
`packages/domain/src/api.ts`, `schemas.ts`, `canonical-hash.ts`, and
`config/ai/model-config.json`.

**Focused commands:**

```bash
corepack yarn vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts
corepack yarn vitest run packages/domain/test/provider-config.test.ts packages/domain/test/intent-shape.test.ts packages/domain/test/api-error-codes.test.ts
```

**Full relevant command:** the Common full relevant Vitest command, then
`corepack yarn typecheck`, `corepack yarn lint`, and
`corepack yarn validate:aicd`.

**Required assertions:** assert `allowFallback === false` and the exact
`gpt-5.6-luna` model before fetch; server-only API-key header boundary; raw
fetch; `store:false`; strict `pact_agent_intent`, `additionalProperties:false`,
and only `merchantId`, `amountDecimal`, `purpose`, `confidence`; server-bound
card/agent/asset/recipient/policy/hash; one store write only after validation;
retry once only for 429/502/503; zero persistence on all failure paths.

**Expected output:** actual focused provider/gateway/domain test results. No live
provider result is claimed and no provider body, prompt, key, or raw error is
allowed in output.

**Acceptance:** valid fake composition persists once; wrong region, auth,
model, schema, catalog, malformed output, provider status, and retry-budget
failures produce zero store/payment calls and stable codes.

**Failure/hard stops:** `501`; missing store; fetch before region/config gate;
model drift/fallback; `store:true`; schema expansion; raw leakage; persistence
before validation; retry beyond one; 16th code; raw error; executor/signer
import; or canonicalization drift.

**AICD/evidence/classification:** AC-06/07/08/12 and provider/merchant
security links; redacted focused/full Vitest evidence in the Phase 04 report
appendix. Fully automated local/CI evidence. H1 is hybrid-only and separately
approval-gated. Local G15 allows no OpenAI, RPC, transaction, migration, or
secret operation.

### G16 — Executor Read-Only Runtime Boundary

**Purpose and actual files:** Prove a distinct H2 composition using
`CREDITCOIN_RPC_URL` for read-only card reads and static `preflightPay`, with
server-bound `from=agent`, card/merchant/asset/nonce, and target-chain
assertion. Current source is
`supabase/functions/agent-executor/index.ts:75-208,220-241`,
`chain-client.ts`, `payment-reconciler.ts`,
`supabase/functions/_shared/chain-config.ts`, and tests
`supabase/functions/agent-executor/test/executor.vitest.test.ts` plus the
non-binding Deno `executor.test.ts`.

**Focused command:**

```bash
corepack yarn vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts
```

**Full relevant command:** the Common full relevant Vitest command, then
`corepack yarn typecheck`, `corepack yarn lint`, and
`corepack yarn validate:aicd`.

**Required assertions:** fake transport sees only `eth_chainId`/`eth_call` or
equivalent static calls for G16; chain ID and `from=agent` are checked; client
policy fields are rejected; no `Wallet`, private key, send, broadcast, gas, or
`sendPayment` exists in the read-only path. Existing full executor invariants
remain: first claim/row lock, tx hash before wait, nonce/hash reconciliation,
no second submit, and settled only on receipt status 1.

**Expected output:** actual focused test results and transport call list. No RPC
or transaction result is claimed.

**Acceptance:** wrong chain/decline fails closed; stable decision/reason/chain
ID/time is returned; no signer/key/broadcast occurs; existing idempotency and
reconciliation tests remain green.

**Failure/hard stops:** signer or `AGENT_SIGNER_PRIVATE_KEY`, broadcast,
transaction, gas, non-static RPC, client-controlled values, wrong chain,
duplicate submit, receipt-0 settlement, or raw RPC error. G16 adds no treasury
authority and must not route H2 through `handleExecute`.

**AICD/evidence/classification:** AC-09/10/11/12 and executor security links;
redacted focused/full Vitest output in the Phase 04 report appendix. Fully
automated local/CI fake-transport evidence. H2 is hybrid-only and separately
approval-gated. Local G16 permits no OpenAI, secrets, transactions, broadcasts,
gas, migrations, or hosted RPC; H2 is capped at three read-only attempts.

### G17 — Health and Runtime Binding Boundary

**Purpose and actual files:** Prove non-secret `GET /health` at the regional
function and fixed edge upstream, exact response shape, correlation header, no
auth, no provider/RPC call, no mutation, and no arbitrary forwarding. Files:
`supabase/functions/_shared/health.ts`, the selected regional entrypoint among
`session/index.ts`, `ai-gateway/index.ts`, and `agent-executor/index.ts`,
`apps/edge/src/index.ts`, `apps/edge/src/upstream.ts`,
`apps/edge/src/rate-limit.ts`, `apps/edge/test/edge.test.ts`, the selected
regional health Vitest file under its function test directory, and
`apps/edge/wrangler.toml`.

**Focused commands:**

```bash
corepack yarn vitest run apps/edge/test/edge.test.ts
corepack yarn vitest run supabase/functions/_shared/test/health.vitest.test.ts
```

If the regional test is placed in an existing function test file, PVL must name
that actual file and command explicitly; ambient globbing is not evidence.

**Full relevant command:** the Common full relevant Vitest command, then the
common typecheck, lint, AICD, secret scan, and diff-check commands.

**Required response:** edge `GET https://<EDGE_ORIGIN>/health` forwards only to
fixed `SUPABASE_REGIONAL_FUNCTION_URL/health`; direct regional health is
`GET https://<REGIONAL_FUNCTION_URL>/health`. Exact JSON keys/types are
`requestId`, `configuredRegion`, `expectedRegion`, `chainId`, `provider`,
`model`, and boolean `modelAvailable`. No bearer, URL secret, key, token,
prompt, raw exception, or unapproved address is returned.

**Binding classification:** `apps/edge/wrangler.toml:8` has a blank
`SUPABASE_REGIONAL_FUNCTION_URL`, and lines 14-15 have no active `RATE_LIMITER`.
These are G17 **binding requirements**, not silently ignored. The URL remains
absent until successful, separately approved G13 output derives the concrete
regional URL; blank URL is not H3 evidence and must fail closed. The active
rate-limit binding is required for deployed G17 acceptance; the current
in-memory limiter is a local test double only. If the deployment platform
cannot provide it, G17 is BLOCKED or explicitly out of scope only through a
new approved contract, never GREEN by the commented placeholder.

**Expected output:** actual focused route results and binding failure behavior;
no hosted URL, region, or liveness result is claimed.

**Acceptance:** local fake fixed-upstream tests pass; blank URL and missing
binding are visibly rejected; no arbitrary upstream or side effect exists; the
applicable Deno function check/bundle succeeds.

**Failure/hard stops:** arbitrary forwarding, blank URL accepted, missing
active rate-limit binding treated as deployment-ready, auth on health,
provider/RPC/database side effect, shape drift, secret leakage, missing
correlation ID, or raw error output.

**AICD/evidence/classification:** AC-07 region/timeout, public-edge trust, and
secret-isolation links; focused/full Vitest and static config evidence in the
Phase 04 report appendix. Fully automated local/CI shape evidence. H3 is
hybrid-only and separately approval-gated; local G17 permits no secrets,
OpenAI, RPC, transaction, migration, or deployment.

### Migration/Schema Verification Boundary

The authoritative migration is
`supabase/migrations/202609080001_sessions_and_intents.sql`, including session
hash/TTL predicates, atomic consume, intents, and `payment_attempts`. There is
currently no repository command that safely and read-only verifies the live
migration/schema without a database connection, reset, or migration operation.
Therefore the exact blocker is recorded rather than invented:

> **BLOCKER:** no safe/read-only repository migration/schema verification
> command exists. `corepack yarn test:db` performs a local database reset and is
> prohibited in this plan-only session. No migration/schema pass may be claimed
> until a separately approved read-only verifier or database lane exists.

Source inspection and G14 contract fixtures do not prove live schema state. Any
DDL discrepancy is a blocked implementation finding, not permission to run or
rewrite a migration.

### Regression, AICD, Secret, Diff, and Net Gate

After implementation, with explicit approval, run and record actual output for:

```bash
corepack yarn vitest run packages/domain/test
corepack yarn vitest run apps/edge/test/edge.test.ts
corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

The six Deno 2.9.6 commands above are required where applicable, but local
success remains non-hosted evidence. G13 alone may claim deployment acceptance,
using its separately approved staging/disposable target. H1-H3 may never be
folded into G13 or inferred from local checks.

G14-G17 net acceptance requires all four focused gates, the full relevant
Vitest suite, typecheck, lint, AICD, secret scan, diff check, and applicable
Deno checks to execute after implementation with recorded output. Any focused
failure, schema/binding blocker, raw error, secret-shaped output, 16th code,
production target, non-static RPC, transaction, signer, unapproved OpenAI call,
migration execution, or behavior drift is a hard stop.

**Classification matrix:**

| Gate | Local/CI or hybrid | Secrets | RPC | OpenAI | Transactions | AICD linkage | Evidence path |
|---|---|---|---|---|---|---|---|
| G14 | Fully automated local/CI fake/PostgREST contract; hosted persistence hybrid | No | No | No | No | Session/auth and fail-closed security invariants | Phase 04 report appendix, redacted |
| G15 | Fully automated local/CI fake provider/store; H1 hybrid | No | No | No | No | AC-06/07/08/12 and provider/merchant boundaries | Phase 04 report appendix, redacted |
| G16 | Fully automated local/CI fake transport; H2 hybrid | No | Fake static transport only | No | No | AC-09/10/11/12 and executor security invariants | Phase 04 report appendix, redacted |
| G17 | Fully automated local/CI shape/config; H3 hybrid | No | No | No | No | AC-07 region/timeout, edge trust, secret isolation | Phase 04 report appendix, redacted |

**READY FOR PVL rule:** the delta is READY FOR PVL only after the allowed plan
artifact validator, plan discovery, context discovery, protocol discovery/
wiring, secret scan, `git diff --check`, and original V1-V7 byte-identity
comparison against an available baseline complete without modifying historical
artifacts. It is not READY FOR EXECUTE, G13, or H1-H3 approval.

**Required preservation statement:** G13 remains deployment-only GREEN; H1-H3
remain separate approval-gated lanes; no raw errors or 16th code are allowed;
no production target is allowed; no behavior drift is allowed; and Deno local
checks do not prove hosted deployment.

## Amendment — G14-G17 Runtime Delta Clarification

generated_by: vc-plan-agent
date: 2026-09-11
amendment_scope: G14-G17 delta only
status: READY FOR PVL

This amendment is additive to the existing G14-G17 delta and is the current
planning input for the next PVL. It does not rewrite the original V1-V7
Validate Contract, its prior delta, the original G13 failure evidence, the
Phase 04 plan/report historical evidence, migrations, implementation, or
unrelated infrastructure. The original G13 failure remains preserved
verbatim. The later successful G13 deployment correction is recorded below as
deployment-only historical process evidence; it does not authorize H1-H3.

### Exact Future Test Paths and RED/GREEN Contract

The first EXECUTE increment MUST create these exact test files. Their absence
before EXECUTE is expected RED and is not evidence of a test failure in this
plan-only session:

- `supabase/functions/_shared/test/session-runtime.vitest.test.ts`
- `supabase/functions/_shared/test/ai-gateway-runtime.vitest.test.ts`
- `supabase/functions/_shared/test/agent-executor-runtime.vitest.test.ts`
- `supabase/functions/_shared/test/health.vitest.test.ts`

The exact RED commands are:

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/ai-gateway-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/agent-executor-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/health.vitest.test.ts
```

Each command's expected pre-EXECUTE failure is the runner's missing-test-file
result, `No test files found`, with exit code `1`; this is an expected RED
contract, not observed output. The first EXECUTE must create each file, rerun
the same exact command, and obtain exit code `0` with that file's Vitest
passing-file/passing-test summary.
Neither the RED nor GREEN output is claimed as run by this amendment, and no
test count is invented.

### G14 — Session Adapter Contract

G14 MUST use a fake/PostgREST-shaped adapter contract behind an injected
`SessionPersistence` port. The fake must model PostgREST response/error
shapes, atomic update semantics, and zero-row results; it must not be called
Supabase evidence. The adapter boundary MUST:

- store only lowercase SHA-256 64-hex `nonce_hash` and `token_hash`; never
  store plaintext nonce, token, bearer, signature, or HMAC secret;
- enforce a five-minute challenge TTL and a thirty-minute session TTL;
- consume exactly once using the equivalent of
  `UPDATE session_challenges SET consumed_at=now() WHERE nonce_hash=$1 AND consumed_at IS NULL RETURNING ...`;
- map a zero-row consume, including replay, to `AUTH_INVALID` and issue no
  session;
- revoke and look up by hash plus wallet binding, rejecting expired/revoked
  sessions;
- keep `SESSION_HMAC_SECRET` function-only, with versioned current/previous
  verification overlap of no more than one session TTL;
- expose an RLS-safe boundary that cannot accept caller-selected role, wallet,
  session ownership, or raw bearer authority, and cannot read another wallet;
- use the existing migration as the local DDL authority without changing or
  executing it.

Remote schema parity is **UNKNOWN / HYBRID-ONLY** when no safe read-only
verifier exists. Source inspection and a fake/PostgREST contract do not prove
remote parity. This is a hard stop before H1: no H1 provider call, and no
H1-H3 approval handoff, may proceed until a separately approved read-only
schema verifier proves parity or records a reviewed blocker. `SUPABASE_SERVICE_ROLE_KEY`
is not a default or prerequisite; introducing it requires a separate
RLS-safe security decision and PVL blocker resolution.

Migration classification: `supabase/migrations/202609080001_sessions_and_intents.sql`
is **read-only schema authority / HYBRID-ONLY parity input**. No migration,
database reset, `supabase db push`, local reset, or DDL rewrite is in scope.
`corepack yarn test:db` is explicitly prohibited for this amendment because
the script performs `supabase db reset --local`.

### G15 — Gateway Contract

G15 MUST use the exact provider/model/schema/mapper/retry contract below:

- Provider is OpenAI through raw `fetch` only, behind `AiProvider`; no OpenAI
  SDK, provider substitution, or fallback.
- Model is exactly `gpt-5.6-luna`; `config/ai/model-config.json` is the sole
  truth and `allowFallback === false` MUST be asserted before fetch.
  `OPENAI_MODEL` is unset-or-exact only.
- The request uses `store:false`, strict schema name `pact_agent_intent`,
  `additionalProperties:false`, and exactly `merchantId`, `amountDecimal`,
  `purpose`, and `confidence` as model output fields.
- The server resolves card, agent, native asset, recipient, allowlist,
  policy version, expiry, and canonical hash. Model/client recipient, address,
  asset, card, and nonce authority is rejected.
- The existing closed 15-code mapper remains exact and closed:
  `AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_EXPIRED`, `INPUT_INVALID`,
  `NETWORK_CONFIG_INVALID`, `PROVIDER_UNAVAILABLE`,
  `PROVIDER_MODEL_UNAVAILABLE`, `PROVIDER_OUTPUT_INVALID`,
  `REGION_MISMATCH`, `CARD_NOT_ELIGIBLE`, `PREFLIGHT_DECLINED`,
  `PAYMENT_BROADCAST_TIMEOUT`, `PAYMENT_FAILED`,
  `PAYMENT_RECONCILIATION_REQUIRED`, `RATE_LIMITED`.
- Raw provider body, prompt, authorization header, API key, and raw exception
  are redacted from response, logs, persistence, and evidence. Request ID and
  safe provider attribution may remain.
- Retry exactly once, only for HTTP `429`, `502`, or `503`, reusing the same
  correlation identity. A retry is never a payment retry.
- Persist exactly once, only after session, region, provider, model, schema,
  catalog, canonicalization, and shared validation succeed. Every failure
  path has zero intent/payment persistence and zero chain calls.

### G16 — Read-Only Executor Contract

G16 MUST read `CREDITCOIN_RPC_URL` and construct only a read-only provider.
The transport may use `eth_chainId`, `eth_call`, and static policy/card reads;
it MUST NOT construct a signer, load or reference
`AGENT_SIGNER_PRIVATE_KEY`, sign, broadcast, estimate a submission, or call
`sendPayment`. H2 is not permitted to route through `handleExecute`.

The static call MUST use server-bound card, merchant, native asset, recipient,
agent `from`, and card-scoped nonce; client-supplied policy values are rejected.
Configured Creditcoin chain identity is asserted before the call. Wrong-chain
or declined results are stable `NETWORK_CONFIG_INVALID` or
`PREFLIGHT_DECLINED` outcomes. Acceptance requires zero transactions,
zero gas, zero signer operations, zero broadcast calls, and zero-payment
side effects.

The full execute path retains first-claim/row-lock idempotency, stores
`txHash` before waiting, reconciles by stored hash and `findByNonce` before
any retry, never submits twice, and classifies settlement only from
`receipt.status === 1`. An uncertain outcome is never settled and maps to
`PAYMENT_RECONCILIATION_REQUIRED`; a reverted receipt is never settled.

### G17 — Health Contract

G17 MUST implement the exact function `ai-gateway` at
`supabase/functions/ai-gateway/index.ts`. Its public contract is:

- `GET /health` only; no bearer or demo credential required;
- success status `200` with exactly these safe JSON keys and types:

```json
{
  "requestId": "req-...",
  "configuredRegion": "us-east-1",
  "expectedRegion": "us-east-1",
  "chainId": 102031,
  "provider": "openai",
  "model": "gpt-5.6-luna",
  "modelAvailable": false
}
```

`requestId` is a non-secret correlation value; `modelAvailable` is boolean.
The safe response contains no secret, token, prompt, provider/RPC/DB error,
signer value, wallet private key, or unapproved address. The route performs
no provider call, RPC call, database mutation, wallet/signer operation, or
transaction. Unsupported methods/paths receive the existing stable mapped
client error/status contract and do not execute health side effects.

The exact focused health command is:

```bash
corepack yarn vitest run supabase/functions/_shared/test/health.vitest.test.ts
```

The deployment URL is derived only from successful G13 output; it is never
invented in committed config or plan evidence. H3 must record the concrete
URL, expected region, actual region, and match result only after deployment,
plus the exact non-secret response. A regional health result alone does not
prove edge binding or region parity.

If the approved deployment path is Supabase-only and does not deploy the
Cloudflare Worker, `apps/edge/wrangler.toml:8` blank
`SUPABASE_REGIONAL_FUNCTION_URL` and the missing active `RATE_LIMITER`
binding at lines 14-15 are explicitly **out of scope for this G17 lane**.
They remain configuration placeholders, are not modified, and cannot be
used as H3 evidence. If an edge deployment path is later selected, they are
separate deployment prerequisites and a new approved delta is required;
G17 cannot silently treat the placeholders as deployed edge proof.

### G13 Process Correction

Later successful session/process evidence corrected the prior pending status:
G13 succeeded for Supabase project `myotkovmgzdabuirkqlx`; all three
functions `session`, `ai-gateway`, and `agent-executor` were reported
`ACTIVE`. No migration, transaction, H1, H2, or H3 operation is implied by
that correction. The original G13 failure evidence remains preserved
verbatim and is not deleted, rewritten, or replaced. Current classification:
**G13 GREEN, deployment-only**. The regional function URL is still output
derived and may not be filled from a placeholder or guessed value.

### Exact Command Matrix

These commands are future EXECUTE gates only. No output is claimed here.

Focused runtime tests:

```bash
corepack yarn vitest run supabase/functions/_shared/test/session-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/ai-gateway-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/agent-executor-runtime.vitest.test.ts
corepack yarn vitest run supabase/functions/_shared/test/health.vitest.test.ts
```

Full relevant Vitest:

```bash
corepack yarn vitest run packages/domain/test apps/edge/test supabase/functions/_shared/test supabase/functions/session/test supabase/functions/ai-gateway/test supabase/functions/agent-executor/test
```

Static repository gates:

```bash
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Per-function Deno 2.9.6 checks and bundles, using the repository's exact
`--no-lock` and `-c` form:

```bash
npx --yes deno check --no-lock -c supabase/functions/session/deno.json supabase/functions/session/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/session/deno.json -o /tmp/opencode/session.js supabase/functions/session/index.ts
npx --yes deno check --no-lock -c supabase/functions/ai-gateway/deno.json supabase/functions/ai-gateway/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/ai-gateway/deno.json -o /tmp/opencode/ai-gateway.js supabase/functions/ai-gateway/index.ts
npx --yes deno check --no-lock -c supabase/functions/agent-executor/deno.json supabase/functions/agent-executor/index.ts
npx --yes deno bundle --no-lock -c supabase/functions/agent-executor/deno.json -o /tmp/opencode/agent-executor.js supabase/functions/agent-executor/index.ts
```

No command in this matrix runs a migration, resets a database, calls OpenAI,
calls RPC, deploys, reads/writes secrets, broadcasts, or accesses a wallet.
`corepack yarn test:db` is prohibited. Deno success remains local bundle
evidence only and cannot substitute for G13 or H1-H3 evidence.

### Process Correction and PVL Gate

This amendment corrects the process record without altering historical
evidence: G13 is later **GREEN deployment-only** for project
`myotkovmgzdabuirkqlx`, while G14-G17 remain planned runtime-boundary gates
and H1-H3 remain separately approval-gated. Remote schema parity is
HYBRID-ONLY UNKNOWN until a safe read-only verifier exists; this is a hard
stop before H1. The amendment is **READY FOR PVL**, not READY FOR EXECUTE,
deployment, migration, or H1-H3.

## Execution-Authorization Clarification — G14-G17 Delta Only

This bounded clarification supplements the existing G14-G17 delta only. It does
not modify original V1-V7, rewrite or delete historical G13 evidence, authorize
implementation outside the selected plan, or claim runtime evidence.

### Local Execute Eligibility

- **LOCAL EXECUTE ELIGIBILITY:** G14-G17 runtime evidence is intentionally absent
  before EXECUTE. Missing future tests are expected RED-first. Local fake-backed
  adapter tests may be implemented and verified without remote schema parity.
  The classification is **CONDITIONAL READY FOR EXECUTE**, not runtime GREEN.
- EXECUTE remains separately explicit and limited to the G14-G17 plan surfaces;
  this clarification does not authorize H1, H2, H3, deployment, migration,
  database reset, provider/RPC calls, secret access, commit, or push.

### Hybrid-Only Boundaries

- **HYBRID-ONLY:** remote migration/schema parity is UNKNOWN/HYBRID-ONLY. There
  is no safe read-only verifier. `corepack yarn test:db` is prohibited. Parity is
  a hard stop before H1 runtime execution, but it is not a blocker for writing
  or testing adapters locally against fakes.
- **G17:** the health test is absent before EXECUTE. The exact future test path is
  `supabase/functions/_shared/test/health.vitest.test.ts`, and the runtime
  entrypoint is `supabase/functions/ai-gateway/index.ts`. The route is `GET
  /health`. The hosted URL and region remain unverified until approved
  deployment evidence exists.
- **G16:** local fakes versus the real `CREDITCOIN_RPC_URL` are hybrid-only.
  Signer use is forbidden and the signer is absent; no signer, private key,
  broadcast, transaction, or gas operation is authorized by this clarification.

### Delta Classification

**CONDITIONAL PASS — READY FOR EXECUTE**

Conditions:

1. The first increment must produce genuine RED evidence.
2. Local GREEN gates must pass using permitted fake-backed tests.
3. No remote schema parity claim may be made.
4. No H1/H2/H3 execution is authorized by this delta.
5. H1-H3 require separate approval after local EVL and approved hosted evidence.
