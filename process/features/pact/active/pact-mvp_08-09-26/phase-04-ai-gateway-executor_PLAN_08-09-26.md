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
**Status**: COMPLETE WITH GAPS — HOSTED BUNDLE SUPPLEMENT VERIFIED; G13/H1–H3 PENDING
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–6 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 04 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [x]) syntax for tracking.

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
- [x] 4. PVL — vc-validate-agent writes V1–V7 contract with automated, hybrid, and agent-probe gates
- [x] 5. EXECUTE — complete Tasks 1–6 and run each section gate immediately
- [x] 6. EVL — rerun tests, local edge-to-function smoke, no-chain-call failures, and auth/rate-limit probes
- [x] 7. UPDATE PROCESS — write report, update umbrella/downstream plans, and commit process/execution separately

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

- [x] 1.1. Write failing contract tests for required fields, stable status values, redacted errors, maximum prompt length 2,000 characters, and missing requestId rejection.
- [x] 1.2. Re-export the Phase 01 DomainError code union and map it to API errors: AUTH_REQUIRED, AUTH_INVALID, AUTH_EXPIRED, INPUT_INVALID, NETWORK_CONFIG_INVALID, PROVIDER_UNAVAILABLE, PROVIDER_MODEL_UNAVAILABLE, PROVIDER_OUTPUT_INVALID, REGION_MISMATCH, CARD_NOT_ELIGIBLE, PREFLIGHT_DECLINED, PAYMENT_BROADCAST_TIMEOUT, PAYMENT_FAILED, PAYMENT_RECONCILIATION_REQUIRED, RATE_LIMITED. Do not introduce an untyped `string` escape hatch.
- [x] 1.3. Implement shared parsing/redaction helpers; errors expose category and requestId but never provider response body, authorization header, prompt secrets, or key material.
- [x] 1.4. Run yarn vitest run packages/domain/test/api-contracts.test.ts and expect failure before exports exist.
- [x] 1.5. Implement the types and run focused tests.

Run: yarn vitest run packages/domain/test/api-contracts.test.ts && yarn typecheck  
Expected: PASS.
- [x] 1.6. Commit API/domain contracts.

### Task 2 — Implement wallet challenge and short-lived session

**Files:** Create supabase/migrations/202609080001_sessions_and_intents.sql, supabase/functions/session/index.ts, supabase/functions/session/test/session.test.ts, supabase/functions/_shared/session-token.ts, scripts/test-session-flow.mjs.

**Routes:**

~~~text
POST /v1/session/challenge
POST /v1/session/verify
POST /v1/session/revoke
~~~

- [x] 2.1. Write tests for challenge expiry, one-time consumption, wrong signature, wrong address, expired token, revoked token, and session wallet binding.
- [x] 2.2. Run session tests before implementation.

Run: deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts  
Expected: FAIL because the session function and migration are absent.

- [x] 2.3. Add session_challenges with nonce hash, wallet address, expires_at, consumed_at; add sessions with token hash, wallet address, role, issued_at, expires_at, revoked_at; index nonce/token hashes.
- [x] 2.4. Generate a cryptographically random nonce, store only its hash, return an EIP-191 message with domain, chain label, wallet, nonce, issued-at, and expiry.
- [x] 2.5. Verify the wallet signature with ethers verifyMessage, consume the challenge atomically, issue an HMAC-signed token containing session ID, wallet, role, issued-at, and expiry, and store only the token hash.
- [x] 2.6. Make session middleware require a valid wallet-bound token for intent/preflight/execute; demo authorization uses a separate explicitly configured demo token and cannot access secrets.
- [x] 2.7. Run session tests and the local function.

Run: deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts && supabase functions serve session --env-file .env.local  
Expected: tests pass; local function starts without production URL.
- [x] 2.8. Commit migration and session boundary.

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

- [x] 3.1. Write failing gateway tests for valid structured output, malformed JSON, provider 401/429/5xx, model unavailable, wrong execution region, unknown merchant, prompt too long, model-supplied recipientAddress, and card/asset mismatch.
- [x] 3.2. Add a deterministic FakeAiProvider for automated tests; it returns fixtures only and is never used by the live route.
- [x] 3.3. Implement OpenAiProvider using the Responses API with model from OPENAI_MODEL, store false, strict JSON schema named pact_agent_intent, and no fallback branch. Include provider request ID and latency in redacted logs.
- [x] 3.4. Constrain model input to merchant IDs/catalog labels and the selected card’s policy; resolve card ID, agent, asset, recipient, and allowlist outside model output.
- [x] 3.5. Check Deno execution region against configured SUPABASE_FUNCTION_REGION and return REGION_MISMATCH before provider call when wrong.
- [x] 3.6. Parse decimal amount with the Phase 01 native asset descriptor, calculate amountBaseUnits with ethers parseUnits, obtain policyVersion from the authoritative card snapshot, build the shared canonical intentHash, set a canonical UTC expiresAt, and persist provider/model attribution plus intent status.
- [x] 3.7. Add a capability check that fails startup or the first live request with PROVIDER_MODEL_UNAVAILABLE when gpt-5.6-luna cannot be accessed; do not choose another model.
- [x] 3.8. Run automated gateway tests and assert payment client call count remains zero for every provider/schema failure.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts  
Expected: PASS; every fail-closed case has zero chain-call count.
- [x] 3.9. Commit gateway/provider code and non-authoritative merchant catalog.

### Task 4 — Implement Cloudflare public edge

**Files:** Create apps/edge/package.json, apps/edge/src/index.ts, apps/edge/src/rate-limit.ts, apps/edge/src/upstream.ts, apps/edge/src/types.ts, apps/edge/wrangler.toml, apps/edge/test/edge.test.ts.

**Boundary:** Cloudflare validates method/path/body size, request ID, session/demo header shape, and rate limit, then forwards to one configured regional Supabase URL. It never imports OpenAI or signer code.

- [x] 4.1. Write Worker tests for request size >64 KB, unsupported method/path, missing auth header, rate-limit response, correlation header propagation, upstream timeout, and upstream 4xx/5xx mapping.
- [x] 4.2. Implement the Worker with a 64 KB body limit, explicit CORS allowlist from environment, 30 requests per minute binding, AbortController timeout, and redacted structured logs.
- [x] 4.3. Configure wrangler with SUPABASE_REGIONAL_FUNCTION_URL, ALLOWED_ORIGIN, and RATE_LIMITER binding; leave secrets out of committed config.
- [x] 4.4. Verify the Worker never references OPENAI_API_KEY or AGENT_SIGNER_PRIVATE_KEY by running the secret scanner over apps/edge.
- [x] 4.5. Run Worker tests.

Run: yarn vitest run apps/edge/test/edge.test.ts && node scripts/check-no-secrets.mjs  
Expected: PASS and no secret references.
- [x] 4.6. Commit the edge boundary.

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

- [x] 5.1. Write failing tests for owner/session mismatch, intent missing/expired, card state changed after intent, preflight decline, signer chain mismatch, gas-only signer, successful receipt, reverted receipt, broadcast timeout, and duplicate idempotency key.
- [x] 5.2. Implement chain-client with ethers JsonRpcProvider, Wallet from AGENT_SIGNER_PRIVATE_KEY only inside the function, controller ABI from packages/pact-sdk, and an explicit chain ID assertion.
- [x] 5.3. Implement preflight as a static controller preflightPay call using server-bound card/merchant/asset and a card-scoped nonce; never trust a client nonce or recipient.
- [x] 5.4. Implement execute to lock intentId/idempotency key, re-read card/merchant/network, static-call preflight, send controller.pay, store txHash before waiting, wait for one confirmation, and classify receipt status.
- [x] 5.5. On timeout, call findByNonce and transaction receipt lookup before any retry; if neither proves outcome, return PAYMENT_RECONCILIATION_REQUIRED and do not submit a second transaction.
- [x] 5.6. Return settled only for receipt.status == 1 and later let the indexer confirm matching PaymentSettled; no API response alone is the final UI truth.
- [x] 5.7. Run executor tests with a fake PaymentClient and assert the signer/private key never appears in response/log fixtures.

Run: deno test --allow-env --allow-net --allow-read supabase/functions/agent-executor/test/executor.test.ts && yarn vitest run packages/domain/test/payment.test.ts  
Expected: PASS; provider/chain errors are fail-closed and duplicate execution has one sendPayment call.
- [x] 5.8. Commit executor and payment types.

### Task 6 — Local edge-to-function smoke and regression

**Files:** Create scripts/smoke-edge-gateway.mjs, supabase/functions/_shared/health.ts, docs/runbook/local-runtime.md. Extend package.json and process/context/tests/backend-tests.md only through an approved plan-supplement, preserving Phase 01 command semantics and existing routing sections.

- [x] 6.1. Add health responses exposing requestId, configured region, expected region, chain ID, provider name, and model availability without exposing secrets.
- [x] 6.2. Start local session, AI gateway fake provider, executor fake client, and Worker; exercise challenge → verify → intent → preflight → execute.
- [x] 6.3. Exercise malformed provider and over-limit fixture; assert no transaction call and a visible reason code.
- [x] 6.4. Run the local smoke and Phase 01/02/03 regression suites.

Run: node scripts/smoke-edge-gateway.mjs && yarn test && yarn typecheck && yarn validate:aicd  
Expected: PASS with correlation IDs present and no secret output.
- [x] 6.5. Commit runtime smoke/runbook updates.

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
- Last completed step: hosted bundle-resolution supplement EVL VERIFIED 2026-09-11 (Deno 2.9.6; Supabase CLI 2.117.0; compatibility 6/6; per-function checks/bundles; G1–G6+G8+G12a+G12b green; secret scan 970/0)
- Validate-contract status: CONDITIONAL accepted 2026-09-10 (C-SESSION/C-DDL/C-MODEL pinned verbatim in code+migration+tests; C-TOOL informational)
- Next Step: G13 staging-only retry under separate explicit approval, then H1–H3 hybrid lane under separate explicit approval; G7 stays CI-only/non-binding; no fallback permitted.
- On ✅ VERIFIED, continue to phase-05-indexer-read-model_PLAN_08-09-26.md.

## Update Process Handoff — Hosted Bundle-Resolution Supplement (2026-09-11)

- Hosted bundle-resolution supplement: **VERIFIED**.
- Function-local `deno.json` files for all three deployable functions are
  verified; no generated `deno.lock` remains.
- `AGENT_SIGNER_PRIVATE_KEY` is absent and
  `SUPABASE_REGIONAL_FUNCTION_URL` is absent by design until deployment output.
- Local Supabase serve was **NOT RUN**. G13 retry and H1/H2/H3 remain pending.
- The plan stays in `active/`; no deployment, migration, external call, secret
  access, commit, or push is authorized by this handoff.
- Original V1-V7 Validate Contract and original failed G13 evidence are
  preserved unchanged.

## Validate Contract

Status: CONDITIONAL
Date: 2026-09-10
generated-by: vc-validate-agent (VALIDATE mode, SPEC-ONLY)
Scope: Phase 04 plan + `## Plan Supplement — 10-09-26` (A3/B1/C3/D-combined/E1+E2+E3; S1–S7; H1–H3) against real files on `main`. No commands run, no RPC, no OpenAI calls, no deploys, no secret values read or printed (names only). Phase 03 closeout (controller `pay` + `preflightPay` static-call `from=agent`, ASC-only hook, `availableCredit`) consumed as authority, not modified. Prior plan text preserved byte-identically except this section.

### V1 — Pre-check

- Plan file: `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md` (535 lines pre-PVL) with frozen supplement §1–§4. Placeholder contract confirmed blocker; no prior V-contract exists (no `supersedes:`).
- Context router: `process/context/all-context.md` (2026-09-10 refresh) + `process/context/tests/backend-tests.md` read. Backend-tests confirms planned surface only, no runtime files yet, first checks must use local fixtures with no production URL / service-role value / provider secret / live mutation.
- Phase 01 authority verified present: `AgentIntentSchema` strict + deny-list (`recipient`, `recipientAddress`, `calldata`, `privateKey`, `apiKey`, `secret`, `token`), `canonicalIntentHash` fixed 8-field ABI tuple, `merchantIdToBytes32` (trim+lowercase+keccak), `NATIVE_ASSET_EVM_ADDRESS` zero address, `loadOpenAIConfig` strict (`provider:openai`, `model:gpt-5.6-luna`, `region:string`, `allowFallback:literal false`), `resolveOpenAIModel` rejects env substitution. `config/ai/openai.json` exists with `{provider:openai, model:gpt-5.6-luna, region:us-east-1, allowFallback:false}`. Supplement S1 names NEW `config/ai/model-config.json` — path conflict tracked as C-MODEL below; no second truth permitted.
- Phase 02/03 authority consumed: agent calls only `pay`/`preflightPay`; pool `settleNative` controller-only; ASC-only hook; `availableCredit` read; overwrite-by-new-ID; reconcile-by-reading. Executor must mirror static-call-before-send, server-bound values, card-scoped nonce.
- Toolchain (from all-context scan, not probed): Node + Yarn Classic 1.22.22 via Corepack, Vitest 3.2.4, `wrangler` present, `forge`/`anvil` present; `deno` + `supabase` CLIs missing (needed Phase 04/05). Therefore Deno-gated suites MUST NOT gate local green; binding local green is E1+E2 Vitest per supplement decision E (see V4 G1–G6).
- Scout: greenfield `supabase/functions/{_shared,session,ai-gateway,agent-executor}`, `apps/edge/`, `config/ai/merchant-catalog.json`, `config/ai/model-config.json`, `scripts/smoke-edge-gateway.mjs` absent as expected (plan creates them). `packages/domain/src` + `packages/pact-sdk` present (consumed read-only). No `openai` dependency present (S1 forbids adding it).
- Live lanes H1–H3 not run (cost-bearing / region-sensitive; require this contract + explicit approval per Global Constraints and supplement §4).

### V2 — Two-layer findings (with net gate)

Layer 1 — dimensions:

- infra/setup-fit: CONCERN (C-TOOL). Deno/Supabase CLIs absent by record; plan + supplement correctly route local green to Vitest/wrangler. No local gate may require `deno`/`supabase` until a later supplement re-gates. Deno suites retained as CI references only.
- test-coverage: CONCERN (C-VALUES + C-DDL + C-MODEL). S1–S7 required tests are specified with exact paths (see V4); all bind to Vitest, none to Deno for local green. Coverage is complete on paper but three value/DDL/path gaps must be pinned before EXECUTE (V3) — hence CONDITIONAL, not PASS.
- breaking-changes: PASS with notes. Supplement scope rule holds (narrows/extends Tasks 1–6 only; supplement wins on conflict). Reuse rule enforced (no canonicalization fork, no second model pin, no 16th code without supplement). Phase 01/02/03 files consumed read-only; migration `202609080001_sessions_and_intents.sql` is new surface (additive).
- security-surface: CONCERN (C-SESSION). STRIDE/OWASP in plan; hash-at-rest, one-time consume, wallet-bound middleware, function-only secrets, fixed upstream URL, redaction helpers all specified. Exact TTLs, HMAC secret rotation story, sha256-only column rule, and consume predicate are open values — pinned as defaults with hard stops in V3/V4, not assumed.

Layer 2 — per-section / S1–S7 / H1–H3 feasibility (all feasible, gated as noted):

- Task 1 + S3 (closed 15-code mapper): feasible pure-TS. Highest risk: escape-hatch regression (`string` code, `as string` cast, 16th code). Gated by G1+G6.
- Task 2 + S4 (hybrid session C3): feasible with pure-logic split (`session-token.ts` Vitest-testable). Highest risk: open TTL/rotation/hash-algorithm values. Gated by G1+G2+G8 as CONCERN C-SESSION.
- Task 3 + S1 + S2 (A3 raw-fetch-behind-port, merchantId-only): feasible. Highest risk: SDK import, model substitution, canonicalization fork, client recipient trust. Gated by G1+G3+G6.
- Task 4 + S7 (edge boundary): feasible (Vitest + wrangler present). Highest risk: missing rate-limiter binding, arbitrary upstream, secret import. Gated by G2+G6.
- Task 5 + S5 (D-combined executor + reconcile): feasible single owner. Highest risk: missing `payment_attempts` DDL in plan text, lock ordering, second-submit on timeout. Gated by G1+G4 as CONCERN C-DDL.
- Task 6 (smoke/runbook): feasible fake-backed shape locally; regional URL live-only. Gated by G2-local + G11-hybrid.
- H1/H2/H3: feasible hybrid-only with explicit approval; never local regression. Gated by G9–G11.

Eight required resolutions (each bound to a V4 gate):

1. Deno-vs-Vitest local green: Deno suites (`supabase/functions/session/test/session.test.ts`, `supabase/functions/ai-gateway/test/ai-gateway.test.ts`, `supabase/functions/agent-executor/test/executor.test.ts` via `deno test --allow-env --allow-net --allow-read …`) are NON-BINDING CI references while CLIs are missing and MUST NOT gate local green. Binding local green is ONLY: `corepack yarn vitest run packages/domain/test`, `corepack yarn vitest run apps/edge/test/edge.test.ts`, `corepack yarn vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts`, `corepack yarn vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts`, plus `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn validate:aicd`, `node scripts/check-no-secrets.mjs`, `git diff --check`. (V4 G1–G6; non-gate V4 G7.)
2. HMAC/session parameters: plan leaves challenge TTL, session TTL, hash algorithm, consume predicate, HMAC secret storage/rotation open → CONCERN C-SESSION with pin-before-EXECUTE defaults in V3. Gate: `packages/domain/test/session-token.test.ts` (HMAC round-trip/expiry/tamper/wrong-wallet) + E2 fake-store consume-once/revoke Vitest; migration must encode sha256-only columns + indexes; live Supabase persistence is hybrid-deferred, never local-green gate.
3. Idempotency/payment-attempt DDL + lock/reconcile: plan names `session_challenges`/`sessions` but no `payment_attempts` table → CONCERN C-DDL with required DDL + lock query + ordering assertion + `findByNonce` policy in V3. Gate: `packages/domain/test/payment.test.ts` (state machine) + `executor.vitest.test.ts` (one-send, store-before-wait, reconcile, never-settled-on-uncertain).
4. Model-config single source of truth: exact file `config/ai/model-config.json` per S1 with pinned `{provider:openai, model:gpt-5.6-luna, allowFallback:false}`; load path `loadOpenAIConfig(model-config.json)` + `resolveOpenAIModel` pre-call assert; forbidden-duplicate rule (no second pin, no `openai` package, no env substitution, existing `config/ai/openai.json` must not fork — remove or thin assert-equal adapter with `model-config.json` authoritative); grep check in G6. Gate: `packages/domain/test/provider-config.test.ts`. Path conflict tracked as C-MODEL.
5. Exhaustive 15-code mapping: exact Task 1.2 list (`AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_EXPIRED`, `INPUT_INVALID`, `NETWORK_CONFIG_INVALID`, `PROVIDER_UNAVAILABLE`, `PROVIDER_MODEL_UNAVAILABLE`, `PROVIDER_OUTPUT_INVALID`, `REGION_MISMATCH`, `CARD_NOT_ELIGIBLE`, `PREFLIGHT_DECLINED`, `PAYMENT_BROADCAST_TIMEOUT`, `PAYMENT_FAILED`, `PAYMENT_RECONCILIATION_REQUIRED`, `RATE_LIMITED`); one shared total mapper in `packages/domain/src/api.ts` re-exported by `supabase/functions/_shared/errors.ts` (no fork); `never`-exhaustiveness (`const _exhaustive: never`); catch-all for unknown/throwable → `INPUT_INVALID` or `PROVIDER_UNAVAILABLE` per S3 default + alert-shaped log, never raw passthrough; shared test `packages/domain/test/api-error-codes.test.ts` asserts `keys==15` and forbids `as string`. Gate: G1+G6.
6. MerchantId-only recipient authority: provider JSON schema `additionalProperties:false` allowing only `{merchantId, amountDecimal, purpose, confidence}`; Zod second-pass via Phase 01 `parseAgentIntent` + `assertMerchantAllowed` + `merchantIdToBytes32`; `catalog.ts` allowlist gate; `merchant-catalog.json` labels+logical IDs only (no addresses); server resolves card/agent/asset/recipient/`policyVersion` (on-chain snapshot + native descriptor) and includes `policyVersion` in hash input; any model-supplied `recipientAddress`/address/asset/card/nonce → `PROVIDER_OUTPUT_INVALID`, zero chain calls, no `ready` persist. Gate: `packages/domain/test/intent-shape.test.ts` + G3 zero-call asserts.
7. No-chain-call on failure: exact assertion `expect(sendPayment).toHaveBeenCalledTimes(0)` (fake `PaymentClient`; `walletClient`/`publicClient` zero where chain-client is the subject) on EVERY failure class: provider 401/429/5xx, malformed JSON, model-unavailable, wrong region, schema/catalog mismatch, auth failure, preflight decline. Tests: `ai-gateway.vitest.test.ts` (`fails-closed-*-zero-send`), `executor.vitest.test.ts` (`auth/preflight-fail-zero-send`, `duplicate-one-send`), `edge.test.ts` (oversized/unauth never forwards). Gateway never imports executor signer. Gate: G3+G4 (+G2 for edge).
8. Live OpenAI/region with no fallback: H1 redacted model-call log (provider, model, providerRequestId, latencyMs, decision — never prompt/body/key) + H2 regional `preflightPay` static-call evidence (decision, reasonCode, chainId, checkedAt, correlation IDs, redacted addresses) + H3 fixed-URL confirmation (`SUPABASE_REGIONAL_FUNCTION_URL` value + expected-vs-actual region + `wrangler.toml` binding proof in report); pre-call `allowFallback===false` assert via loaded config + `resolveOpenAIModel`; fetch uses Responses API with `store:false`, strict schema `pact_agent_intent`, no fallback branch; retry once only on 502/503/429, never as a new payment. Any H-failure fails closed per S1/S5 hard stops. Gates: G9–G11 hybrid-only.

Net gate (V2): CONDITIONAL — zero FAILs, three CONCERNs (C-SESSION, C-DDL, C-MODEL) plus tooling note C-TOOL. No BLOCKED condition met (model/region/CLIs are bounded hybrid/CI notes, not authority breaks).

### V3 — Synthesis (open gaps → pin-before-EXECUTE defaults)

- C-SESSION (CONCERN, blocks EXECUTE start until pinned in code+migration+tests): plan leaves values open. Defaults to pin verbatim before Task 2: challenge TTL 5 min (`expires_at = now()+5min`); session TTL 30 min (HMAC `exp`, `expires_at = now()+30min`); hash algorithm sha256 hex only (`nonce_hash`, `token_hash` TEXT CHECK 64-hex, indexes on both, NO plaintext token/signature/bearer columns); one-time consume predicate `WHERE nonce_hash=$1 AND consumed_at IS NULL` with atomic `UPDATE … SET consumed_at=now() WHERE … AND consumed_at IS NULL RETURNING`, second verify → `AUTH_INVALID`, no session; HMAC secret name `SESSION_HMAC_SECRET` function-only via Supabase secrets (never committed, never bundled to edge/browser), rotation via versioned secret with verify-accept-old-for-one-session-TTL overlap then destroy, rotation statement in Phase 04 report; demo token separate explicitly-configured value with no secret path. If EXECUTE prefers different TTLs, record them in the same files with the same predicates — do not leave them implicit.
- C-DDL (CONCERN, blocks Task 5 until migration+tests encode it): plan has no `payment_attempts` DDL. Required DDL to create in `202609080001_sessions_and_intents.sql` (or additive second migration with supplement note): `payment_attempts(intent_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, status TEXT NOT NULL, tx_hash TEXT, card_nonce TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(intent_id, idempotency_key), UNIQUE(idempotency_key))` + index on `tx_hash`; lock policy: first-claim `INSERT … ON CONFLICT DO NOTHING RETURNING`, then `SELECT … FOR UPDATE` on the attempt row inside the execute transaction; ordering invariant: `UPDATE payment_attempts SET tx_hash=$1, status='broadcast'` BEFORE `waitForReceipt` (test asserts store-call precedes wait-call); reconcile policy: on timeout call `findByNonce(cardId, nonce)` + receipt lookup by stored `txHash` before any retry; unproven outcome → `PAYMENT_RECONCILIATION_REQUIRED`, never a second submit; `settled` only on `receipt.status==1` (never-settled-on-uncertain). Required tests: `executor.vitest.test.ts::duplicate-idempotency-one-send`, `::timeout-reconcile-no-resubmit`, `::receipt-status-0-not-settled`, `::store-before-wait-ordering`.
- C-MODEL (CONCERN, blocks Task 3 until resolved): S1 exact file `config/ai/model-config.json` vs existing `config/ai/openai.json`. Rule: `model-config.json` is the single source of truth (`{provider:openai, model:gpt-5.6-luna, allowFallback:false}`); `openai.json` must not fork (delete or thin adapter asserting deep-equal at load with `model-config.json` authoritative; `region` lives only in the loader input, never as a second model pin). Load path `loadOpenAIConfig(model-config.json)` → `resolveOpenAIModel` → fetch; `OPENAI_MODEL` env must be unset-or-equal or throw `AI_CONFIG_INVALID`; no `openai` package anywhere (import-graph + lockfile check).
- C-TOOL (CONCERN, informational): `deno`/`supabase` CLIs absent → G7 non-binding. No action except: no local gate may shell to `deno`/`supabase`; if CLIs appear mid-phase, do not re-gate without a supplement.

### V4 — Exact gates (each: exact command + strategy + evidence artifact)

- G1 — Domain E1 hermetic Vitest (BINDING local green). Exact command: `corepack yarn vitest run packages/domain/test`. Strategy: fully-automated (Vitest). Evidence: Vitest output (`provider-config.test.ts` pin/fallback-reject/unknown-reject; `intent-shape.test.ts` extra-field/unknown-merchant/hash-stability; `api-error-codes.test.ts` keys==15 + no-`as string` + identical-code fixtures; `session-token.test.ts` HMAC round-trip/expiry/tamper/wrong-wallet; `payment.test.ts` state machine + code map; `api-contracts.test.ts` envelopes/redaction/2k-prompt/requestId). Covers S1/S2/S3/S4/S5-local + items 2/4/5/6. Red → STOP, fix hermetic first.
- G2 — Edge E1+E2 Vitest (BINDING local green). Exact command: `corepack yarn vitest run apps/edge/test/edge.test.ts`. Strategy: fully-automated (Vitest + upstream-fake). Evidence: fixture PASS for 64KB/method/path/auth/rate-limit/correlation/timeout/upstream-4xx-5xx maps + correlation-header propagation + redacted `ApiError`. Covers S6/S7 + item 7-edge. Red → STOP.
- G3 — Gateway E2 fake-backed Vitest mirror (BINDING local green). Exact command: `corepack yarn vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts`. Strategy: fully-automated (Vitest + `FakeAiProvider` fixtures only, never live route). Evidence: PASS with `sendPayment==0` on every fail-closed case (401/429/5xx, malformed JSON, model-unavailable, region-mismatch, shape/catalog, oversize prompt, model-recipient) + `PROVIDER_MODEL_UNAVAILABLE` on config drift + `store:false` + strict `pact_agent_intent` shape in provider module. Covers S1/S2/S6 + items 6/7/8-shape. Red → STOP.
- G4 — Executor E2 fake-backed Vitest mirror (BINDING local green). Exact command: `corepack yarn vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts`. Strategy: fully-automated (Vitest + fake `PaymentClient` + signer spy). Evidence: PASS for owner/session mismatch, missing/expired intent, card-changed, preflight decline, signer-chain mismatch, gas-only signer, receipt-1 settled, receipt-0 failed, timeout-reconcile, duplicate one-send, plus `::store-before-wait-ordering` + never-settled-on-uncertain + no signer/key in response/log fixtures + gateway↛signer import graph. Covers S5/S6 + items 3/7. Red → STOP.
- G5 — Typecheck + lint + AICD (BINDING). Exact commands: `corepack yarn typecheck` and `corepack yarn lint` and `corepack yarn validate:aicd`. Strategy: fully-automated. Evidence: clean logs (typecheck must cover `services/*` precedent + new `supabase/**/*.vitest.test.ts` + `apps/edge`; `never`-exhaustiveness enforced by typecheck; AICD 0 failures). Red → STOP.
- G6 — Secret/duplication/diff gate (BINDING). Exact commands: `node scripts/check-no-secrets.mjs` and `git diff --check` and `rg -n "OPENAI_API_KEY|AGENT_SIGNER_PRIVATE_KEY|as string|from ['\"]openai['\"]|require\(['\"]openai['\"]\)" --glob '!yarn.lock' --glob '!.git/**'` and `rg -n "gpt-5" config/ai packages/domain supabase/functions apps/edge --glob '*.ts' --glob '*.json' --glob '*.toml'`. Strategy: fully-automated. Evidence: scanner clean (0 findings over `apps/edge` + functions), grep shows model pin only via `model-config.json` + loader, no `openai` package in manifests/lockfile, diff clean. Covers items 4/5 + S1/S3/S7. Red → STOP.
- G7 — Deno suites (NON-BINDING CI reference; MUST NOT gate local green). Exact commands: `deno test --allow-env --allow-net supabase/functions/session/test/session.test.ts`, `deno test --allow-env --allow-net --allow-read supabase/functions/ai-gateway/test/ai-gateway.test.ts`, `deno test --allow-env --allow-net --allow-read supabase/functions/agent-executor/test/executor.test.ts`. Strategy: fully-automated (CI-only when CLIs exist). Evidence: Deno output when runnable; absence is not a failure and never substitutes for G1–G4. Item 1 explicit.
- G8 — Auth/UX error-copy review (agent-probe). Exact procedure: inspect redacted `ApiError` fixtures + `requestId` correlation + prompt-length/rate-limit copy. Strategy: agent-probe review. Evidence: review note (no secret material, retryable flags correct, demo-token boundary stated).
- G9 — H1 live `gpt-5.6-luna` call (HYBRID, approval-gated, never local regression). Exact procedure: capability check + one structured-output request through the regional function after pre-call `allowFallback===false` assert. Strategy: hybrid live-lane. Evidence: redacted log (provider, model, providerRequestId, latencyMs, decision/mapped-error; never prompt/body/key) in Phase 04 report. Retry once only on 502/503/429; any failure → mapped `ApiError`, zero payment calls. Cost-bearing.
- G10 — H2 regional preflight static-call (HYBRID, approval-gated). Exact procedure: `preflightPay` static call (`from=agent`, server-bound values, card-scoped nonce) via regional function on configured chain. Strategy: hybrid live-lane. Evidence: decision + reasonCode + chainId + checkedAt + correlation IDs (addresses/keys redacted to approved shape) in report. Proves AC-10/AC-11 regional side.
- G11 — H3 fixed regional URL confirmation (HYBRID, approval-gated). Exact procedure: record concrete `SUPABASE_REGIONAL_FUNCTION_URL` + expected-vs-actual region pair + `wrangler.toml` binding proof (`SUPABASE_REGIONAL_FUNCTION_URL`, `ALLOWED_ORIGIN`, rate-limiter). Strategy: hybrid live-lane (config review + regional health read). Evidence: values + health shape (`requestId`/configured-vs-expected region/chainId/provider/model-availability, no secrets) in report. Arbitrary upstream never permitted.

### V5 — Exit / evidence

- Local EXIT (Tasks 1–6 + EVL-local) requires G1–G6 green + G8 note + fake-backed smoke correlation (challenge→verify→intent(fake)→preflight(fake)→execute(fake) with IDs correlated, zero live testnet calls). Deno absence (G7) is recorded, not a failure. Phase 01/02/03 regression (`corepack yarn vitest run packages/domain/test`, `forge test --root contracts` read-only) must stay green.
- Hybrid EXIT (H1–H3) requires explicit approval + G9/G10/G11 artifacts in `phase-04-ai-gateway-executor_REPORT_08-09-26.md` (redacted metadata/latency/decision/chainId/URLs/regions; no prompt secrets, bodies, keys, calldata, recipient addresses beyond approved shape). Any H-failure fails closed (S1/S5 hard stops), no model/region/direct-payment fallback.
- Evidence index: Vitest outputs (G1–G4), typecheck/lint/AICD logs (G5), scanner+grep+diff logs (G6), probe note (G8), redacted H1–H3 pack (G9–G11). No live model/region claim without its hybrid artifact.

### V6 — Strategy

Sequential, single executor, Tasks 1→6 in plan order (shared `packages/domain`, `_shared`, catalog, migration forbid parallel writers). E1 hermetic first (RED→GREEN per task), then E2 fake-backed mirrors with zero-call asserts, then G5/G6, then G8 probe; G7 never on the critical path; G9–G11 only after local EXIT + explicit hybrid approval. No fan-out.

### V7 — Accepted-by

Pending user acceptance. Recommended: CONDITIONAL accept with C-SESSION, C-DDL, C-MODEL, C-TOOL (V3). Advance to EXECUTE requires explicit ENTER EXECUTE MODE with this plan path; EXECUTE must pin C-SESSION/C-DDL/C-MODEL defaults verbatim (or record alternates in the same files) before the corresponding task's GREEN. Hybrid H1–H3 require a second explicit approval.

What This Coverage Does NOT Prove (required statement):

- No live model call, no regional preflight, no fixed-URL liveness, no Deno execution, and no testnet mutation is proven or claimed — G7/G9–G11 are NOT RUN by construction in this SPEC-ONLY pass.
- No session TTL/challenge TTL, HMAC rotation, `payment_attempts` behavior, or `model-config.json` authority is proven until EXECUTE pins C-SESSION/C-DDL/C-MODEL and G1–G6 go green.
- No `settled` truth is proven by API responses alone (indexer `PaymentSettled` confirmation stays downstream Phase 05).

Net gate: CONDITIONAL (CONCERNs C-SESSION, C-DDL, C-MODEL, C-TOOL; zero FAILs; zero BLOCKED conditions).

Hard stops carried into EXECUTE (verbatim for /goal block):

- Do not run Deno-gated suites as local-green gates; binding local green is ONLY `corepack yarn vitest run packages/domain/test`, `corepack yarn vitest run apps/edge/test/edge.test.ts`, `corepack yarn vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts`, `corepack yarn vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts`, plus `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn validate:aicd`, `node scripts/check-no-secrets.mjs`, `git diff --check`. Absent `deno`/`supabase` CLIs never block; do not substitute live calls for red suites.
- Pin before GREEN: challenge TTL 5 min, session TTL 30 min, sha256-hex-only `nonce_hash`/`token_hash` with `consumed_at IS NULL` atomic consume, function-only `SESSION_HMAC_SECRET` with versioned rotation; `payment_attempts(intent_id, idempotency_key, status, tx_hash, card_nonce)` with first-claim `INSERT … ON CONFLICT DO NOTHING` + `SELECT … FOR UPDATE`, store-`txHash`-before-wait, `findByNonce`+receipt reconcile, never second-submit, `settled` only on `receipt.status==1`; single model truth `config/ai/model-config.json` (`openai`/`gpt-5.6-luna`/`allowFallback:false`) via `loadOpenAIConfig`+`resolveOpenAIModel`, no `openai` package, no env substitution, no second pin.
- Provider/schema/auth failure → mapped 15-code `ApiError`, `expect(sendPayment).toHaveBeenCalledTimes(0)` (wallet/public clients zero), STOP with no preflight/execute; unknown/throwable → `INPUT_INVALID` or `PROVIDER_UNAVAILABLE`, never raw passthrough; 16th code or `as string` escape fails the build.
- MerchantId-only: provider schema `additionalProperties:false` (`merchantId`, `amountDecimal`, `purpose`, `confidence` only); server resolves card/agent/asset/recipient/`policyVersion`; any client/model recipient/address/asset/card/nonce → `PROVIDER_OUTPUT_INVALID`, zero chain calls, no `ready` persist.
- Live lane H1–H3 only after local EXIT + explicit approval; pre-call `allowFallback===false` assert; Responses `store:false` + strict `pact_agent_intent`; retry once only on 502/503/429, never as a new payment; no fallback model/region/direct payment; H-failure fails closed.
- No secret values in source, fixtures, logs, or evidence (names only); browser/edge never receive provider/signer/service-role secrets; upstream is fixed `SUPABASE_REGIONAL_FUNCTION_URL` only.

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

---

## Plan Supplement — Deno/Supabase Compatibility (11-09-26)

**Mode:** PLAN-SUPPLEMENT · **Scope:** plan files only. No implementation, deployment,
OpenAI call, RPC call, transaction, secret access, commit, or push performed or
authorized by this section.

**Provenance (frozen inputs, do not re-debate):**
- Phase 04 local EXIT green (G1–G6 + G8; G7 CI-only/non-binding); H1–H3 NOT executed.
- Observed staging deploy failures (staging session, project ref allowlisted below):
  - `functions deploy ai-gateway`: local bundle `failed to create the graph:
    Relative import path "ethers" not prefixed with / or ./ or ../ ...
    at .../supabase/functions/ai-gateway/index.ts:14:28`, plus
    `WARN: failed to read file: open packages/domain/src/types.js` and
    `.../errors.js`.
  - `functions deploy session --use-api`: server bundle `400: Failed to bundle
    the function (reason: Relative import path "ethers" ... at
    .../supabase/functions/session/index.ts:21:31)`.
  - `functions list` after attempts: empty (zero partial deploys).
- Verified source facts (read-only scan):
  - Bare npm specifiers in function graph: `from "ethers"` in
    `supabase/functions/session/index.ts:21`, `supabase/functions/ai-gateway/index.ts:14`,
    `packages/domain/src/schemas.ts:3`, `packages/domain/src/canonical-hash.ts:1`;
    `from "zod"` across `packages/domain/src/*.ts`. Root `package.json` pins
    `ethers@6.17.0`, `zod@3.25.76`.
  - NodeNext `.js`-suffixed intra-domain imports throughout
    `packages/domain/src/` (e.g. `./errors.js`, `./types.js`, `./schemas.js`);
    function-to-domain imports already use explicit `.ts` and DO upload
    (server log showed `Uploading asset ... packages/domain/src/session-token.ts`).
  - `Deno.serve` / `import.meta.main` confirmed ABSENT in all function modules:
    current `index.ts` files export pure handlers only and are not valid Edge
    entrypoints as-is.
  - Node-only runtime in function path: `readFileSync` from `node:fs`
    (`packages/domain/src/schemas.ts:1`, `model-config.ts:1`),
    `process.env["OPENAI_MODEL"]` (`schemas.ts:328`),
    `randomBytes`/`createHash`/`createHmac` from `node:crypto`
    (`session/index.ts:20`, `session-token.ts:1`).
  - Platform constraint observed: `supabase secrets set` rejects the
    `SUPABASE_` prefix (`SUPABASE_FUNCTION_REGION`, `SUPABASE_URL`,
    `SUPABASE_ANON_KEY` skipped as reserved). Custom secrets that DID set:
    `OPENAI_API_KEY`, `SESSION_HMAC_SECRET`, `OPENAI_MODEL`,
    `CREDITCOIN_RPC_URL`, `DEMO_TOKEN` (verified by name+digest list).
  - Toolchain: supabase CLI `2.117.0` via npx; `deno` CLI ABSENT.
- Scope rule: this supplement only ADDS deployment-compatibility work (C1–C6
  below). No prior section semantics change. Where this supplement explicitly
  overrides (mechanical import-suffix normalization, guarded serve adapters),
  this supplement plus its required test wins; everything else from the plan,
  S1–S7, C-SESSION / C-DDL / C-MODEL pins, and the 15-code mapper is preserved
  byte-for-byte in behavior.

### C1 — Pinned Deno-compatible npm import strategy

- Chosen: one import map at `supabase/functions/deno.json` pinning EXACTLY the
  root-manifest versions — `ethers` → `npm:ethers@6.17.0`,
  `zod` → `npm:zod@3.25.76`. Every bare `from "ethers"` / `from "zod"`
  specifier in the function bundle graph resolves through this map; no other
  version may appear.
- Rejected: bare npm specifiers (the observed bundle failure); unpinned CDN
  URLs (`esm.sh`/`cdn.skypack`/bare `jsr:` without version — non-reproducible);
  vendoring `ethers` into the repo (supply-chain bloat); adding an `openai`
  package under any specifier (S1 forbids it).
- Acceptance: `deno.json` pin versions equal `package.json` versions exactly
  (compat test asserts string equality); `rg` for unmapped bare `ethers`/`zod`
  imports in the graph returns zero; no second ethers/zod version anywhere
  (manifest + lockfile + map agree).
- Gate class: G12a static (binding now) + G12b real bundle (binding at deploy).

### C2 — Domain import strategy: single authority, explicit `.ts`, no fork

- Chosen: `packages/domain` stays the SOLE authority (S2 reuse rule holds).
  Mechanical normalization only — rewrite intra-domain relative imports from
  NodeNext `.js` suffixes to explicit `.ts` suffixes (e.g. `./errors.js` →
  `./errors.ts`); function-to-domain imports keep their existing explicit
  `.ts` form; `supabase/functions/_shared/*.ts` stay thin re-exports (no logic
  fork). Rationale: Deno requires explicit extensions and cannot resolve
  `.js`→`.ts`; Vitest/Vite resolve `.ts` suffixes fine and `tsconfig.json`
  already sets `allowImportingTsExtensions` with `tsc --noEmit` only (no emit
  to break).
- Rejected: vendored domain copies under `supabase/functions/` (second truth,
  hash-drift risk); per-file import-map shims for each `.js` specifier
  (brittle, silently rots); leaving `.js` suffixes (observed WARNs become
  hard bundle errors once `ethers` is fixed).
- Behavior guard (hard): existing `intent-shape` hash-stability,
  `api-error-codes` keys==15 + no-`as string`, and `session-token` HMAC
  vector tests stay UNCHANGED and green — any hash/code/vector drift fails
  the lane (proves zero behavior change from a mechanical rename).
- Gate class: G1 (existing, binding) + G12a (binding now).

### C3 — `Deno.serve` adapters for `session`, `ai-gateway`, `agent-executor`

- Chosen: append a guarded serve-adapter block to each EXISTING `index.ts`
  (no file renames, no export-signature changes, existing Vitest import paths
  untouched). Guard shape: `if (typeof Deno !== "undefined" &&
  typeof (Deno as unknown as { serve?: unknown }).serve === "function")`
  so Node/Vitest never executes it. Each adapter wires: method/path dispatch
  for its plan routes (`/v1/session/*`, `/v1/agent/intents`,
  `/v1/payments/preflight`, `/v1/payments/execute`), 64 KB JSON body cap
  (parity with edge), `x-request-id` require-or-generate, wallet-session
  check via existing `requireSession`, expected-vs-actual region comparison
  BEFORE any provider call (ai-gateway), and redacted `ApiError` mapping via
  the shared `errors.ts`/`redaction.ts` (never raw bodies/headers/prompts/keys).
- Rejected: handler→`handler.ts` renames (test churn across all Vitest
  mirrors); separate `serve.ts` + entrypoint overrides (Supabase serves
  `<slug>/index.ts` by convention — override fragility); unguarded top-level
  `Deno.serve` (breaks Vitest import of the module).
- Missing-entrypoint hard stop: any of the three `index.ts` without a guarded
  `Deno.serve` block fails G12a.
- Gate class: G12a static (binding now) + live-shape proof deferred to G13.

### C4 — Node-only runtime boundaries (function path only)

- `node:fs` config reads (`loadOpenAIConfig`/`loadModelConfig` file-path
  branch): functions MUST NOT read config from disk at runtime (no such files
  on Edge). Add pure-JSON parse entries (`parseModelConfigJson`,
  `parseOpenAIConfigJson`) reusing the SAME strict Zod schemas; serve
  adapters bundle the pinned JSON statically (`import ... with
  { type: "json" }`) or receive it as injected dep. Node/Vitest loader paths
  stay for scripts/tests. Pin semantics (`gpt-5.6-luna`, `allowFallback:false`,
  unset-or-equal) unchanged.
- `process.env["OPENAI_MODEL"]` (`resolveOpenAIModel`): add explicit
  `envModel?: string` parameter; serve adapters pass
  `Deno.env.get("OPENAI_MODEL") ?? undefined`; Node path keeps current
  behavior as default. Unset-or-equal-or-throw semantics verbatim.
- `node:crypto` (`createHash`/`createHmac`/`randomBytes`): RETAINED (resolvable
  by the Edge bundler; no sync→async Web-Crypto rewrite — avoids token-format
  drift). Existing HMAC vectors authoritative: any byte drift fails G1.
- Forbidden in function graph: NEW `node:` imports beyond `node:crypto`,
  `Buffer`, `node:fs` at function runtime, direct `process.env` reads in
  `supabase/functions/**` (must flow through explicit params). G12a scans fail
  on any occurrence.
- Gate class: G12a static (binding now) + G1 vectors (binding).

### C5 — Shared-code strategy (no duplicated authority)

- Authority table (unchanged, restated for the bundle): canonical hash,
  `AgentIntentSchema`, merchant conversion, asset descriptor, 15-code mapper,
  session-token logic, model-config schema live ONLY in `packages/domain`;
  `supabase/functions/_shared/` re-exports thinly; `catalog.ts`,
  `provider-port.ts`, `chain-client.ts`, `payment-reconciler.ts` keep their
  current ownership (S1/S2/S5). Compat work adds NO logic copies — only
  specifier normalization (C2), import map (C1), and serve wiring (C3/C4).
- Drift tripwires (existing, binding): import-graph test (gateway↛signer),
  `model-config.json` assert-equal, hash-stability, keys==15. Any new
  canonicalization, mapper, or pin copy fails G1/G6.
- Gate class: existing G1/G6 (binding, unchanged).

### C6 — Gates: G12 compat + G13 staging-deploy, G7 stays non-binding

- G7 UNCHANGED: Deno test suites (`session.test.ts`, `ai-gateway.test.ts`,
  `executor.test.ts`) remain NON-BINDING CI references; absence of `deno` CLI
  is recorded, never a failure, never a substitute for G12.
- G12a — static compat scan (BINDING now, Vitest, no `deno` needed). Exact
  command: `corepack yarn vitest run supabase/functions/_shared/test/deploy-compat.vitest.test.ts`.
  New test file (compat EXECUTE creates it) asserts on the CURRENT tree first
  (RED proof of the observed failure, no deploy needed): zero bare
  `from "ethers"`/`from "zod"`; zero `.js"`-suffixed relative imports in the
  function bundle graph; zero `node:fs`/`process.env`/`Buffer` in
  `supabase/functions/**` (excluding `*.test.ts` fixtures that assert on
  sources by text); `Deno.serve` guard present in all three `index.ts`;
  `deno.json` pins equal root `package.json`; no `SUPABASE_*` names in the
  secrets-set allowlist. RED → STOP (this is the checked-in proof of the
  staging failure); GREEN after C1–C4.
- G12b — real typecheck+bundle (BINDING before any staging deploy; runs where
  the toolchain exists): `deno check` over the three entrypoints (once `deno`
  present) AND successful bundle proven by the deploy itself (G13). `deno`
  absence still never fails G1–G6+G8+G12a; it only gates G13.
- G13 — staging-only deployment acceptance (HYBRID-adjacent, approval-gated,
  separate from H1–H3): `supabase functions deploy session ai-gateway
  agent-executor --project-ref myotkovmgzdabuirkqlx` succeeds for ALL three
  slugs; `functions list` shows all three; derived
  `SUPABASE_REGIONAL_FUNCTION_URL` recorded per slug post-deploy (output
  only, never pre-required); expected region `us-east-1` matches project
  region (East US); NO `db push`/migration re-run (Phase 04 migration already
  applied); NO production project ref (allowlist is exactly
  `myotkovmgzdabuirkqlx`); H1/H2/H3 remain NOT RUN.
- G1–G6 + G8 stay binding and unchanged throughout compat work.

### Secrets contract (names only — no values in source, logs, or evidence)

- Function secrets (via dashboard/CLI, never repo): `OPENAI_API_KEY`,
  `SESSION_HMAC_SECRET`, `DEMO_TOKEN`, `OPENAI_MODEL` (unset-or-exactly
  `gpt-5.6-luna`), `CREDITCOIN_RPC_URL`.
- Platform built-ins (not settable, reserved prefix — observed): `SUPABASE_URL`,
  `SUPABASE_ANON_KEY` auto-provided; expected region is a PINNED CONSTANT
  (`us-east-1`) in serve wiring + compat test (NOT a custom secret); actual
  region source resolved at compat-EXECUTE from verified runtime docs with a
  fail-closed default on any doubt.
- ABSENT by rule in this lane: `AGENT_SIGNER_PRIVATE_KEY` (no signer path
  exercised — static/bundle/serve-shape only; any step demanding it aborts as
  scope breach), `SUPABASE_REGIONAL_FUNCTION_URL` as input (output-only,
  derived after G13).
- Presence rule (G13 Step 0, names only): the 5 function secrets present-by-name;
  signer absent; regional URL absent pre-deploy without blocking.

### Hard stops (any one aborts the lane)

Unresolved bare/` .js`-suffixed import; missing `Deno.serve` guard in any of
the three entrypoints; `deno.json` pin ≠ root manifest pin; NEW `node:` import
beyond `node:crypto`; `Buffer`/`node:fs`/`process.env` in function runtime;
16th API code or `as string` escape; hash/vector/model-pin drift (G1 red);
any behavior change to 15-code mapper, C-SESSION TTLs/predicates, C-DDL DDL
text/ordering, model pin, or fail-closed zero-send semantics; bundle/deploy
target other than allowlisted staging ref; migration re-run; `SUPABASE_*`
custom-secret attempt; secret value in source/log/evidence; H1/H2/H3 execution
under this supplement (explicitly out of scope — separate approval).

### Acceptance (compat lane EXIT)

- `ai-gateway`, `session`, `agent-executor` bundle successfully for Supabase
  (G12b/G13 green).
- G1–G6 + G8 + G12a green; G7 still non-binding; zero behavior drift per the
  guards above.
- Staging deployment may resume ONLY after G12a + G12b green; H1–H3 stay
  unexecuted and require their own approval.

### Loop-state note (this supplement)

- PLAN-SUPPLEMENT (Deno/Supabase compat) is done via this section.
- Next: PVL must encode C1–C6 with gates G12a/G12b/G13 into the Validate
  Contract delta before any compat EXECUTE. Compat EXECUTE needs explicit
  `ENTER EXECUTE MODE` with this plan path; staging deploy (G13) needs a
  second explicit approval and may not piggyback on compat approval.

---

## PVL Delta — Deno/Supabase Compatibility Supplement (11-09-26)

**Mode:** VALIDATE · **Scope:** this delta ONLY. The original Validate Contract
V1–V7 above is preserved byte-identically and is NOT restated, amended, or
re-gated here. No implementation, test file, deployment, OpenAI/RPC call,
transaction, secret access, commit, or push performed in PVL (verified: planned
paths `supabase/functions/deno.json` and
`supabase/functions/_shared/test/deploy-compat.vitest.test.ts` confirmed ABSENT;
`deno` CLI confirmed ABSENT; worktree shows plan-only diff).

**Evidence base (read-only):** original V1–V7 text; compat supplement C1–C6;
observed deploy errors (bare-`ethers` graph failure at
`ai-gateway/index.ts:14` + `session/index.ts:21`, `.js` WARNs, empty
`functions list`); execution report (G1–G6+G8 green, G7 non-binding, H1–H3 not
run); source scans (bare `ethers`/`zod`, `.js`-suffix domain imports,
`Deno.serve` absent, `node:fs`/`process.env`/`node:crypto` sites, reserved
`SUPABASE_` secret prefix); root `package.json` (`ethers@6.17.0`,
`zod@3.25.76`); repo state above.

### D1 — Pins (supplement §C1): PASS (conditional on exact implementation)

- `npm:ethers@6.17.0` / `npm:zod@3.25.76` match root manifest exactly
  (verified by read). Delta requires string-equality assertion in G12a —
  any drift fails the lane. No unpinned CDN, no vendoring, no `openai`
  package under any specifier (S1 upheld). No second version permitted
  across manifest/lockfile/map.

### D2 — Domain boundary (§C2): PASS with noted override

- Single authority (`packages/domain`) restated; `.js`→`.ts` normalization is
  explicit and mechanical; no logic fork (`_shared` stays re-export).
- Override flagged and accepted: suffix edits touch Phase 01-consumed files,
  authorized ONLY as mechanical renames guarded by UNCHANGED
  `intent-shape` hash-stability + `api-error-codes` keys==15/no-`as string` +
  `session-token` HMAC vectors (all binding G1). Any drift = lane failure.
- Function-to-domain `.ts` imports proven uploadable by server log evidence.

### D3 — Runtime boundary (§C3/C4): PASS

- Guarded `Deno.serve` in all three existing `index.ts` (guard shape pins
  `typeof Deno` check so Node/Vitest never executes); no renames, no export
  changes, Vitest paths untouched. Missing guard in any entrypoint = G12a
  failure. Correctly rejects unguarded-serve and entrypoint-override designs.
- `node:crypto` retention is explicit and bounded (avoids sync→async token
  drift; vectors authoritative). `node:fs`/`process.env` removal via
  pure-JSON parse entries + explicit `envModel` param preserves pin and
  unset-or-equal semantics verbatim. New `node:`/`Buffer` forbidden and
  scanned.

### D4 — Behavior preservation: PASS (mapped, no gaps)

| Invariant | Guard (all binding, unchanged) |
|---|---|
| 15-code mapper | `api-error-codes` keys==15 + no-`as string` + identical-code fixtures (G1/G6) |
| C-SESSION TTL/hash/consume | `session-token` vectors + fake-store consume-once/revoke (G1/G3-shape) + migration predicates |
| C-DDL/idempotency/reconcile | `payment` state machine + one-send/store-before-wait/reconcile asserts (G1/G4-shape) |
| `gpt-5.6-luna` + `allowFallback:false` | `provider-config` pin/fallback-reject (G1/G3-shape) |
| Zero-send fail-closed | `sendPayment==0` asserts every failure class (G3/G4) |
| No second truth | import-graph gateway↛signer + assert-equal model config (G4/G6) |

### D5 — Gates: PASS

- G1–G6 + G8 binding unchanged; G7 CI-only/non-binding unchanged (correctly
  NOT widened). G12a binding Vitest with exact command pinned. G12b binding
  pre-deploy (`deno check` + bundle-via-deploy). G13 staging-only with exact
  ref `myotkovmgzdabuirkqlx`, no `db push`, URL output-only, H1–H3 excluded.

### D6 — RED-first: PASS

- G12a asserts fail on the CURRENT tree on every clause (bare `ethers` at two
  cited sites + domain-wide, `.js` suffixes domain-wide, `Deno.serve` absent
  in all three, `deno.json` absent) — genuine RED available without deploying.
  Planned-path absence is valid pre-EXECUTE state. PVL created zero files
  (verified above).

### D7 — Secrets (names only): PASS

- Five function-secret names + built-ins + pinned-region constant (correctly
  encodes the observed reserved-prefix constraint instead of fighting it);
  actual-region source honestly deferred to verified docs with fail-closed
  default. Signer-absent + URL-output-only rules explicit with abort
  semantics. No value printed, accessed, or persisted in PVL.

### D8 — Hard stops: PASS (complete)

- Covers unresolved imports, missing entrypoints, pin drift, behavior drift,
  wrong project, migration re-run, `SUPABASE_*` set attempt, secret leakage,
  any OpenAI/RPC/transaction, any H1/H2/H3. No gap found vs. the 8 assigned
  validation dimensions.

### Toolchain note (per instruction — no faked pass, no scope widening)

- `deno` CLI ABSENT on this machine → **G12b recorded PENDING/CONDITIONAL**:
  not runnable here, not claimed, and not re-scoped onto G7 (G7 stays test-only
  non-binding). G12a + all behavior guards are fully runnable without `deno`.
  G13 additionally requires the second explicit approval named in the
  supplement.

### Net gate: CONDITIONAL PASS (delta only)

- Zero FAILs across D1–D8; one PENDING (G12b toolchain, environmental — not a
  content defect). Original V1–V7 gate (CONDITIONAL) is neither improved nor
  worsened by this delta.
- Authorized next: compat EXECUTE (C1–C4 + G12a RED→GREEN, G1–G6+G8 held
  green) ONLY on explicit `ENTER EXECUTE MODE` with this plan path. G13
  staging deploy needs its own second approval. H1/H2/H3 remain out of scope.

---

## Compatibility Execute Result (11-09-26)

**Status:** IMPLEMENTED · G12a GREEN · G12b PENDING/CONDITIONAL · G13 NOT RUN

- RED-first completed: created
  `supabase/functions/_shared/test/deploy-compat.vitest.test.ts`; the initial
  focused run was genuine RED (6/6 clauses failed) on the pre-compat tree:
  missing `deno.json`, bare/unmapped imports, `.js` domain suffixes, missing
  `Deno.serve` adapters, missing pure-JSON config boundary, and missing region
  wiring.
- C1–C4 implemented: exact `supabase/functions/deno.json` pins; mechanical
  domain `.js`→`.ts` imports; guarded `Deno.serve` adapters in all three
  required slugs; pure JSON model-config parsers and explicit `envModel`
  boundary; no new `node:`/`Buffer` runtime usage. Existing `node:crypto`
  remains the explicitly retained boundary and is not claimed uploadable until
  G12b runs.
- G12a exact focused command GREEN: 6 tests passed. Static scan covers pins,
  no openai/CDN/vendoring, import normalization, three slugs/guards, runtime
  boundaries, and expected-region wiring.
- Binding local verification GREEN: G1 domain 91/91; G2 edge 5/5; G3 gateway
  4/4; G4 executor 5/5; G5 typecheck, lint, AICD clean; G6 secret scan 967
  scanned/0 findings + `git diff --check`; full Vitest 23 files/145 tests.
  G8 remains satisfied by the existing redaction/error-copy review and no
  behavior-preservation test drift was observed.
- G7 remains CI-only/non-binding. `deno` is absent on this machine, so G12b
  `deno check`/local bundle validation is **PENDING/CONDITIONAL**, not faked.
  No Supabase deploy, migration, OpenAI call, RPC call, transaction, G13, or
  H1/H2/H3 execution occurred. `AGENT_SIGNER_PRIVATE_KEY` was not requested
  or accessed; the regional function URL remains deployment output-only.
- Scope guard: no Phase 01–03 behavior was changed; domain edits are the
  supplement-authorized mechanical import-suffix normalization plus the
  explicit C4 parser/env boundary required to make the shared authority
  consumable by Edge. No exports were renamed and Vitest paths remain intact.

**Handoff:** G12a GREEN; G12b honestly PENDING/CONDITIONAL; G13 NOT RUN;
H1/H2/H3 NOT RUN. A Deno-enabled validation environment must run G12b before
any staging deployment approval.

---

## Compatibility EVL Result (11-09-26)

**Status:** EVL COMPLETE · G12a GREEN · G12b PENDING/CONDITIONAL · G13/H1/H2/H3 NOT RUN

- Independent G12a rerun: 6/6 tests passed.
- Independent G1 rerun: domain 13 files, 91 tests passed. Independent G2–G4
  rerun: edge 5, gateway 4, executor 5 tests passed (14/14 total).
- G5 rerun: typecheck passed; lint passed; AICD validation reported 0
  failures. G6 rerun: secret scan 967 scanned / 0 findings; `git diff --check`
  passed. G8 review remains clean: fixed redaction/error-copy boundaries,
  request IDs, retryability, and demo-token separation remain intact.
- Behavior preservation verified by the unchanged passing guards: 15-code
  mapper, C-SESSION TTL/hash/atomic consume, C-DDL idempotency/reconcile and
  store-before-wait, pinned `gpt-5.6-luna` with `allowFallback:false`, and
  zero `sendPayment` on fail-closed paths.
- Name-only environment check: `AGENT_SIGNER_PRIVATE_KEY` ABSENT;
  `SUPABASE_REGIONAL_FUNCTION_URL` ABSENT as required before deployment;
  no secret values were printed or accessed. `deno` ABSENT, therefore G12b
  remains PENDING/CONDITIONAL and no bundle result is claimed.
- EVL invoked no OpenAI/RPC/transaction/deployment activity and did not run
  G13 or H1/H2/H3. No implementation files were modified during EVL.

---

## Plan Supplement — Pin Deno Toolchain for G12b (11-09-26)

**Mode:** PLAN-SUPPLEMENT · **Scope:** plan files only. This pin validates
local Deno compatibility; it does not prove the hosted Supabase runtime and
does not authorize G13, H1, H2, or H3.

### Pin

- Exact Deno version: **2.9.6**.
- No range, `latest`, floating channel, or ambient system Deno is permitted.
- Repository inspection found no existing Deno version pin, CI setup, toolchain
  file, or lockfile convention to reuse. The pin is therefore recorded in this
  Phase 04 plan as the authoritative G12b bootstrap requirement without
  changing `package.json`, application files, or lockfiles.

### Official installation and verification

On a machine where `deno` is absent, install the exact release using the
official Deno installer with the version argument:

```bash
curl -fsSL https://deno.land/install.sh | sh -s v2.9.6
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"
deno --version
```

Required version output prefix:

```text
deno 2.9.6
```

The first line of `deno --version` must be exactly `deno 2.9.6`; the V8 and
TypeScript lines are emitted by that release and are not independently pinned
by this repository. Any other Deno version is a hard stop. Installation must
be performed only in the operator's
tool environment, never committed or persisted in the repository.

### G12b procedure after bootstrap

Run the exact version check, then the binding local checks:

```bash
deno --version
deno check --config supabase/functions/deno.json \
  supabase/functions/session/index.ts \
  supabase/functions/ai-gateway/index.ts \
  supabase/functions/agent-executor/index.ts
```

Local bundle validation must use Deno 2.9.6 without deployment. The bundle
probe must resolve the same `supabase/functions/deno.json` import map and must
fail closed on unresolved imports, missing `Deno.serve`, or Node-only runtime
boundaries. A successful local Deno check/probe is G12b local evidence only.

### Compatibility and hosted-runtime boundary

- Static plan review found no known conflict between Deno 2.9.6, the pinned
  `npm:ethers@6.17.0` / `npm:zod@3.25.76` map, or the repository's Node/Yarn
  constraints. This is not a runtime pass; G12b remains pending until the
  exact tool is installed and commands execute.
- Any Deno 2.9.6 import-map, typecheck, or bundle conflict is a hard stop:
  report the exact conflict and do not change application behavior or pins
  silently.
- Supabase hosted bundling/runtime acceptance remains reserved for G13 and
  requires separate approval with project ref `myotkovmgzdabuirkqlx`.

### Safety and status

- No Deno installation, G12b execution, Supabase link/deploy, migration,
  OpenAI/RPC call, transaction, secret access, commit, or push occurs in this
  PLAN-SUPPLEMENT mode.
- `AGENT_SIGNER_PRIVATE_KEY` remains absent; `SUPABASE_REGIONAL_FUNCTION_URL`
  remains deployment output-only.
- H1/H2/H3 and G13 remain NOT RUN.
- Next state: PVL must validate this exact pin and command contract before
  G12b bootstrap/EXECUTE resumes.

---

## Deno Pin PVL Result (11-09-26)

**Status:** PVL COMPLETE · CONDITIONAL PASS · READY FOR EXECUTE

- **Exact pin — PASS:** the new supplement records only Deno `2.9.6` as the
  authoritative G12b version. No Deno range, `latest`, floating channel, or
  second repository pin was found in the inspected package, lockfile, CI, or
  toolchain surfaces. The repository still has no installed `deno` binary.
- **Installer/verification — PASS:** the exact recorded installer command is
  `curl -fsSL https://deno.land/install.sh | sh -s v2.9.6`; the required first
  version line is exactly `deno 2.9.6`. No installation was performed in PVL.
- **G12b command — PASS:** the recorded `deno check` command explicitly uses
  `--config supabase/functions/deno.json` and all three function entrypoints.
- **Compatibility — PASS (static only):** no static conflict was found with
  `npm:ethers@6.17.0`, `npm:zod@3.25.76`, Node `>=20`, or Yarn `1.22.22`.
  Runtime compatibility remains unproven until G12b executes under Deno
  2.9.6.
- **Runtime boundary — PASS:** the supplement explicitly limits this pin to
  local Deno compatibility. Hosted Supabase bundling/runtime acceptance stays
  reserved for G13, with project ref `myotkovmgzdabuirkqlx`.
- **Gate status — PASS:** G12b remains binding before G13. G13, H1, H2, and
  H3 remain explicitly NOT RUN.
- **Concern C-PIN-BUNDLE-SCOPE:** original G12b text describes successful
  bundle proof via deployment/G13, while the pin supplement describes a
  no-deployment local bundle probe. These are retained as separate evidence:
  local probe is G12b local evidence; hosted Supabase bundle acceptance is
  G13 evidence. EXECUTE must not claim G12b hosted-bundle proof from the local
  probe alone.
- **Safety verification:** plan-only validation; no Deno installation,
  implementation change, Supabase link/deploy, OpenAI/RPC/transaction call,
  secret access, commit, or push. H1/H2/H3/G13 remain NOT RUN.

---

## G12b Execute Result (11-09-26)

**Status:** G12b GREEN · G12a GREEN · G13/H1/H2/H3 NOT RUN

- Installed the exact pinned toolchain with the approved command:
  `curl -fsSL https://deno.land/install.sh | sh -s v2.9.6` (exit 0).
- `deno --version` (exit 0) output:

  ```text
  deno 2.9.6 (stable, release, x86_64-unknown-linux-gnu)
  v8 15.0.245.2-rusty
  typescript 6.0.3
  ```

- Exact G12b check (exit 0):

  ```bash
  deno check --config supabase/functions/deno.json \
    supabase/functions/session/index.ts \
    supabase/functions/ai-gateway/index.ts \
    supabase/functions/agent-executor/index.ts
  ```

  Redacted output: `Check supabase/functions/session/index.ts`,
  `Check supabase/functions/ai-gateway/index.ts`, and `Check
  supabase/functions/agent-executor/index.ts`.
- Local bundle validation (exit 0 for all three; output files only under
  `/tmp/opencode`, not the repository):

  ```bash
  deno bundle --config supabase/functions/deno.json \
    supabase/functions/session/index.ts \
    --output /tmp/opencode/pact-session.js
  deno bundle --config supabase/functions/deno.json \
    supabase/functions/ai-gateway/index.ts \
    --output /tmp/opencode/pact-ai-gateway.js
  deno bundle --config supabase/functions/deno.json \
    supabase/functions/agent-executor/index.ts \
    --output /tmp/opencode/pact-agent-executor.js
  ```

  Redacted results: `Bundled 172 modules`, `Bundled 184 modules`, and
  `Bundled 6 modules`; output sizes were `105.4KB`, `241.76KB`, and `9.73KB`.
  The first exploratory invocation used an invalid positional output argument
  and returned `No such file or directory`; it was not treated as a pass and
  was corrected using Deno 2.9.6's documented `--output` option.
- G12a rerun: 6/6 passed. Domain G1: 13 files / 91 tests passed. Edge,
  gateway, executor G2–G4: 14/14 passed. Typecheck, lint, AICD, secret scan
  (`967 scanned`, `0 findings`), and `git diff --check` passed.
- Name-only safety check: `AGENT_SIGNER_PRIVATE_KEY: ABSENT`;
  `SUPABASE_REGIONAL_FUNCTION_URL: ABSENT`. No secrets were printed or
  accessed. No source files were modified by bootstrap or G12b. No Supabase
  deployment/link, migration, OpenAI/RPC call, or transaction occurred.

---

## Plan Supplement — Hosted Supabase Bundle Resolution (11-09-26)

**Mode:** PLAN-SUPPLEMENT · **Scope:** plan/spec only. G13 is not retried by
this supplement. The failed hosted G13 evidence above remains unchanged and
authoritative.

### Factual diagnosis

- Local G12b resolved `ethers` and `zod` through the repository-level
  `supabase/functions/deno.json`, because the explicit local commands supplied
  that config with `--config`.
- The hosted Supabase 2.117.0 deploy path did not consume that repository-level
  config for the uploaded function graph. It uploaded `session/index.ts` and
  `ai-gateway/index.ts`, then resolved their bare `from "ethers"` imports as
  hosted relative imports and failed with the recorded 400 error.
- `supabase/config.toml` is absent, so there is no existing project-level
  `import_map` wiring to rely on. The current root `supabase/functions/deno.json`
  is therefore insufficient evidence for hosted resolution.
- `agent-executor` does not import `ethers` directly, but its reachable shared
  graph is included in the same deterministic-resolution requirement; all three
  deployable functions must carry their own config boundary.

### Decision — function-local `deno.json` per deployable function

Chosen strategy: add one identical, function-local config at each exact
deployable boundary:

```text
supabase/functions/session/deno.json
supabase/functions/ai-gateway/deno.json
supabase/functions/agent-executor/deno.json
```

Each file must contain only the pinned mappings:

```json
{
  "imports": {
    "ethers": "npm:ethers@6.17.0",
    "zod": "npm:zod@3.25.76"
  }
}
```

Rationale: the config travels with every uploaded function and does not depend
on a global/root import-map lookup. It changes resolution only; it does not
duplicate domain logic or alter API behavior.

Rejected alternatives:

- **Explicit `npm:` imports at shared/domain boundaries:** rejected because it
  would modify the Phase 01-consumed shared import surface and create a larger
  cross-runtime behavior blast radius than config-only wiring.
- **`supabase/config.toml` import-map wiring:** unavailable because the file is
  absent, and introducing project-level wiring would not prove that the hosted
  per-function upload path consumes it.
- **Repository-root-only `supabase/functions/deno.json`:** rejected by the
  actual G13 failure; local G12b success through `--config` did not transfer to
  hosted bundling.
- **CDN, floating, or unpinned mappings:** forbidden. No `openai` package is
  permitted.

### Import-graph and behavior boundary

- All reachable imports from `session`, `ai-gateway`, and `agent-executor` must
  resolve through the function-local config. The graph must retain explicit
  `.ts` local imports and the exact `ethers@6.17.0` / `zod@3.25.76` mappings.
- `packages/domain` remains the sole authority for canonical hash, schemas,
  merchant conversion, asset descriptor, error mapper, session-token logic,
  model configuration, and payment state. Function-local configs contain no
  implementation logic.
- Preserve unchanged: 15-code mapper; merchantId-only output; pinned
  `gpt-5.6-luna`; `allowFallback:false`; Responses `store:false`; C-SESSION
  TTL/hash/atomic-consume rules; C-DDL/idempotency/reconcile ordering;
  `sendPayment` zero on failure; and no settlement on uncertain result.
- Existing G1/G3/G4/G6 tripwires remain binding: keys==15, hash stability,
  HMAC vectors, model equality, gateway↛signer graph, zero-send failure
  assertions, and no secret material.

### RED-first compatibility gate

Add the planned compatibility assertion to the existing deploy-compat test
surface without implementing it in this PLAN-SUPPLEMENT:

```text
supabase/functions/_shared/test/deploy-compat.vitest.test.ts
```

The new RED clause must fail on the current tree because the three
function-local configs do not exist, even though root `deno.json` exists. It
becomes GREEN only when all three exact files exist and:

- each JSON map equals the two exact pinned mappings;
- no function relies on the root map alone;
- all three entrypoints have a reachable local-config resolution boundary;
- no CDN, range, floating mapping, vendored runtime, or `openai` package is
  present; and
- the existing import, Deno.serve, Node-boundary, slug, and behavior tripwires
  remain green.

### Revised G12b — deterministic local equivalent of hosted resolution

G12b must no longer run only with the root config. After EXECUTE creates the
three local configs, run with Deno 2.9.6:

```bash
deno --version
deno check --config supabase/functions/session/deno.json \
  supabase/functions/session/index.ts
deno check --config supabase/functions/ai-gateway/deno.json \
  supabase/functions/ai-gateway/index.ts
deno check --config supabase/functions/agent-executor/deno.json \
  supabase/functions/agent-executor/index.ts
deno bundle --config supabase/functions/session/deno.json \
  supabase/functions/session/index.ts \
  --output /tmp/opencode/pact-session-hosted-equivalent.js
deno bundle --config supabase/functions/ai-gateway/deno.json \
  supabase/functions/ai-gateway/index.ts \
  --output /tmp/opencode/pact-ai-gateway-hosted-equivalent.js
deno bundle --config supabase/functions/agent-executor/deno.json \
  supabase/functions/agent-executor/index.ts \
  --output /tmp/opencode/pact-agent-executor-hosted-equivalent.js
```

The exact CLI/toolchain pins are Supabase CLI `2.117.0` and Deno `2.9.6`.
The local CLI/runtime preflight is:

```bash
npx supabase --version
npx supabase functions serve session ai-gateway agent-executor \
  --no-verify-jwt
```

The serve command is local-only and must be terminated after the bundle/startup
check; it must not receive a production URL, call OpenAI, call RPC, or mutate
chain/database state. G12b is GREEN only if `npx supabase --version` reports
`2.117.0`, all six Deno check/bundle commands succeed, the local serve startup
resolves all three function-local configs, the compatibility test is GREEN,
and the existing G1–G6/G8 gates remain green. A local pass is not a hosted
deployment pass.

### Revised G13 proof, deferred and approval-gated

After the revised G12b GREEN result and a new explicit deployment approval:

1. Verify project ref `myotkovmgzdabuirkqlx` immediately before mutation.
2. Deploy only `session`, `ai-gateway`, and `agent-executor` with Supabase CLI
   `2.117.0`; do not rerun or modify migrations.
3. Stop immediately on any bundle/deploy error; do not retry blindly.
4. Query `supabase functions list --project-ref myotkovmgzdabuirkqlx` and
   confirm all three exact slugs and deployment status.
5. Derive the real regional function URL only from successful deployment or
   project output. Never prepopulate or invent
   `SUPABASE_REGIONAL_FUNCTION_URL`.
6. Record redacted deployment evidence only: project ref, slug, status,
   version/timestamp, and returned URL metadata. Never record secret values.
7. G13 does not run H1, H2, or H3; those remain separately approval-gated.

### Safety and status

- This supplement performs no code change, deployment, migration, OpenAI/RPC
  call, transaction, secret access/write, commit, or push.
- The failed G13 evidence is preserved exactly; no successful hosted deployment
  or function URL is claimed.
- `AGENT_SIGNER_PRIVATE_KEY` remains absent. H1/H2/H3/G13 remain NOT RUN.

**Handoff:** HOSTED BUNDLE RESOLUTION PLAN SUPPLEMENT COMPLETE — READY FOR PVL

---

## Hosted Bundle Resolution Execute Result (11-09-26)

**Status:** IMPLEMENTED · G12a GREEN · revised G12b GREEN · READY FOR EVL ·
G13/H1/H2/H3 NOT RUN

- Toolchain gate: Deno `2.9.6` and Supabase CLI `2.117.0` matched exactly.
- RED-first: updated `deploy-compat.vitest.test.ts` to require a function-local
  map for each slug. Before implementation, the focused suite failed 2/6:
  `session/deno.json must exist` and missing local config resolution. The other
  four existing compatibility clauses passed.
- Minimum implementation files added, each containing only the exact pinned
  `ethers` and `zod` mappings:
  - `supabase/functions/session/deno.json`
  - `supabase/functions/ai-gateway/deno.json`
  - `supabase/functions/agent-executor/deno.json`
- No entrypoint, domain implementation, export, adapter, or Phase 04 behavior
  changed. The root `supabase/functions/deno.json` remains unchanged.
- GREEN: focused compatibility suite 6/6 passed.
- Revised G12b: all three per-function `deno check` commands passed; all three
  per-function `deno bundle` commands passed. Bundles were written only under
  `/tmp/opencode`.
- Regression gates: G1 domain 91 tests passed; G2–G4 edge/gateway/executor
  14 tests passed; typecheck, lint, AICD, secret scan (`970 scanned`, `0
  findings`), and `git diff --check` passed. G8 review found no new error-copy,
  redaction, request-ID, retryability, or demo-token boundary drift.
- Local Supabase CLI preflight reported `2.117.0`. The prescribed local serve
  command stopped with `supabase start is not running`; no local stack was
  started and no external call or mutation occurred. This is a known local
  environment concern, not a hosted deployment result.
- Generated `session/deno.lock` and `ai-gateway/deno.lock` artifacts were
  removed; no generated Deno lockfile remains in the repository.
- Safety: `AGENT_SIGNER_PRIVATE_KEY` absent; deployment URL remains unset and
  output-only. No G13 retry, migration, OpenAI/RPC call, transaction, secret
  access/write, commit, or push occurred. Failed G13 evidence remains
  preserved unchanged.

**Exact implementation files changed:**

```text
supabase/functions/_shared/test/deploy-compat.vitest.test.ts
supabase/functions/session/deno.json
supabase/functions/ai-gateway/deno.json
supabase/functions/agent-executor/deno.json
```

**Handoff:** HOSTED BUNDLE RESOLUTION IMPLEMENTATION COMPLETE — READY FOR EVL

---

## G12b Crypto-Typing Fix Verification (11-09-26)

**Status:** VERIFIED · G12a GREEN · G13/H1/H2/H3 NOT RUN

Independent EVL verification recorded the ambient `randomUUID` crypto typing fix.
The change is typing-only: it does not alter runtime behavior, API behavior, or
business logic.

- Toolchain: Deno `2.9.6`.
- Focused `ai-gateway` check: GREEN.
- Per-function checks: `3/3` GREEN.
- Per-function bundles: `3/3` GREEN using the supported command shape
  `deno bundle --no-lock -c <function>/deno.json -o <output> <entrypoint>`.
- Regressions: G12a `6/6`; full Vitest `145/145`; typecheck, lint, and AICD
  GREEN; secret scan `970/0`; `git diff --check` GREEN.
- Lockfile and secret-name boundaries: `deno.lock` absent;
  `AGENT_SIGNER_PRIVATE_KEY` absent.
- Implementation fix scope only: `supabase/functions/ai-gateway/index.ts`
  and `supabase/functions/agent-executor/index.ts`.
- Scope boundary: ambient `randomUUID` typing only; no runtime or
  business-behavior drift.

The original G13 bare-ethers failure is preserved unchanged. G13, H1, H2, and
H3 remain **NOT RUN**. No deployment, OpenAI/RPC call, migration, transaction,
secret-value access, commit, or push occurred in this verification.
