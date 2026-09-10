---
name: plan:pact-mvp-phase-04-ai-gateway-executor
description: "Pact — Phase 04: wallet session, regional OpenAI gateway, agent executor, and payment APIs"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-04
---

# Phase 04 — AI Gateway & Agent Executor

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–6 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 04 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Turn a natural-language request into a validated, attributed AgentIntent and execute only an on-chain-approved payment through a restricted server-side agent signer.

**Architecture:** Cloudflare Worker is the public edge and holds no provider/payment secret. Supabase regional functions provide wallet-session verification, OpenAI structured-output generation, intent persistence, read-only preflight, and payment execution. The AI gateway cannot sign or call the controller; the executor cannot alter policy; the controller re-checks every payment.

**Tech Stack:** Supabase Edge Functions/Deno, Cloudflare Workers/TypeScript, OpenAI Responses API, ethers v6, Zod, Vitest, HMAC/EIP-191 wallet signatures.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- OpenAI is the only provider and gpt-5.6-luna is the configured default; no fallback or silent model substitution.
- Browser and Cloudflare Worker never receive OPENAI_API_KEY, AGENT_SIGNER_PRIVATE_KEY, ASC_RELAYER_PRIVATE_KEY, or service-role secrets.
- Cloudflare forwards only validated requests to the configured regional Supabase function URL; the regional relay is a routing choice, not a provider-policy bypass.
- AgentIntent is schema-valid but not financial authority. Card/agent/asset/merchant recipient are server-bound and re-read from chain/catalog.
- The gateway consumes the Phase 01 `AgentIntentSchema`, `CanonicalIntentInput`,
  `canonicalIntentHash`, and `merchantIdToBytes32` exports; it must not duplicate
  canonicalization locally. `policyVersion` is read from the on-chain card/policy
  snapshot and is included in the returned intent and hash input.
- Native asset conversion uses the Phase 01 descriptor for logical ID, EVM address,
  symbol, and decimals. The model can request only the logical asset ID and catalog
  merchant ID, never an address or alternate asset.
- API error codes are a stable mapping of the Phase 01 DomainError union; adding a
  gateway-only string code requires a plan supplement and shared contract test.
- Executor accepts only intentId and idempotency data, then reads authoritative chain state and calls controller.pay with a gas-only agent signer.
- Provider error, malformed output, unsupported region/model, wrong chain, or receipt timeout fails closed and makes no new payment attempt.
- Session tokens are short-lived, wallet-bound, hashed at rest, and replay-protected by one-time challenges.
- Real OpenAI calls are cost-bearing and require the phase validate-contract and explicit hybrid-lane approval.

---

## Overview

This phase creates the off-chain path that makes Pact feel autonomous without making the AI trustworthy by default. It implements wallet session binding, the Cloudflare-to-regional-Supabase boundary, strict OpenAI structured output, read-only preflight, and server-side payment execution. It does not implement the browser screens or the final read model.

## Entry Gate

- Phases 01–03 are ✅ VERIFIED or Phase 03 has a documented proof backlog that does not weaken controller authority.
- packages/domain and packages/pact-sdk exports exist.
- Read process/context/all-context.md, follow process/context/tests/all-tests.md,
  then read process/context/tests/backend-tests.md.
- The deployment manifest contains a concrete target chain ID for local tests; provider live access is separately gated.
- Supabase local CLI and Wrangler test commands are available; no production project is used for local tests.

## Phase Loop Progress

- [x] 1. RESEARCH — inspect Phase 02 SDK/events, Phase 03 evidence state, Supabase/Deno runtime, OpenAI structured-output contract, and Cloudflare worker bindings
- [x] 2. INNOVATE — choose signed wallet challenge + HMAC session and separate AI/executor functions; record rejected browser-key and AI-direct-settlement alternatives
- [x] 3. PLAN-SUPPLEMENT — update API/type/rate-limit touchpoints if runtime constraints change
- [ ] 4. PVL — vc-validate-agent writes V1–V7 contract with automated, hybrid, and agent-probe gates
- [ ] 5. EXECUTE — complete Tasks 1–6 and run each section gate immediately
- [ ] 6. EVL — rerun tests, local edge-to-function smoke, no-chain-call failures, and auth/rate-limit probes
- [ ] 7. UPDATE PROCESS — write report, update umbrella/downstream plans, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Define API envelopes, session types, and boundary errors

**Files:** Create supabase/functions/_shared/api.ts, auth.ts, errors.ts, redaction.ts, chain-config.ts, packages/domain/src/api.ts, packages/domain/test/api-contracts.test.ts.

**Stable API envelopes:**

~~~typescript
type ApiError = {
  requestId: string;
  code: string;
  message: string;
  retryable: boolean;
};

type IntentRequest = {
  cardId: string;
  prompt: string;
};

type IntentResponse = {
  requestId: string;
  intentId: string;
  intent: AgentIntent;
  status: "ready";
};

type PreflightResponse = {
  requestId: string;
  intentId: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  chainId: number;
  checkedAt: string;
};

type ExecuteResponse = {
  requestId: string;
  intentId: string;
  paymentId: string;
  status: "pending" | "settled" | "declined" | "failed";
  txHash?: string;
  explorerUrl?: string;
  reasonCode?: string;
};
~~~

- [ ] 1.1. Write failing contract tests for required fields, stable status values, redacted errors, maximum prompt length 2,000 characters, and missing requestId rejection.
- [ ] 1.2. Re-export the Phase 01 DomainError code union and map it to API errors: AUTH_REQUIRED, AUTH_INVALID, AUTH_EXPIRED, INPUT_INVALID, NETWORK_CONFIG_INVALID, PROVIDER_UNAVAILABLE, PROVIDER_MODEL_UNAVAILABLE, PROVIDER_OUTPUT_INVALID, REGION_MISMATCH, CARD_NOT_ELIGIBLE, PREFLIGHT_DECLINED, PAYMENT_BROADCAST_TIMEOUT, PAYMENT_FAILED, PAYMENT_RECONCILIATION_REQUIRED, RATE_LIMITED. Do not introduce an untyped `string` escape hatch.
- [ ] 1.3. Implement shared parsing/redaction helpers; errors expose category and requestId but never provider response body, authorization header, prompt secrets, or key material.
- [ ] 1.4. Run yarn vitest run packages/domain/test/api-contracts.test.ts and expect failure before exports exist.
- [ ] 1.5. Implement the types and run focused tests.

Run: yarn vitest run packages/domain/test/api-contracts.test.ts && yarn typecheck  
Expected: PASS.
- [ ] 1.6. Commit API/domain contracts.

### Task 2 — Implement wallet challenge and short-lived session

**Files:** Create supabase/migrations/202609080001_sessions_and_intents.sql, supabase/functions/session/index.ts, supabase/functions/session/test/session.test.ts, supabase/functions/_shared/session-token.ts, scripts/test-session-flow.mjs.

**Routes:**

~~~text
POST /v1/session/challenge
POST /v1/session/verify
POST /v1/session/revoke
~~~

- [ ] 2.1. Write tests for challenge expiry, one-time consumption, wrong signature, wrong address, expired token, revoked token, and session wallet binding.
- [ ] 2.2. Run session tests before implementation.

Run: deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts  
Expected: FAIL because the session function and migration are absent.

- [ ] 2.3. Add session_challenges with nonce hash, wallet address, expires_at, consumed_at; add sessions with token hash, wallet address, role, issued_at, expires_at, revoked_at; index nonce/token hashes.
- [ ] 2.4. Generate a cryptographically random nonce, store only its hash, return an EIP-191 message with domain, chain label, wallet, nonce, issued-at, and expiry.
- [ ] 2.5. Verify the wallet signature with ethers verifyMessage, consume the challenge atomically, issue an HMAC-signed token containing session ID, wallet, role, issued-at, and expiry, and store only the token hash.
- [ ] 2.6. Make session middleware require a valid wallet-bound token for intent/preflight/execute; demo authorization uses a separate explicitly configured demo token and cannot access secrets.
- [ ] 2.7. Run session tests and the local function.

Run: deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts && supabase functions serve session --env-file .env.local  
Expected: tests pass; local function starts without production URL.
- [ ] 2.8. Commit migration and session boundary.

### Task 3 — Implement the regional OpenAI gateway

**Files:** Create supabase/functions/ai-gateway/index.ts, supabase/functions/ai-gateway/openai-provider.ts, supabase/functions/ai-gateway/catalog.ts, supabase/functions/ai-gateway/test/ai-gateway.test.ts, supabase/functions/_shared/intent-hash.ts, config/ai/merchant-catalog.json.

**Route:** POST /v1/agent/intents.

**Provider boundary:**

~~~typescript
interface AiProvider {
  parseIntent(input: {
    prompt: string;
    card: OnChainCardSnapshot;
    merchants: ReadonlyArray<MerchantCatalogItem>;
    model: string;
  }): Promise<ProviderIntentResult>;
}

type ProviderIntentResult = {
  provider: "openai";
  model: string;
  merchantId: string;
  amountDecimal: string;
  purpose: string;
  confidence: number;
};
~~~

- [ ] 3.1. Write failing gateway tests for valid structured output, malformed JSON, provider 401/429/5xx, model unavailable, wrong execution region, unknown merchant, prompt too long, model-supplied recipientAddress, and card/asset mismatch.
- [ ] 3.2. Add a deterministic FakeAiProvider for automated tests; it returns fixtures only and is never used by the live route.
- [ ] 3.3. Implement OpenAiProvider using the Responses API with model from OPENAI_MODEL, store false, strict JSON schema named pact_agent_intent, and no fallback branch. Include provider request ID and latency in redacted logs.
- [ ] 3.4. Constrain model input to merchant IDs/catalog labels and the selected card’s policy; resolve card ID, agent, asset, recipient, and allowlist outside model output.
- [ ] 3.5. Check Deno execution region against configured SUPABASE_FUNCTION_REGION and return REGION_MISMATCH before provider call when wrong.
- [ ] 3.6. Parse decimal amount with the Phase 01 native asset descriptor, calculate amountBaseUnits with ethers parseUnits, obtain policyVersion from the authoritative card snapshot, build the shared canonical intentHash, set a canonical UTC expiresAt, and persist provider/model attribution plus intent status.
- [ ] 3.7. Add a capability check that fails startup or the first live request with PROVIDER_MODEL_UNAVAILABLE when gpt-5.6-luna cannot be accessed; do not choose another model.
- [ ] 3.8. Run automated gateway tests and assert payment client call count remains zero for every provider/schema failure.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts  
Expected: PASS; every fail-closed case has zero chain-call count.
- [ ] 3.9. Commit gateway/provider code and non-authoritative merchant catalog.

### Task 4 — Implement Cloudflare public edge

**Files:** Create apps/edge/package.json, apps/edge/src/index.ts, apps/edge/src/rate-limit.ts, apps/edge/src/upstream.ts, apps/edge/src/types.ts, apps/edge/wrangler.toml, apps/edge/test/edge.test.ts.

**Boundary:** Cloudflare validates method/path/body size, request ID, session/demo header shape, and rate limit, then forwards to one configured regional Supabase URL. It never imports OpenAI or signer code.

- [ ] 4.1. Write Worker tests for request size >64 KB, unsupported method/path, missing auth header, rate-limit response, correlation header propagation, upstream timeout, and upstream 4xx/5xx mapping.
- [ ] 4.2. Implement the Worker with a 64 KB body limit, explicit CORS allowlist from environment, 30 requests per minute binding, AbortController timeout, and redacted structured logs.
- [ ] 4.3. Configure wrangler with SUPABASE_REGIONAL_FUNCTION_URL, ALLOWED_ORIGIN, and RATE_LIMITER binding; leave secrets out of committed config.
- [ ] 4.4. Verify the Worker never references OPENAI_API_KEY or AGENT_SIGNER_PRIVATE_KEY by running the secret scanner over apps/edge.
- [ ] 4.5. Run Worker tests.

Run: yarn vitest run apps/edge/test/edge.test.ts && node scripts/check-no-secrets.mjs  
Expected: PASS and no secret references.
- [ ] 4.6. Commit the edge boundary.

### Task 5 — Implement the agent executor, preflight, and idempotent payment execution

**Files:** Create supabase/functions/agent-executor/index.ts, chain-client.ts, payment-reconciler.ts, supabase/functions/agent-executor/test/executor.test.ts, packages/domain/src/payment.ts, packages/domain/test/payment.test.ts.

**Routes:**

~~~text
POST /v1/payments/preflight
POST /v1/payments/execute
~~~

**Executor boundary:**

~~~typescript
interface PaymentClient {
  readCard(cardId: string): Promise<OnChainCardSnapshot>;
  preflight(input: PayInput): Promise<PreflightResult>;
  sendPayment(input: PayInput): Promise<{ txHash: string }>;
  waitForReceipt(txHash: string): Promise<ReceiptResult>;
  findByNonce(cardId: string, nonce: string): Promise<ReceiptResult | null>;
}
~~~

- [ ] 5.1. Write failing tests for owner/session mismatch, intent missing/expired, card state changed after intent, preflight decline, signer chain mismatch, gas-only signer, successful receipt, reverted receipt, broadcast timeout, and duplicate idempotency key.
- [ ] 5.2. Implement chain-client with ethers JsonRpcProvider, Wallet from AGENT_SIGNER_PRIVATE_KEY only inside the function, controller ABI from packages/pact-sdk, and an explicit chain ID assertion.
- [ ] 5.3. Implement preflight as a static controller preflightPay call using server-bound card/merchant/asset and a card-scoped nonce; never trust a client nonce or recipient.
- [ ] 5.4. Implement execute to lock intentId/idempotency key, re-read card/merchant/network, static-call preflight, send controller.pay, store txHash before waiting, wait for one confirmation, and classify receipt status.
- [ ] 5.5. On timeout, call findByNonce and transaction receipt lookup before any retry; if neither proves outcome, return PAYMENT_RECONCILIATION_REQUIRED and do not submit a second transaction.
- [ ] 5.6. Return settled only for receipt.status == 1 and later let the indexer confirm matching PaymentSettled; no API response alone is the final UI truth.
- [ ] 5.7. Run executor tests with a fake PaymentClient and assert the signer/private key never appears in response/log fixtures.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/agent-executor/test/executor.test.ts && yarn vitest run packages/domain/test/payment.test.ts  
Expected: PASS; provider/chain errors are fail-closed and duplicate execution has one sendPayment call.
- [ ] 5.8. Commit executor and payment types.

### Task 6 — Local edge-to-function smoke and regression

**Files:** Create scripts/smoke-edge-gateway.mjs, supabase/functions/_shared/health.ts, docs/runbook/local-runtime.md. Extend package.json and process/context/tests/backend-tests.md only through an approved plan-supplement, preserving Phase 01 command semantics and existing routing sections.

- [ ] 6.1. Add health responses exposing requestId, configured region, expected region, chain ID, provider name, and model availability without exposing secrets.
- [ ] 6.2. Start local session, AI gateway fake provider, executor fake client, and Worker; exercise challenge → verify → intent → preflight → execute.
- [ ] 6.3. Exercise malformed provider and over-limit fixture; assert no transaction call and a visible reason code.
- [ ] 6.4. Run the local smoke and Phase 01/02/03 regression suites.

Run: node scripts/smoke-edge-gateway.mjs && yarn test && yarn typecheck && yarn validate:aicd  
Expected: PASS with correlation IDs present and no secret output.
- [ ] 6.5. Commit runtime smoke/runbook updates.

## Acceptance Criteria

- AC-01: wrong chain fails before card setup/payment.
- AC-06: valid natural language becomes a bounded, schema-valid intent.
- AC-07: malformed/unavailable provider, unavailable model, and wrong region stop before any chain call.
- AC-08: stored/displayed intent records actual provider and model; no fallback.
- AC-09/10/11/12: executor preflights, submits only valid controller calls, and reconciles duplicate/timeout paths.
- Security invariants 1–4 and 6: AI is not authority, edge holds no secrets, agent signer cannot change policy, recipients are catalog-bound.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| OpenAI response shape differs across model/account | High | strict provider adapter, capability check, fixture tests, fail closed |
| Cloudflare directly reaches provider territory restriction | High | Worker calls only configured regional Supabase function; log expected/actual region |
| Wallet challenge replay | Critical | hashed one-time nonce, atomic consume, short-lived HMAC session |
| Agent signer submits twice after timeout | Critical | intent/idempotency lock, store txHash before wait, reconcile nonce/receipt |
| AI invents recipient/asset/card | Critical | model returns merchant ID only; server resolves card/asset/recipient and controller rechecks |
| Supabase service-role leak | Critical | function-only secret, Worker/browser scanner, no client bundle import |
| Provider failure still triggers payment | Critical | provider tests spy on payment client; gateway never imports executor signer |
| Rate-limit binding absent | Medium | Worker fails closed or uses explicit local fake; deployment preflight checks binding |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| wrong-chain wallet | 4xx NETWORK_CONFIG_INVALID, zero mutation | automated |
| invalid wallet signature | session rejected | automated |
| replayed challenge | second verify rejected | automated |
| gpt-5.6-luna unavailable | PROVIDER_MODEL_UNAVAILABLE, zero chain call | automated/hybrid |
| malformed model output | PROVIDER_OUTPUT_INVALID, zero chain call | automated |
| model outputs raw recipient | schema/catalog rejection | automated |
| wrong Supabase region | REGION_MISMATCH before provider call | automated/hybrid |
| timeout after broadcast | reconcile by nonce/tx hash, no duplicate | automated |
| receipt status 0 | failed state, no settled UI | automated |
| worker upstream timeout | structured retryable error | automated |
| >64 KB prompt | request rejected before function | automated |

## Security Review

STRIDE covers wallet spoofing, request/policy tampering, correlation/audit logs, provider/secret disclosure, request floods, and privilege escalation. OWASP priorities are broken access control, cryptographic failures, injection into model prompts/catalog, security misconfiguration, and SSRF-style upstream abuse. The Worker allowlist and fixed Supabase URL prevent arbitrary upstream forwarding; the executor accepts intent references instead of calldata.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| domain/API/payment tests | yarn vitest run packages/domain/test | automated | Vitest |
| Deno functions | deno test --allow-env --allow-net --allow-read supabase/functions/*/test | automated | Deno output |
| Worker | yarn vitest run apps/edge/test | automated | Worker output |
| no-chain-call failures | provider/executor spy assertions | automated | call-count evidence |
| local route | node scripts/smoke-edge-gateway.mjs | hybrid | redacted smoke log |
| auth/UX errors | inspect response copy and request IDs | agent-probe | review note |
| live OpenAI | approved deployment env with gpt-5.6-luna capability check | hybrid | provider metadata |

## Touchpoints

- supabase/functions/_shared, session, ai-gateway, agent-executor
- supabase/migrations/202609080001_sessions_and_intents.sql
- apps/edge and apps/edge/wrangler.toml
- packages/domain/src/api.ts, payment.ts and tests
- scripts/smoke-edge-gateway.mjs, config/ai/merchant-catalog.json, docs/runbook/local-runtime.md

## Public Contracts

- POST /v1/session/challenge, /verify, /revoke; /v1/agent/intents; /v1/payments/preflight; /v1/payments/execute use the envelopes in Task 1.
- Intent response always includes provider/model; execute response never claims indexed settlement.
- Cloudflare upstream is fixed to one configured regional Supabase function URL.
- No endpoint accepts raw calldata, recipient address, private key, or arbitrary provider/model.

## Blast Radius

Off-chain session, AI, executor, edge, domain API, and one session/intent migration are changed. Payment contract authority is consumed, not modified. Indexer/read model and UI are downstream.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| valid structured intent | Automated | AC-06 |
| provider/model failure no-chain-call | Automated | AC-07, AC-08 |
| session replay/expiry | Automated | security invariant |
| preflight policy mirror | Automated | AC-10, AC-11 |
| timeout reconciliation | Automated | AC-12 |
| local edge-to-function flow | Hybrid | autonomous path |
| live provider/region | Hybrid | AI/regional constraint |
| error-state review | Agent-Probe | AC-07 |

## Test Procedure

Read process/context/all-context.md, follow process/context/tests/all-tests.md, then read process/context/tests/backend-tests.md. Run:
yarn vitest run packages/domain/test
deno test --allow-env --allow-net --allow-read supabase/functions/session/test/session.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/agent-executor/test/executor.test.ts
yarn vitest run apps/edge/test
node scripts/smoke-edge-gateway.mjs
yarn typecheck
yarn lint
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check

## Data Verification

- Intent records include actual provider/model, requestId, cardId, merchantId, amount base units, hash, expiry, and status.
- No intent or API response contains recipient address, private key, OpenAI key, raw prompt secret, or calldata.
- Session tables contain hashes, not bearer tokens or signatures.
- Execute stores txHash before waiting and can reconcile by nonce/idempotency.
- Region diagnostics show expected/actual region without secret values.

## Manual Test

Using local fake provider and fake payment client, run one valid request and one malformed request. Confirm valid request displays intent fields, malformed request shows provider error, and both have zero live testnet calls. Review Worker rejects an oversized body and never forwards an arbitrary URL.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All six tasks are complete; Deno/Node/Worker tests pass; local smoke evidence exists; provider failure has zero chain-call proof; session replay and executor reconciliation pass; Phase 03/02 regressions pass; live provider/region evidence is recorded or honestly blocked; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase creates the cross-runtime function test commands used by Phase 05 and Phase 07. It also creates the first session/intent migration; Phase 05 must preserve its token-hash and intent-attribution fields when adding the read model. If local Supabase cannot run, keep deterministic function tests green and record the exact local-runtime blocker.

## Exit Gate

~~~bash
yarn vitest run packages/domain/test
deno test --allow-env --allow-net --allow-read supabase/functions/session/test/session.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts
deno test --allow-env --allow-net --allow-read supabase/functions/agent-executor/test/executor.test.ts
yarn vitest run apps/edge/test
node scripts/smoke-edge-gateway.mjs
yarn typecheck
yarn lint
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- gpt-5.6-luna cannot be accessed and no permitted fallback exists.
- Supabase cannot expose the selected region or cannot invoke the configured function route.
- Session authentication can be replayed or bearer tokens are stored in plaintext.
- Executor cannot reconcile a broadcast timeout without duplicate risk.
- Cloudflare Worker would need provider/payment secrets or arbitrary upstream routing.
- PVL cannot write exact Deno/Worker/provider test gates.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; live OpenAI is gated.
- On ✅ VERIFIED, continue to phase-05-indexer-read-model_PLAN_08-09-26.md.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

---

## Plan Supplement — 10-09-26 (INNOVATE decisions)

**Provenance (frozen, do not re-debate):**
- RESEARCH reuse: `AgentIntentSchema`, `canonicalIntentHash`, `merchantIdToBytes32`, `loadOpenAIConfig(gpt-5.6-luna, allowFallback false)`, controller `pay` + `preflightPay` with read-only static-call `from=agent`, ASC-only hook, `availableCredit`; greenfield `supabase/`, `apps/edge/`, catalog, smoke scripts; no `openai` dependency; Deno + Supabase CLIs missing (wrangler + playwright present).
- INNOVATE frozen: (a) A3, (b) B1, (c) C3, (d) D-combined, (e) E1+E2 local + E3 hybrid, plus S1–S7 below as binding extensions.
- Scope rule: this supplement only narrows/extends Tasks 1–6. No prior section semantics change. Any conflict between this supplement and prior text resolves in favor of this supplement plus its required test.

### 1. Decision record

| Area | Chosen | Rejected | Rationale |
|---|---|---|---|
| A. Provider transport + output shape (A3) | A3 raw-fetch-behind-port: narrow provider port, `fetch` to Responses API only inside `supabase/functions/ai-gateway/openai-provider.ts`, pinned `gpt-5.6-luna` via `loadOpenAIConfig` with `allowFallback:false`, strict merchantId-only JSON schema | A1 OpenAI SDK dependency; A2 generic multi-provider adapter with fallback/substitution | No `openai` dep exists and none is added (greenfield + supply-chain minimum); raw fetch keeps secret inside one regional function; pin + `allowFallback:false` enforces Global Constraint no-fallback; merchantId-only output preserves server-bound card/agent/asset/recipient authority |
| B. Error taxonomy (B1) | B1 closed 15-code mapper: exact Task 1.2 list, shared mapper + shared contract test, no `string` escape | B2 open `string` code escape hatch; B3 5-code collapsed union | Phase 01 `DomainError` union is authority; 15 codes are the stable API surface from Task 1.2; escape hatch would break API contracts and redaction audit; collapsed 5-code loses `PROVIDER_MODEL_UNAVAILABLE` / `REGION_MISMATCH` / reconciliation fidelity required by AC-07/AC-12 |
| C. Session (C3) | C3 hybrid session: EIP-191 one-time challenge + HMAC-signed short-lived wallet-bound token, hash-only storage, atomic consume, per Task 2 | C1 stateless JWT-only without server consume list; C2 long-lived bearer / plaintext storage | Replay protection is Critical risk; hash-at-rest + one-time consume + short expiry satisfies Security invariant; hybrid means automated Vitest for token logic + function-shape test, live Supabase persistence proof deferred to hybrid lane |
| D. Executor (D-combined) | D-combined executor: single `agent-executor` owns `preflight` (static `preflightPay`, `from=agent`) + `execute` (`pay`, gas-only signer), server-bound card/merchant/asset, card-scoped nonce, intent/idempotency lock, `findByNonce` reconcile | D-split separate preflight/execute services with duplicated chain clients; D-client-nonce / client-recipient trust | One chain-client prevents policy drift between preflight and execute; static-call-before-send mirrors controller authority; card-scoped nonce + ASC-only hook + `availableCredit` re-read closes double-spend/timeout-duplicate; client values remain untrusted per Global Constraints |
| E. Evidence gates (E1+E2 local, E3 hybrid) | E1 Vitest hermetic + E2 fake-backed Vitest as binding local green; E3 live/regional evidence as hybrid-only | E-all-Deno-gated local green; E-live-un gated local execution | Deno + Supabase CLIs are missing so Deno-gated local green would permanently block; wrangler + Vitest present so edge/domain hermetic green is achievable; live `gpt-5.6-luna` is cost-bearing and region-sensitive, therefore hybrid-gated per Global Constraints |

### 2. Binding task extensions S1–S7

**S1 — Pinned model port (raw-fetch-behind-port, no SDK).**
- Implementation task: extend Task 3 with a narrow `AiProvider` port; the only OpenAI I/O is `fetch` inside the provider module; model value comes only from `loadOpenAIConfig` pinned to `gpt-5.6-luna` with `allowFallback:false`; no `openai` package is added; provider request ID + latency logged redacted-only.
- Exact file/module paths: `supabase/functions/ai-gateway/openai-provider.ts` (fetch + strict schema `pact_agent_intent`, `store:false`), `supabase/functions/ai-gateway/provider-port.ts` (new: `AiProvider` / `ProviderIntentResult` port, no network import), `config/ai/model-config.json` (new: pinned `{ "provider": "openai", "model": "gpt-5.6-luna", "allowFallback": false }`).
- Acceptance criteria: import graph shows no `openai` dep; non-pinned model value cannot reach fetch; `allowFallback` path does not exist; wrong-model config surfaces `PROVIDER_MODEL_UNAVAILABLE` before any chain call.
- Required test: E1 Vitest hermetic `packages/domain/test/provider-config.test.ts` (new, Vitest): pin parsing, fallback-reject, unknown-model reject. E2 fake-backed Vitest for gateway mapper (see S6). Never Deno-gated for local green.
- AICD linkage: AC-07, AC-08; Security invariants 1, 2.
- Gate class: local-only.
- Failure behavior with hard stop: provider 401/429/5xx, malformed JSON, model-unavailable, or config drift → return mapped `ApiError`, zero payment-client calls, no retry as new payment; STOP, do not proceed to preflight/execute.

**S2 — Strict merchantId-only provider schema (reuse canonical exports).**
- Implementation task: extend Tasks 1 + 3: provider output may contain only `{ merchantId, amountDecimal, purpose, confidence }`; gateway reuses Phase 01 `AgentIntentSchema`, `CanonicalIntentInput`, `canonicalIntentHash`, `merchantIdToBytes32` and native asset descriptor; it must not duplicate canonicalization; card ID, agent, asset, recipient, allowlist, `policyVersion` (from on-chain card/policy snapshot), `expiresAt` (canonical UTC) resolved server-side; catalog is non-authoritative display only.
- Exact file/module paths: `supabase/functions/ai-gateway/catalog.ts` (merchantId/catalog-label gating), `supabase/functions/_shared/intent-hash.ts` (thin re-export of Phase 01 hash, no local copy), `config/ai/merchant-catalog.json` (labels + logical IDs only, no addresses), `packages/domain/src/api.ts` (IntentResponse keeps full `AgentIntent`, provider/model attribution required).
- Acceptance criteria: model-supplied `recipientAddress`/address/asset/card/nonce field is schema/catalog-rejected; unknown merchant → reject; amount parsed via Phase 01 descriptor + `parseUnits`; hash input includes server-resolved `policyVersion`; persisted intent records actual provider/model.
- Required test: E1 Vitest hermetic `packages/domain/test/intent-shape.test.ts` (new, Vitest): extra-field reject, unknown-merchant reject, hash-stability via reused canonical fn. E2 fake-backed gateway Vitest (S6) asserts zero chain calls on shape failure. Never Deno-gated for local green.
- AICD linkage: AC-06, AC-08; Security invariants 1, 4, 6.
- Gate class: local-only.
- Failure behavior with hard stop: any shape/catalog/asset/card mismatch → `PROVIDER_OUTPUT_INVALID`, zero chain calls; STOP, no intent persisted as `ready`.

**S3 — Closed 15-code mapper + shared contract test.**
- Implementation task: extend Task 1.2: implement one shared mapper from Phase 01 `DomainError` union to exactly the 15 API codes (`AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_EXPIRED`, `INPUT_INVALID`, `NETWORK_CONFIG_INVALID`, `PROVIDER_UNAVAILABLE`, `PROVIDER_MODEL_UNAVAILABLE`, `PROVIDER_OUTPUT_INVALID`, `REGION_MISMATCH`, `CARD_NOT_ELIGIBLE`, `PREFLIGHT_DECLINED`, `PAYMENT_BROADCAST_TIMEOUT`, `PAYMENT_FAILED`, `PAYMENT_RECONCILIATION_REQUIRED`, `RATE_LIMITED`); no `string` escape; both edge and functions import the same mapper; redaction helper strips provider body/headers/prompt secrets/key material, keeps `requestId` + category.
- Exact file/module paths: `packages/domain/src/api.ts` (closed union + mapper source), `supabase/functions/_shared/errors.ts` (thin re-export, no fork), `supabase/functions/_shared/redaction.ts` (redaction helper), `apps/edge/src/types.ts` (re-export only), `packages/domain/test/api-error-codes.test.ts` (new shared Vitest: closed-union exhaustiveness + mapping fixture).
- Acceptance criteria: adding a 16th code without a further plan supplement fails the shared test; `ApiError.code` type has no `string` escape; edge + function fixtures produce identical code for identical domain error; no secret material in error fixture.
- Required test: E1 Vitest hermetic `packages/domain/test/api-error-codes.test.ts` (binding). Consumed by S6 E2 suites. Never Deno-gated for local green.
- AICD linkage: AC-07; cross-cuts AC-09–AC-12 reason codes.
- Gate class: local-only.
- Failure behavior with hard stop: unmapped/unknown error → `INPUT_INVALID` or `PROVIDER_UNAVAILABLE` per mapper default + alert-shaped log, never raw body passthrough; STOP, schema test blocks merge on escape-hatch regression.

**S4 — Hybrid session (C3) with hash-only storage.**
- Implementation task: implement Task 2 as specified (challenge → verify → revoke routes; nonce-hash + token-hash storage; EIP-191 `verifyMessage`; atomic consume; HMAC token with session ID/wallet/role/issued-at/expiry; wallet-bound middleware for intent/preflight/execute; separate demo token with no secret access), with logic structured so token/nonce logic is Vitest-testable without a live database.
- Exact file/module paths: `supabase/functions/_shared/session-token.ts` (HMAC issue/verify, pure logic), `supabase/functions/_shared/auth.ts` (middleware), `supabase/functions/session/index.ts` (routes), `supabase/migrations/202609080001_sessions_and_intents.sql` (hash columns + indexes, no plaintext token/signature columns).
- Acceptance criteria: challenge expiry, one-time consume, wrong signature/address, expired/revoked token, wallet-binding mismatch all reject; tables hold hashes only; demo token cannot reach intent/preflight/execute secrets path.
- Required test: E1 Vitest hermetic `packages/domain/test/session-token.test.ts` (new, Vitest): HMAC round-trip, expiry, tamper, wrong-wallet reject — binding local green. E2 fake-store-backed Vitest for consume-once/revoke flow. Live Supabase persistence is hybrid-only (see §4). Never Deno-gated for local green.
- AICD linkage: Security invariants (session/auth); AC-07-adjacent fail-closed.
- Gate class: E1/E2 local-only; live-persistence proof hybrid (deferred).
- Failure behavior with hard stop: any auth failure → `AUTH_*` mapped error, no intent/preflight/execute work; replayed challenge second-verify rejected; STOP, no session issued.

**S5 — D-combined executor (static preflight + idempotent pay + reconcile).**
- Implementation task: implement Task 5 as one `agent-executor`: accept only `intentId` + idempotency data; re-read card/merchant/network; ASC-only hook check + `availableCredit` read; static `preflightPay` (`from=agent`) with server-bound values + card-scoped nonce; on pass, `pay` via gas-only signer (`AGENT_SIGNER_PRIVATE_KEY` function-only); store `txHash` before wait; one-confirmation wait; receipt-status classification; timeout → `findByNonce` + receipt lookup before any retry; unproven outcome → `PAYMENT_RECONCILIATION_REQUIRED`, never a second submit; `settled` only on `receipt.status==1` (indexer confirms `PaymentSettled` downstream).
- Exact file/module paths: `supabase/functions/agent-executor/index.ts` (lock → re-read → static-call → send → store-then-wait → classify), `supabase/functions/agent-executor/chain-client.ts` (`JsonRpcProvider` + controller ABI from `packages/pact-sdk`, chain-ID assert, `from=agent` static call), `supabase/functions/agent-executor/payment-reconciler.ts` (new: timeout/nonce-reconcile policy), `packages/domain/src/payment.ts` (status + reason-code types).
- Acceptance criteria: owner/session mismatch, missing/expired intent, card-changed-after-intent, preflight decline, signer chain mismatch, reverted receipt, broadcast timeout, duplicate idempotency key all fail closed with mapped codes; duplicate execute → one `sendPayment`; signer/key never in response/log fixtures; gateway never imports executor signer.
- Required test: E1 Vitest hermetic `packages/domain/test/payment.test.ts` (existing plan path, Vitest — binding): state machine + code mapping. E2 fake-`PaymentClient`-backed Vitest `supabase/functions/agent-executor/test/executor.vitest.test.ts` (new Vitest mirror, fake client + signer spy + zero-duplicate-send assert). Existing Deno `executor.test.ts` retained as CI reference, not local-green gate. Never Deno-gated for local green.
- AICD linkage: AC-09/10/11/12; Security invariants 1, 3, 4.
- Gate class: E1/E2 local-only; live-chain receipt proof hybrid (deferred, §4).
- Failure behavior with hard stop: any preflight decline / state drift / timeout-unproven / receipt-status-0 → mapped decline/fail/reconcile code, no second transaction; STOP, intent locked until reconciled.

**S6 — Local evidence gate E1+E2 (binding green without Deno/Supabase CLIs).**
- Implementation task: make local green achievable with present tooling only (Vitest + wrangler + playwright shapes): E1 pure-hermetic Vitest for config/shape/codes/session-token/payment-machine/edge-validation; E2 fake-backed Vitest for gateway (FakeAiProvider fixtures) and executor (fake PaymentClient) plus Worker upstream-fake smoke; assert zero payment-client calls on every provider/schema/auth failure; secret-scanner shape check over `apps/edge` (no `OPENAI_API_KEY` / `AGENT_SIGNER_PRIVATE_KEY` references).
- Exact file/module paths: `packages/domain/test/provider-config.test.ts` (new E1), `packages/domain/test/intent-shape.test.ts` (new E1), `packages/domain/test/api-error-codes.test.ts` (new E1, S3), `packages/domain/test/session-token.test.ts` (new E1, S4), `packages/domain/test/payment.test.ts` (E1), `apps/edge/test/edge.test.ts` (E1+E2 edge: 64KB/method/path/auth/rate-limit/correlation/timeout/upstream-map), `supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts` (new E2 Vitest mirror, FakeAiProvider), `supabase/functions/agent-executor/test/executor.vitest.test.ts` (new E2 Vitest mirror, fake PaymentClient), `apps/edge/src/index.ts` + `apps/edge/src/rate-limit.ts` + `apps/edge/src/upstream.ts` (subjects under test).
- Acceptance criteria: full E1+E2 Vitest set passes with Deno/Supabase CLIs absent; every fail-closed case carries payment-call-count-zero evidence; Worker fixture passes size/auth/rate-limit/correlation/timeout maps; no secret reference in `apps/edge`.
- Required test: this item IS the required-test definition; Deno suites (`session.test.ts`, `ai-gateway.test.ts`, `executor.test.ts`) remain as non-binding CI references until CLIs exist.
- AICD linkage: proves AC-06/07/08/09–12 locally; feeds EVL regression.
- Gate class: local-only (this is the binding local green).
- Failure behavior with hard stop: any E1/E2 red → phase cannot advance to PVL-sign-off/EXECUTE-complete; STOP, fix hermetic/fake suite first; do not route around via Deno-skip or live-call substitution.

**S7 — Edge boundary + catalog/smoke readiness (hybrid handoff shape).**
- Implementation task: implement Task 4 + Task 6 shape so hybrid lane needs only values, not rework: Worker validates method/path/64KB body/`requestId`/session-demo header/30-req-min limit, fixed `SUPABASE_REGIONAL_FUNCTION_URL` upstream with timeout + redacted logs, explicit CORS allowlist, no OpenAI/signer imports; health shape exposes `requestId`/configured-vs-expected region/chainId/provider/model-availability without secrets; catalog + smoke script run against fakes locally and against regional URL in hybrid.
- Exact file/module paths: `apps/edge/src/index.ts`, `apps/edge/src/rate-limit.ts`, `apps/edge/src/upstream.ts`, `apps/edge/src/types.ts`, `apps/edge/wrangler.toml` (uncommitted secrets out; `SUPABASE_REGIONAL_FUNCTION_URL`, `ALLOWED_ORIGIN`, rate-limiter binding), `supabase/functions/_shared/health.ts`, `supabase/functions/_shared/chain-config.ts` (target chain ID), `config/ai/merchant-catalog.json` (non-authoritative fixture).
- Acceptance criteria: oversized/unsupported/unauthenticated/over-limit/upstream-timeout/4xx-5xx all map to redacted `ApiError` with correlation headers; health never leaks secrets; local challenge → verify → intent(fake) → preflight(fake) → execute(fake) flow correlates IDs end-to-end with zero live testnet calls.
- Required test: E2 Worker Vitest (`apps/edge/test/edge.test.ts`) + fake-backed smoke-shape Vitest; live regional smoke is hybrid-only (§4). Never Deno-gated for local green.
- AICD linkage: autonomous-path spine; AC-07 region/timeout maps.
- Gate class: shape + fake proof local-only; regional URL + live-model proof hybrid (deferred).
- Failure behavior with hard stop: missing rate-limit binding → fail closed or explicit local fake (deployment preflight checks binding); upstream timeout/4xx/5xx → retryable-structured error, no secret forward; STOP, no arbitrary-URL fallback.

### 3. Conflicts resolved

- **15-code vs 5-code union:** resolved for 15-code closed union. The 5-code collapse is rejected (loses model/region/reconciliation fidelity). Enforcement is supplement + shared test (S3 `api-error-codes.test.ts`), not a `string` escape. Any future code addition requires a new plan supplement and shared-test update.
- **OpenAI SDK vs raw fetch:** resolved for raw fetch. SDK is rejected: no `openai` dep exists, regional function keeps the smallest secret surface, and pin/capability semantics are owned by `loadOpenAIConfig` + port (S1). No SDK import may appear in gateway/edge/domain.
- **Canonicalization duplication:** resolved for reuse. Gateway must import Phase 01 `AgentIntentSchema` / `canonicalIntentHash` / `merchantIdToBytes32` / asset descriptor; local re-implementation is rejected and fails S2 tests on hash drift.
- **Deno-gated vs Vitest-gated local green:** resolved for Vitest-gated (E1+E2). Deno suites stay as CI-reference mirrors; no local gate may require `deno` / `supabase` CLIs until those CLIs are present and a later supplement re-gates.
- **Executor split vs combined:** resolved for D-combined single owner of preflight + execute with one chain-client (S5); split-client proposals rejected for policy-drift risk.

### 4. Deferred to hybrid lane (not local green, requires validate-contract + explicit approval)

- **H1 — Live `gpt-5.6-luna` call:** capability check + one structured-output request through the regional function; evidence is redacted provider/model metadata + latency + mapped-error-on-failure (never prompt secrets / key material / raw body). Proves AC-07/AC-08 live side. Cost-bearing; never run as local regression.
- **H2 — Regional preflight static-call evidence (redacted):** `preflightPay` static call against configured chain via regional function; evidence is decision + `reasonCode` + `chainId` + `checkedAt` + correlation IDs, with addresses/keys redacted to the approved log shape. Proves AC-10/AC-11 regional side.
- **H3 — Fixed regional URL value confirmation:** concrete `SUPABASE_REGIONAL_FUNCTION_URL` + expected-vs-actual region pair + `wrangler.toml` binding proof recorded in the Phase 04 report; Worker arbitrary-upstream is never permitted. Records the routing choice referenced in Global Constraints.
- Hybrid-lane rule: H1–H3 run only after PVL writes V1–V7 with hybrid gates and explicit approval; any H-failure fails closed per S1/S5 hard stops and does not fall back to another model/region/direct payment.

### Loop-state note

- PLAN-SUPPLEMENT is done via this section (checkbox §Phase Loop Progress updated accordingly).
- PVL / EXECUTE / EVL / UPDATE PROCESS remain pending; PVL must encode S1–S7 required tests and H1–H3 hybrid gates into the Validate Contract before EXECUTE.
