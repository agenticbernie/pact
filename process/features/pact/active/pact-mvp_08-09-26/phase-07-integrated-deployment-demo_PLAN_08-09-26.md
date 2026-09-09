---
name: plan:pact-mvp-phase-07-integrated-deployment-demo
description: "Pact — Phase 07: integrated deployment, live rehearsal, and demo handoff"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-07
---

# Phase 07 — Integrated Deployment, Live Rehearsal & Demo

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–5 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 07 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Prove Pact end to end on a disposable Advance Testnet deployment: ASC-verified credit, autonomous allowed payment, truthful receipt, blocked policy path, and suspended-card guardrail.

**Architecture:** Local CI/E2E runs against Anvil, local Supabase, and a fake provider. The live lane uses chain-guarded manifests, disposable wallets, real gpt-5.6-luna access, real source-to-ASC proof, real controller/pool/merchant settlement, and redacted evidence.

**Tech Stack:** Foundry scripts, ethers v6, Supabase CLI, Wrangler, React/Vite, Playwright, GitHub Actions.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- No mainnet or production deploy, database, secret, or funds.
- Live deployment, real OpenAI calls, proof submission, pool funding, and payment settlement require this phase Validate Contract and explicit lane approval.
- Reject any chain ID not matching the verified Advance Testnet manifest; reject missing ASC verifier/decoder code.
- Local CI is cost-free and uses local chain/database/fake provider; it never calls a live provider.
- Evidence is redacted and includes scenario IDs, chain IDs, addresses, block/tx hashes, status, and timestamps only.
- UI SETTLED requires receiptConfirmed plus indexedPaymentEvent.
- Unavailable live infrastructure creates an honest blocker; it never becomes a fake green result or an invented transaction.
- Keep live keys in secret stores, rotate disposable keys after rehearsal, and leave no production mutation.

---

## Overview

This phase joins all prior work and produces the deployable/demo-ready package: deployment manifest, preflight checks, CI, local browser E2E, live scripts, evidence index, and operator runbooks. It is the only phase that may perform the outward-facing testnet demo lane.

## Entry Gate

- Phases 01–06 are ✅ VERIFIED or every concern has a safe blocker path.
- Read process/context/all-context.md and process/context/tests/browser-tests.md.
- Chain ID/RPC/explorer/native symbol/ASC verifier/decoder/source chain key/proof builder/model access are verified.
- Disposable deployer, gas-only agent, source operator, and ASC relayer wallets are available only through secrets.
- No unrelated worktree changes exist.

## Phase Loop Progress

- [ ] 1. RESEARCH — inspect prior reports, manifests, runbooks, local E2E, and live network/provider state
- [ ] 2. INNOVATE — choose local-first CI plus a narrowly gated live rehearsal; record rejected live-only alternatives
- [ ] 3. PLAN-SUPPLEMENT — add concrete deployment/evidence touchpoints discovered during research
- [ ] 4. PVL — vc-validate-agent writes V1–V7 contract and live-operation hard stops
- [ ] 5. EXECUTE — complete Tasks 1–5; local gates precede live actions
- [ ] 6. EVL — rerun CI/E2E, cleanup, and approved live evidence verification
- [ ] 7. UPDATE PROCESS — write final report, update umbrella/registry, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Deployment manifest and chain/model preflight

**Files:** Create config/deployments/advance-testnet.json, config/deployments/advance-testnet.template.json, scripts/deploy-testnet.mjs, scripts/verify-deployment.mjs, scripts/verify-model-access.mjs, scripts/preflight-live-lane.mjs, scripts/collect-evidence.mjs, packages/domain/test/deployment-manifest.test.ts.

**Manifest contract:**

~~~json
{
  "protocol": "creditcoin-evm",
  "label": "advance-testnet",
  "networkConfig": "config/networks/advance-testnet.json",
  "chainId": 0,
  "rpcUrl": "",
  "explorerUrl": "",
  "nativeAsset": {
    "id": "native-testnet-ctc",
    "evmAddress": "",
    "symbol": "",
    "decimals": 0
  },
  "contracts": {
    "pactCreditSource": "",
    "pactCreditAsc": "",
    "pactCardController": "",
    "pactCreditPool": "",
    "merchantSimulator": ""
  },
  "asc": {
    "sourceChainKey": 0,
    "verifierPrecompile": "",
    "evmV1DecoderLibrary": ""
  },
  "verified": false
}
~~~

The zero/empty template values are invalid and are replaced only in an approved
deployment artifact. The manifest is an output of deployment, not a second source
of truth: `verify-deployment.mjs` must load the canonical Phase 01 network config,
compare protocol/label/chain/RPC/explorer/native-asset/ASC identity, and fail on
drift before any live action.

- [ ] 1.1. Write manifest tests for wrong protocol/label, mainnet ID, empty address, unverified flag, chain mismatch, native asset descriptor drift, ASC identity drift, and complete local fixture.
- [ ] 1.2. Implement deploy-testnet with dry-run default, explicit broadcast flag, mainnet deny-list, target-chain assertion, deployment order, receipt waits, and manifest write after confirmation.
- [ ] 1.3. Implement verify-deployment to load and parity-check `config/networks/advance-testnet.json`, then check chain ID, bytecode, ownership/authority wiring, controller/pool/merchant/ASC readbacks, and explorer URLs.
- [ ] 1.4. Implement verify-model-access to fail on unavailable gpt-5.6-luna and never choose another model.
- [ ] 1.5. Implement preflight-live-lane to call the Phase 01 `scripts/preflight-testnet.mjs` read-only, require network advance-testnet, a verified parity-checked manifest, disposable wallet labels, server-side secret names, and no production URLs. It may add live-lane policy but must not duplicate or rename the shared network preflight.
- [ ] 1.6. Implement collect-evidence with redacted JSON/Markdown output and no environment values.
- [ ] 1.7. Run local tests and dry-run.

Run: yarn vitest run packages/domain/test/deployment-manifest.test.ts && node scripts/deploy-testnet.mjs --network local --dry-run  
Expected: PASS and no broadcast.
- [ ] 1.8. Commit manifest/preflight scripts and tests.

### Task 2 — Deterministic local stack, CI, and browser E2E

**Files:** Create .github/workflows/ci.yml, playwright.config.ts, scripts/start-local-stack.mjs, scripts/stop-local-stack.mjs, e2e/fixtures/local-runtime.ts, e2e/allowed-payment.spec.ts, e2e/blocked-payment.spec.ts, e2e/network-guard.spec.ts, e2e/receipt-truth.spec.ts, docs/runbook/ci.md.

- [ ] 2.1. Write Playwright specs for setup, allowed intent → preflight → execute → receipt, over-limit/unallowlisted decline, wrong chain, and pending/uncertain receipt.
- [ ] 2.2. Configure Anvil, local Supabase, fake AI provider, and real local controller/pool/merchant settlement.
- [ ] 2.3. Configure isolated ports/database state and failure evidence: screenshot, trace, console, network, and redacted server logs.
- [ ] 2.4. Add CI jobs in order: install, typecheck, lint, domain tests, Forge, local DB reset/tests, Deno/Worker tests, web build, Playwright, AICD/secret scans.
- [ ] 2.5. Add local guards that reject live RPC, OpenAI keys, production Supabase URLs, and mainnet IDs.
- [ ] 2.6. Run local stack and E2E.

Run: node scripts/start-local-stack.mjs && yarn test:e2e && node scripts/stop-local-stack.mjs  
Expected: all specs pass and cleanup removes only E2E-owned state.
- [ ] 2.7. Commit CI/E2E/runbook.

### Task 3 — Operator runbooks and safe funding

**Files:** Create docs/runbook/deployment.md, docs/runbook/demo.md, docs/runbook/live-evidence.md, scripts/fund-testnet-wallets.mjs, config/demo/prompts.json.

- [ ] 3.1. Document deployment order: source emitter → payment contracts → ASC wiring/source binding → artifact export → manifest verification → merchant registration → pool funding.
- [ ] 3.2. Implement funding with dry-run default, chain guard, recipient allowlist, amount cap, and no unknown-address transfer.
- [ ] 3.3. Document checks for model access, Supabase expected/actual region, Worker upstream, agent chain/gas-only balance, proof builder, and explorer.
- [ ] 3.4. Document cleanup: revoke sessions, rotate disposable keys, record balances, stop local stack, remove only E2E-owned temporary files.
- [ ] 3.5. Run dry-run preflight/funding and secret scan.

Run: node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run && node scripts/fund-testnet-wallets.mjs --network advance-testnet --dry-run && node scripts/check-no-secrets.mjs  
Expected: required checks print; no live call or transfer.
- [ ] 3.6. Commit runbooks/tools.

### Task 4 — Rehearse the real testnet path

**Files:** Create scripts/rehearse-live-demo.mjs, config/demo/live-evidence.json, e2e/live-testnet.spec.ts, docs/submission/pact-mvp-evidence-index.md.

**Live sequence:**

~~~text
preflight → deploy/verify → merchant registration → pool funding → source CreditGranted
→ ASC proof → controller verified credit → card create/activate → allowed intent
→ preflight → agent execute → receipt + indexed PaymentSettled
→ blocked prompt → Funds moved: 0 → suspend → blocked retry
~~~

- [ ] 4.1. Run the rehearsal dry-run and local CI/E2E before any live approval.
- [ ] 4.2. With explicit live-lane approval, run chain/model/region preflight.
- [ ] 4.3. Deploy/load the disposable manifest and verify code, owner/controller/ASC wiring, source emitter binding, merchant, and explorer URLs.
- [ ] 4.4. Emit one source credit event, build/submit proof, wait for CreditVerified/CardCreditUpdated, and read back beneficiary/amount/expiry.
- [ ] 4.5. Create/activate card, fund pool, send allowed prompt through the real edge/gateway/provider/executor path, wait for receipt and indexer, and verify merchant delta exactly amount.
- [ ] 4.6. Send an over-limit or unallowlisted prompt; assert preflight decline, no execute, zero merchant delta.
- [ ] 4.7. Suspend card from owner wallet; retry allowed prompt; assert controller rejection and zero merchant delta.
- [ ] 4.8. Collect evidence for every SC-* acceptance scenario; include source/proof/payment tx hashes and final statuses.
- [ ] 4.9. If a dependency fails, stop live calls, write exact blocker/next safe action, and never call a recorded receipt a new success.
- [ ] 4.10. Commit only redacted evidence metadata and runbook changes.

Run: node scripts/rehearse-live-demo.mjs --network advance-testnet --dry-run  
Expected: dry-run exits 0 with no mutation. Approved live invocation produces evidence or an honest blocker.

### Task 5 — Final readiness and submission handoff

**Files:** Create scripts/final-readiness.mjs, scripts/rehearse-demo.mjs, docs/runbook/final-readiness.md, docs/submission/pact-mvp-evidence-index.md.

- [ ] 5.1. Implement final-readiness to run root gates, compare AICD IDs to deployed components, run secret scan, and require success/rejection evidence.
- [ ] 5.2. Implement rehearse-demo with fixed 60–90 second sequence, bounded polling, receipt/indexer waits, and recorded-evidence fallback wording.
- [ ] 5.3. Map AC-01 through AC-17 to automated output, hybrid manifests/tx links, or agent-probe notes.
- [ ] 5.4. Run final readiness locally.

Run: yarn test && yarn test:contracts && yarn typecheck && yarn lint && yarn validate:aicd && yarn test:e2e && node scripts/final-readiness.mjs  
Expected: local gates pass; live criteria are marked PASS or BLOCKED with evidence.
- [ ] 5.5. Commit final handoff and write Phase 07 report.

## Acceptance Criteria

- AC-01–AC-03: network/card/suspend guardrails.
- AC-04–AC-05: real source/ASC proof and binding/replay rejection.
- AC-06–AC-08: provider intent, fail-closed errors, attribution.
- AC-09–AC-13: allowed atomic settlement, policy, expiry, replay, failure preservation.
- AC-14–AC-15: receipt truth and idempotent read model.
- AC-16: responsive judge path.
- AC-17: AICD-to-deployment/evidence traceability.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong live chain/manifest | Critical | chain ID, bytecode, ownership, and mainnet deny-list checks |
| Partial deployment | High | record each receipt/address; resume only from verified manifest |
| Provider/proof latency | High | local path first, bounded waits, honest blocker/recorded-evidence path |
| Wrong funding recipient | Critical | allowlisted disposable addresses, caps, dry-run default |
| Receipt/indexer lag | High | pending/uncertain state until two-signal truth |
| Flaky browser demo | High | fixed prompts, local rehearsal, trace/screenshots, bounded polling |
| Secret or production state leak | Critical | CI guard, secret scan, no production URL/default |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| wrong live chain | abort before broadcast | automated/hybrid |
| missing bytecode | readiness fails | hybrid |
| model unavailable | no intent/payment | automated/hybrid |
| proof outage | no direct credit; blocker | hybrid |
| receipt timeout | reconcile; no duplicate | automated/hybrid |
| blocked prompt | no execute; Funds moved: 0 | automated/hybrid |
| suspended retry | controller rejection; zero delta | hybrid |
| indexer lag | pending/uncertain | automated |
| mobile demo | safety state visible without overflow | agent-probe |
| cleanup | disposable state removed, production untouched | hybrid |

## Security Review

Review STRIDE/OWASP for live wallet spoofing, manifest tampering, evidence/receipt integrity, CI/log secret disclosure, RPC/provider abuse, and privilege escalation. Deployment deny-lists mainnet; funding uses an address allowlist and cap; deployer, agent, source, and ASC keys are separate and disposable; browser remains secret-free.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| local automated | yarn test; yarn test:contracts; yarn typecheck; yarn lint; yarn validate:aicd | automated | CI logs |
| local browser | yarn test:e2e | automated | Playwright report |
| local integration | Anvil + Supabase + indexer/read API | hybrid | manifest/readback |
| live preflight | node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run | automated | dry-run log |
| live evidence/payment | approved node scripts/rehearse-live-demo.mjs --network advance-testnet | hybrid | redacted evidence |
| responsive run | 320px + desktop demo | agent-probe | screenshots/notes |
| secret safety | node scripts/check-no-secrets.mjs | automated | clean report |

## Touchpoints

- config/deployments, config/demo, scripts/deploy-testnet.mjs, verify-deployment.mjs, preflight-live-lane.mjs, rehearse-live-demo.mjs, final-readiness.mjs
- .github/workflows/ci.yml, playwright.config.ts, e2e
- docs/runbook and docs/submission
- packages/domain/test/deployment-manifest.test.ts

## Public Contracts

- Deployment manifest, evidence index, and SC-* mapping are operator/submission contracts.
- Local CI uses fake provider only in local configuration; live uses OpenAI gpt-5.6-luna with no fallback.
- Live demo follows edge → regional gateway → provider → executor → controller → pool → merchant → indexer/read API.
- Recorded evidence must be labeled recorded; it cannot be used to fabricate a new live settlement.

## Blast Radius

Adds CI, local E2E, deployment/preflight scripts, live testnet metadata, evidence, and runbooks. Only the approved live lane changes testnet state; production remains untouched.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| local CI/Forge/E2E | Automated | all automatable ACs |
| chain/model/preflight | Automated/Hybrid | network/AI constraints |
| live ASC evidence | Hybrid | AC-04, AC-05 |
| live allowed payment | Hybrid | AC-09 |
| live blocked/suspend | Hybrid | AC-03, AC-10, AC-11 |
| responsive demo | Agent-Probe | AC-16 |
| AICD-to-manifest index | Automated | AC-17 |

## Test Procedure

Read process/context/all-context.md and process/context/tests/browser-tests.md. Run:
yarn typecheck
yarn lint
yarn test
yarn test:contracts
yarn validate:aicd
node scripts/check-no-secrets.mjs
node scripts/start-local-stack.mjs
yarn test:e2e
node scripts/stop-local-stack.mjs
node scripts/final-readiness.mjs
git diff --check

Only with explicit live-lane approval run:
node scripts/preflight-live-lane.mjs --network advance-testnet
node scripts/verify-model-access.mjs --network advance-testnet
node scripts/rehearse-live-demo.mjs --network advance-testnet

## Data Verification

- Every deployed address has code, expected wiring, chain ID, confirmation block, and explorer link.
- Evidence contains source/proof/payment tx hashes, block numbers, event IDs, status, and scenario IDs.
- Allowed merchant delta equals amount; blocked/suspended delta is zero.
- Read model matches chain events and receipt truth.
- CI/evidence contains no secret, production URL, or unredacted provider response.

## Manual Test

Follow docs/runbook/demo.md at 320px and desktop: show testnet card/evidence, allowed prompt, policy timeline, explorer receipt, blocked prompt, suspend, and blocked retry. Confirm every settlement claim has matching receipt/event evidence.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All five tasks are checked; local CI/E2E and automated gates pass; live allowed and blocked/suspended evidence exists or is honestly blocked; final readiness maps AC-01 through AC-17; cleanup/secret scan passes; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase owns live-lane scripts and browser E2E but keeps a cost-free local path for regression. Live evidence cannot mask a failing local gate and cannot be copied as a fake fresh transaction.

## Exit Gate

~~~bash
yarn typecheck
yarn lint
yarn test
yarn test:contracts
yarn validate:aicd
node scripts/check-no-secrets.mjs
node scripts/start-local-stack.mjs
yarn test:e2e
node scripts/stop-local-stack.mjs
node scripts/final-readiness.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- Local CI/E2E is not deterministic or cleanup is unverified.
- Manifest cannot prove target chain/contract wiring.
- gpt-5.6-luna, regional Supabase, or proof builder is unavailable.
- ASC proof cannot bind to the registered source.
- Live payment cannot show receipt plus indexed PaymentSettled.
- Blocked/suspended path cannot prove zero transfer.
- Live action would mutate production or require unapproved cost-bearing execution.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; local gates precede live actions.
- On ✅ VERIFIED, update umbrella to ✅ COMPLETE and archive only after user confirmation.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
