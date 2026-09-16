---
name: context:live-e2e
description: Pact Advance Testnet preflight, deployment verification, model access, and evidence-lane checks.
keywords: live, advance, testnet, rpc, deployment, preflight, evidence, asc, model, region
related: [context:all-tests]
date: 10-09-26
---

# Advance Testnet and Live Evidence

## Scope

This document covers the hybrid lane that verifies Pact against Creditcoin EVM
Advance Testnet and the configured OpenAI region/model. It is owned by Phase 07
and is separate from local automated tests. Reading this file does not grant
permission to broadcast transactions or mutate testnet state.

## Required Gates

- target network is explicitly `advance-testnet`;
- the canonical network config and deployment manifest pass parity checks;
- chain ID, RPC identity, contract bytecode, owner/agent wiring, and ASC
  verifier identity are verified;
- model access and permitted region pass without provider/model substitution;
- disposable wallet labels and server-side secret names are present without
  exposing values;
- preflight is read-only before any approved broadcast;
- evidence is redacted and links only to target-chain transactions/logs.

## Planned Commands

    node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
    node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run
    node scripts/verify-model-access.mjs --network advance-testnet
    node scripts/rehearse-live-demo.mjs --network advance-testnet --dry-run
    node scripts/check-no-secrets.mjs

The non-dry-run rehearsal requires an explicit live-lane approval. It must
record transaction hashes, receipt status, matching indexed events, and
explorer links, while never claiming settlement from a single signal.

## Current Blockers

Setup-time blockers (network config, deployment manifest, live scripts, exact
Advance identity, ASC verifier details, provider access) are resolved for the
Phase 03 Task 5B single-proof lane only: source 11155111 / target 102031 /
chainKey 1 verified; preflight exit 0 via untracked verified config; one
Sepolia `recordCredit` → proof → Advance `execute` → `CreditVerified` recorded
in `config/deployments/asc-evidence-rehearsal.json` (schema-valid, EVL PASS
2026-09-10). No second proof performed.

Remaining for Phase 07 full demo: model/region live access, production-shaped
deployment manifest parity, Playwright demo path, and runbook rehearsal. No
further live testnet action without a new lane approval.

Phase 04 local G14-G17 runtime-wiring EVL (2026-09-11) is GREEN: genuine RED
was captured before implementation; focused tests are 4/4, relevant Vitest is
119/119, function regression is 13/13, G1-G6/G8 are GREEN, G7 is
CI-only/non-binding, G12a is 6/6, G12b is GREEN under Deno `2.9.6`, and
typecheck/lint/AICD/diff-check are GREEN with secret scan 975/0. Local
session/gateway/executor/health behavior is verified. This proves only local
runtime behavior and does not prove hosted deployment or remote schema parity;
parity remains UNKNOWN/HYBRID-ONLY.

The newly implemented runtime wiring has not been deployed and current staging
does not reflect it. The earlier G13 deployment-only success remains preserved.
A post-runtime G13 staging redeploy is required before H1-H3. H1-H3 are NOT RUN
and separately approval-gated. The local Supabase serve check was not run, and
no deployment, migration, OpenAI/RPC call, transaction, or secret access is
implied by this local EVL.

Phase 04 Option A persistence foundation EVL (2026-09-12, local/static
only) is GREEN: focused `7/49`, full `29/171`, G18 GREEN, G19 GREEN, G20
`16/16` GREEN, G21 GREEN, G22 UNKNOWN/HYBRID-ONLY, G1-G6/G8 GREEN, G7
CI-only, G12a `6/6`, G12b GREEN under Deno `2.9.6` (`3+3`),
typecheck/lint/AICD GREEN, secret scan `989/0`, `git diff --check` GREEN, no
`deno.lock`, `AGENT_SIGNER_PRIVATE_KEY` absent, V1 staleness doc-only.
Migration `supabase/migrations/202609120001_persistence_contracts.sql` is
created/static-only and NOT applied; staging is unchanged. G13 evidence is
preserved but predates the foundation. Live routing is unchanged: no staging
migration, no G13 redeploy, no G22 parity check, and no H1-H3 without
separate explicit approvals. Remote remains UNKNOWN/HYBRID-ONLY.

Phase 04 hybrid backlog (2026-09-11, NOT executed): H1 live `gpt-5.6-luna`
structured-output call, H2 regional `preflightPay` static-call evidence, H3
fixed `SUPABASE_REGIONAL_FUNCTION_URL` + region confirmation. `AGENT_SIGNER_PRIVATE_KEY`
is absent by design and `SUPABASE_REGIONAL_FUNCTION_URL` is absent until a
successful G13 deployment derives it. Local implementation and bundle-equivalent
checks are green (fake-backed); hybrid gates require separate explicit approval
per the Phase 04 Validate Contract. No fallback model/region/direct payment is
ever permitted.

## Update Triggers

Refresh when chain identity, deployment addresses, model/region access, ASC
decoder, evidence schema, live command, or approval boundary changes.

## Current Phase 04 H1-H3 Status (2026-09-13, REDACTED)

Corrected approved lane target: `https://myotkovmgzdabuirkqlx.supabase.co/functions/v1`
for project `myotkovmgzdabuirkqlx`. Precheck versions were `session` v6,
`ai-gateway` v6, and `agent-executor` v7, all `ACTIVE`; the signer was absent.
The prior `/functions/v1/agent-executor/preflight` 404 remains preserved as an
invalid probe-path result, not H2 evidence. The corrected public H2 route is
`POST /functions/v1/agent-executor/v1/payments/preflight`.

- H1 `POST /functions/v1/ai-gateway/v1/agent/intents`: payload shape only
  `{prompt,cardId}` with approved local fixture `buy coffee`/`7`; assertions
  were model `gpt-5.6-luna`, `allowFallback:false`, `store:false`. Two attempts
  returned HTTP `503`, mapped `REGION_MISMATCH`; final keys were
  `[code,message,requestId]`, with no provider request ID/intent/store.
  **H1 BLOCKED**, not success.
- H2 corrected route with approved fixture
  `{intentId:"intent-1",cardId:"7",nonce:"7:1"}` from
  `prefix-routing.vitest.test.ts`: one HTTP `503` `PREFLIGHT_DECLINED`, keys
  `[code,message,requestId]`. No static decision/reasonCode/chainId/checkedAt,
  transaction, gas, signer, or static-call result was produced. **H2 BLOCKED**;
  no RPC success is claimed.
- H3 `GET /functions/v1/ai-gateway/health`: one HTTP `200`; keys
  `[chainId,configuredRegion,expectedRegion,model,modelAvailable,provider,requestId]`;
  `chainId` `102031`, provider `openai`, `modelAvailable:false`,
  `configuredRegion:unknown`, `expectedRegion:us-east-1`. The session route
  gate remains `503 PROVIDER_UNAVAILABLE` from G13 smoke. Health reachability
  only, no region evidence. **H3 PARTIAL**.

Budget was H1 `2` attempts, H2 `1` HTTP attempt, and H3 `1` HTTP attempt;
transactions/gas/signer/migrations were `0`. No secret values were printed or
accessed, no H1/H2/H3 implementation changes occurred, and no commit or push
occurred. Final status: **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**; Phase 04 is
**NOT READY FOR CLOSEOUT**. The next action requires a new bounded
correction/approval for region/runtime configuration or valid H2 runtime wiring;
do not rerun this lane without new approval.

### Latest bounded autopilot rerun (2026-09-13, REDACTED)

The latest explicitly approved staging rerun is recorded in the Phase 04
report's `H1-H3 Autopilot Bounded Rerun Appendix`. It preserved the prior
dispositions and produced the same fail-closed classification with a smaller
bounded request count: H1 one HTTP request returned `503 REGION_MISMATCH`, H2
one corrected preflight request returned `503 PREFLIGHT_DECLINED` without
usable static-call fields, and H3 one fixed prefixed health GET returned `401`
with its unapproved payload withheld. H1/H2/H3 remain **BLOCKED / BLOCKED /
PARTIAL**; no RPC success, provider success, region match, session, intent,
transaction, gas, signer operation, migration, secret-value output, commit, or
push is claimed. Post-lane secret scan was `994/0` and `git diff --check` was
green.

## Current H1-H3 Corrected Global-Edge Autopilot Status (2026-09-14, REDACTED)

The approved staging target remained project/ref `myotkovmgzdabuirkqlx` only.
Names-only precheck confirmed active function versions `session v11`,
`ai-gateway v11`, and `agent-executor v12`; `PACT_EXPECTED_REGION` and the
approved server-side names were present by name; `AGENT_SIGNER_PRIVATE_KEY`
was absent. Local assertions confirmed `openai` / `gpt-5.6-luna`,
`allowFallback:false`, `store:false`, strict `pact_agent_intent`, and
merchantId-only authority fields. No secret values were printed, accessed for
output, or persisted.

The corrected global-edge semantics were used: expected project region
`us-east-1`; `SB_REGION` is platform-observed only and is not required to equal
the project region. One exact H1 request returned HTTP `401 AUTH_REQUIRED`
before provider/persistence evidence, so **H1 BLOCKED**. One exact corrected H2
preflight request returned HTTP `401 AUTH_REQUIRED`; no valid disposable wallet
session was available in existing lane inputs, and no decision/reasonCode/
chainId/checkedAt or static RPC evidence was produced, so **H2 BLOCKED**.

Exactly one fixed prefixed H3 health GET returned HTTP `200` with the exact
seven-key shape. Safe metadata reported `chainId=102031`, observed runtime
`configuredRegion=ap-southeast-1`, expected project `expectedRegion=us-east-1`,
model `gpt-5.6-luna`, `modelAvailable=false`, and provider `openai`. These are
health metadata only; health does not prove provider access or H1 success, so
**H3 PARTIAL**.

Budgets used: H1 `1` regional request and `0` retries; H2 `1/3` preflight
requests; H3 `1/1` health GET. Transactions, gas, signer operations,
migrations/resets/pushes, and lane-created rows were `0`; cleanup actions were
`0`. G22 remains **UNKNOWN/DRIFT**. Final status remains **H1 BLOCKED / H2
BLOCKED / H3 PARTIAL** and Phase 04 is not ready for closeout.

### Authenticated checkpoint rerun (2026-09-14, REDACTED)

The environment presence check for `PACT_SESSION_TOKEN` was `PRESENT`; its
value was never printed, inspected, hashed, persisted, or returned. No health
request was made because the approved H3 result was carried forward unchanged.

- H1 exact route `POST /functions/v1/ai-gateway/v1/agent/intents`: one
  authenticated request with the approved minimal fixture returned HTTP `401`
  `AUTH_INVALID`; response keys `[code,message,requestId,retryable]`, request ID
  `autopilot-h1-01`, latency `728.849ms`, no provider request ID, and no
  persistence observed. **H1 BLOCKED**.
- H2 exact route `POST /functions/v1/agent-executor/v1/payments/preflight`: one
  authenticated request with the approved server-bound disposable fixture
  returned HTTP `401` `AUTH_INVALID`; response keys
  `[code,message,requestId,retryable]`, request ID `autopilot-h2-01`, latency
  `302.463ms`, and no decision/reasonCode/chainId/checkedAt or static-call
  evidence. **H2 BLOCKED**.
- H3 remains the approved single HTTP `200` health result with the exact
  seven-key shape, expected `us-east-1`, observed `ap-southeast-1`,
  `modelAvailable=false`, provider `openai`, and model `gpt-5.6-luna`.
  **H3 PARTIAL**.
- Budget: H1 `1/3` with `0` retries; H2 `1/3` with `0` retries; H3 `1/1`
  carried forward with `0` new requests. Transactions, gas, signer
  operations, migrations/resets/pushes, lane-created rows, and cleanup actions
  were all `0`. No raw payloads, response bodies, prompts, card data, keys, or
  token values were recorded.

Final status remains **H1 BLOCKED / H2 BLOCKED / H3 PARTIAL**. Blocker:
`AUTH_INVALID`; no provider or read-only RPC success is claimed.

## Current H1-H2 Staging Completion Attempt (2026-09-14, REDACTED)

The local read-only preflight correction passed focused executor/runtime tests
`11/11`, typecheck, lint, AICD, secret scan `1002/0`, and diff check. The exact
staging project `myotkovmgzdabuirkqlx` was verified before deployment. The
approved function deploy left `session` v11 and `ai-gateway` v11 unchanged and
deployed `agent-executor` v13 ACTIVE. No production target, migration push,
reset, signer, or transaction was used.

Read-only linked schema inspection confirmed `public.cards` and `public.intents`
exist, but neither card `7` nor intent `intent-req-1` exists. The two-row
staging seed scope was explicitly approved, but was not applied because the
authoritative card-7 agent/controller/policy/allowlist/provenance/expiry and
chain-limit values were unavailable; no synthetic business state is permitted.

Post-deploy exact-route baseline, with the approved authenticated fixtures:

- H1 `POST https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/ai-gateway/v1/agent/intents`: HTTP `400` `CARD_NOT_ELIGIBLE`.
- H2 `POST https://myotkovmgzdabuirkqlx.supabase.co/functions/v1/agent-executor/v1/payments/preflight`: HTTP `200`, `decision:"declined"`, `reasonCode:"PREFLIGHT_DECLINED"`, `chainId:102031`.

No provider/RPC success, transaction, gas, broadcast, signer operation, or
secret value was recorded. H1/H2 remain **BLOCKED / BLOCKED** pending
authoritative card-7 chain metadata and the approved minimal seed. The
`db diff --linked` CLI probe used a local shadow database internally; staging
was not migrated or changed.
