---
name: plan:pact-mvp-umbrella
description: "Pact — umbrella implementation plan for the 7-phase MVP program"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: umbrella
---

# Pact MVP — Umbrella Implementation Plan

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX / PHASE PROGRAM

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ship Pact as a real, testnet-deployed virtual spending card for one AI Agent, with on-chain policy enforcement, Attestcoin-verified credit evidence, OpenAI intent generation, autonomous payment execution, truthful receipts, and a judge-ready demo.

**Architecture:** Creditcoin EVM-compatible Advance Testnet is the settlement and policy authority. Attestcoin ASC verifies a real source-chain credit event before the controller applies verified credit. Cloudflare Worker routes to a regional Supabase Edge Function, which calls OpenAI; a separate executor signs only the controller payment method with a gas-only agent key.

**Tech Stack:** Solidity 0.8.28-compatible Foundry contracts, OpenZeppelin, @gluwa/asc-contracts, @gluwa/usc-sdk, TypeScript/Node 20, Yarn workspaces, ethers v6, React/Vite, Supabase Edge Functions/Postgres, Cloudflare Workers, Vitest, Foundry tests, Playwright.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- The MVP is a working testnet product, not a UI-only prototype; authoritative payment, policy, credit, and settlement data comes from chain state.
- Mock/seed data is allowed only for catalog labels, merchant descriptions, prompt scenarios, and other non-authoritative UI metadata.
- Settlement and policy authority is Creditcoin EVM-compatible testnet, project label advance-testnet; Attestcoin ASC is the evidence layer on that chain.
- The MVP uses one configured native testnet CTC asset; RPC, chain ID, symbol, explorer, ASC verifier, and decoder values are deployment configuration and must be verified before deployment.
- OpenAI is the only provider; OPENAI_MODEL defaults to gpt-5.6-luna; no silent provider/model fallback is permitted.
- Browser and Cloudflare Worker code must never receive OPENAI_API_KEY, agent private keys, ASC relayer keys, or pool credentials.
- The card controller is the financial authority; AI output, preflight, database rows, indexer state, and UI state cannot authorize or settle payment.
- Merchant recipients are resolved from a registered on-chain merchant ID; the model and browser never provide a raw payout address.
- Real testnet actions use disposable wallets and testnet funds only. No mainnet, fiat, PAN/CVV, production custody, or real credit underwriting is part of this program.
- Each phase follows R → I → P → PVL → E → EVL → UP, records evidence, keeps status honest, and commits process artifacts separately from execution changes.
- In this greenfield repository, a user-approved Vibecode harness/context bootstrap
  is a prerequisite to PVL. `vc-test-coverage-plan` must load the complete test
  routing chain and discover real in-blast-radius tests; it may not infer tiers from
  planned filenames. If those inputs do not exist, the phase remains BLOCKED and
  returns to PLAN/RESEARCH.

---

## Overview

This is the seven-phase implementation program for the approved Pact MVP. The umbrella coordinates the direct plans; each direct plan contains exact files, typed interfaces, TDD steps, test tiers, risk scenarios, and execution handoff. This planning turn creates no implementation code.

## Program Goal Charter

### North star

Make Pact a credible, inspectable control layer that lets an AI Agent spend within human-defined limits, with every important decision backed by verifiable testnet state.

### Definition of done

An unattended implementation run can:

1. Deploy the card controller, native settlement pool, merchant simulator, source credit emitter, and ASC verifier integration to the configured Advance Testnet.
2. Create one active virtual card, assign one agent wallet, configure caps/allowlist/asset/expiry, and fund the pool with a native testnet asset.
3. Emit a real source-chain credit event, generate and submit its Attestcoin proof, and show the resulting verified credit with source and target transaction evidence.
4. Send a natural-language request through Cloudflare → regional Supabase → OpenAI, persist provider/model attribution, and produce a schema-valid intent or a fail-closed error.
5. Execute one allowed payment autonomously with the restricted agent signer, confirm the receipt and PaymentSettled event, and show the merchant receipt/explorer link.
6. Demonstrate blocked over-limit, unallowlisted, expired, wrong-chain, suspended-card, malformed-provider, and replay paths with zero unintended transfer.
7. Run automated, hybrid, and agent-probe gates from a clean checkout, with AICD traceability and durable phase reports.

### What “verified” means at program level

A phase reaches ✅ VERIFIED only when its validate-contract exists, its automated gates pass, its in-blast-radius hybrid gates have evidence, its agent-probe gates are recorded, its regression checkpoint passes, and its phase report is committed. The whole program is verified only when the final live testnet happy path and guardrail failure are reproducible from the runbook.

### Scope tiers → phase mapping

- Tier 1 — authority and safety foundations → Phases 01, 02, 03, 04.
- Tier 2 — truthful observability and usability → Phases 05, 06.
- Tier 3 — live integration and demo reliability → Phase 07.
- This program retires Tiers 1–3 for the Pact MVP.

### Explicitly out of scope

Deferred Tier 4 includes Visa/Mastercard or fiat rails, real PAN/CVV, KYC/AML, underwriting, repayment/collections, production custody, mainnet, multiple providers or models, automatic fallback, multi-chain settlement, bridges, multiple assets, arbitrary merchants, multi-card management, team roles, billing, notifications, marketplace features, native mobile apps, and production deployment automation.

### Hard safety constraints

- Never use mainnet keys, production secrets, real customer funds, or real payment-card data.
- Never allow browser, Cloudflare, AI gateway, indexer, or database state to bypass the on-chain controller.
- Never deploy with unverified chain ID/RPC/explorer/ASC addresses or an unavailable configured OpenAI model.
- Never silently fall back to another provider/model or mark a payment settled without a confirmed receipt plus matching indexed event.
- Never mutate production databases or deploy outward-facing infrastructure during autonomous execution; live testnet deployment and cost-bearing provider calls require the phase validate-contract and explicit lane approval.
- Keep process/plan/context commits separate from execution commits and leave unrelated worktree changes untouched.

---

## Stable Program Goal

~~~text
TARGET: Build Pact MVP end-to-end in the configured Creditcoin EVM Advance Testnet environment: real on-chain card policy, ASC-verified credit evidence, OpenAI intent generation, autonomous native-testnet payment, truthful indexed receipt, and a reproducible blocked-payment demo.

PER-PHASE LOOP: For every phase run 1 RESEARCH → 2 INNOVATE → 3 PLAN-SUPPLEMENT → 4 PVL → 5 EXECUTE → 6 EVL → 7 UPDATE-PROCESS. The loop skips SPEC because the approved design is the program spec. PVL is never skipped; a placeholder Validate Contract blocks execution. Every subagent first runs vc-context-discovery and vc-plan-discovery. Every phase end invokes vc-agent-strategy-compare. Test tiers are automated / hybrid / agent-probe.

HARD STOPS: unverified network or ASC deployment values; unavailable gpt-5.6-luna; mainnet/production mutation; secret exposure; irreversible or cost-bearing action absent from the phase contract; a BLOCKED gate without a safe backlog path.

SAFETY: use disposable testnet wallets and funds only; agent signer has gas only; controller is the sole policy authority; merchant IDs resolve on-chain; never report SETTLED from client or database state alone.

TEST GATES: run from the vibecode-pro-max-kit root:
node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs
node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs
node .claude/skills/vc-audit-context/scripts/validate-context-discovery.mjs
node .claude/skills/vc-audit-plans/scripts/validate-plan-inventory.mjs
Also run Pact gates from its root: yarn typecheck; yarn lint; yarn test; yarn test:contracts; yarn validate:aicd; yarn test:e2e.

VALIDATE CONTRACT: Each direct phase plan owns its current V1–V7 validate-contract. Do not spawn execute-agent while that section is the placeholder. Record exact gates, high-risk pack, known gaps, and accepted-by evidence.

START: Phase 01 — Foundation, Domain Contracts & AICD; loop step PLAN-SUPPLEMENT / Pre-PVL harness bootstrap (blocked until context/test prerequisites are present).
~~~

---

## Current Execution State

Last updated: 2026-09-10
Current phase: 3 of 7
Phase 3 name: ASC Credit Evidence
Phase 3 status: ✅ VERIFIED (EVL PASS read-only 2026-09-10, user-confirmed; commit pending review)
Phase 3 EVL: green (single Sepolia→Advance proof: source 11155111 / target 102031 / chainKey 1; record + execute receipts status 1; CreditGranted/CreditEvidenceApplied/CreditVerified single events; availableCredit 1e18; processedEvidence true; manifest schema-valid; secret scan clean)
Phase 3 report: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_REPORT_08-09-26.md
Next phase: 4 — AI gateway/executor (entry: Phase 03 VERIFIED; proof-worker backlog none; ASC authority path proven)

Phase 1 status: 🔨 CODE DONE (VERIFIED confirmation outstanding).
Phase 2 Validate Contract: CONDITIONAL accepted with C-P2a–C-P2d (2026-09-09);
all concerns closed by evidence except the --ffi=false form note.
Next Step: Phase 03 RESEARCH (no live deployment; ASC verifier/decoder values stay deferred).

---

## Pre-PVL Conflict Resolution

No blast-radius conflicts for Phase 01 scope. `phase-blast-radius-registry.md`
is the conflict-resolution record: Phase 01 owns foundation, domain contracts,
AICD, test context, shared preflight, and the high-risk evidence schema
exclusively, and no other phase claims those paths. (Resolves Validate
Contract concern C2, 2026-09-09.)

## Phase Ordering

| Phase | Plan file | Scope summary | Depends on |
|---|---|---|---|
| 01 — Foundation | process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md | Monorepo, shared contracts, config preflight, AICD validator, test-context routing | approved design |
| 02 — Payment contracts | process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md | Card lifecycle, policy, native pool, merchant simulator, artifacts | Phase 01 |
| 03 — ASC credit evidence | process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md | Source credit event, ASC binding/replay checks, proof worker | Phase 02 |
| 04 — AI gateway/executor | process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md | Wallet session, regional OpenAI gateway, intent schema, agent signer, preflight/execute API | Phases 01–03 |
| 05 — Indexer/read model | process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md | Supabase schema, event cursor, idempotent read API, observability | Phase 04 |
| 06 — Web UI/UX | process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md | Mobile-first command center, virtual card, agent console, receipt states | Phase 05 |
| 07 — Integrated deployment/demo | process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md | CI, deployment manifests, live rehearsal, Playwright path, demo runbook | Phase 06 |

### Join conditions

- Phase 02 starts only after Phase 01 exit gates and process commit are green.
- Phase 03 starts only after Phase 02 local contract gates pass; its live proof lane remains gated by its own validate-contract.
- Phase 04 starts only after Phase 03 has either ✅ VERIFIED or a documented proof-worker backlog path that does not weaken payment authority.
- Phase 05 starts only after Phase 04 API contracts and event schemas are stable.
- Phase 06 starts only after Phase 05 read endpoints return chain-confirmed state.
- Phase 07 starts only after Phases 01–06 have committed execution changes and their regression evidence is available.

---

## Per-Phase Entry / Exit Gates

| Phase | Entry gate | Exit gate |
|---|---|---|
| 01 | Approved design, clean Pact baseline, no conflicting Pact execution changes | yarn typecheck, yarn lint, yarn test, yarn validate:aicd, context files present, network preflight fails closed when required values are absent |
| 02 | Phase 01 ✅ VERIFIED | forge test --root contracts, policy matrix/invariants green, deployment script dry-run validated, ABI/address export generated |
| 03 | Phase 02 ✅ VERIFIED and ASC package version pinned | local ASC harness green, proof worker retry/dedupe tests green, one live evidence rehearsal recorded or blocker artifact created |
| 04 | Phases 01–03 ✅ VERIFIED or approved constrained proof backlog | schema/provider/auth/executor tests green, no-chain-call provider failures proven, local edge-to-function smoke green |
| 05 | Phase 04 API/event contracts committed | migration reset green, indexer idempotency/cursor tests green, reads expose latest indexed block and never authorize |
| 06 | Phase 05 read APIs reachable | UI unit/accessibility tests green, build green, mobile/desktop agent probe records all key states |
| 07 | Phases 01–06 ✅ VERIFIED | CI green, deployment manifest verified, live allowed + blocked + suspended paths evidenced, final runbook and reports committed |

---

## Phased Delivery Plan

Execute the seven direct phase plans in Phase Ordering order. Each phase is independently testable and must pass its entry gate, non-placeholder validate-contract, regression checkpoint, report, and commit handoff before the next phase begins.

## Per-Phase Loop

Every direct phase plan contains the canonical 7-step inner loop R → I → P → PVL → E → EVL → UP. The implementation plan is written for Superpowers task execution, so each checklist task also follows write-test → observe failure → implement minimum → run gate → commit.

1. RESEARCH reads process/context/all-context.md, process/context/tests/all-tests.md, protocol files, latest reports, and current code drift. For a greenfield phase, complete the harness/context bootstrap before PVL and record the actual test inventory.
2. INNOVATE records the chosen approach and rejected alternatives for the phase’s highest-risk boundary.
3. PLAN-SUPPLEMENT adds missing preconditions, file touchpoints, or test scenarios, or records “n/a — research clean”.
4. PVL runs the V1–V7 validator contract and writes the direct plan’s Validate Contract section.
5. EXECUTE runs only the approved checklist and runs each section’s gates immediately.
6. EVL independently reruns exact gates, hybrid evidence, agent probes, and overlapping regression checks.
7. UPDATE-PROCESS writes the phase report, updates this state, updates context/downstream plans, and commits process artifacts before move-on.

PVL is never skipped. If a plan changes after PVL, add an Inner Loop Refresh Note and obtain a new validate-contract before execution.

---

## Autonomous Execution Rules

- Under a persistent session goal, phase execution may proceed without a per-phase approval pause, but live testnet deployment, real OpenAI cost-bearing calls, production mutations, secret publication, and other outward-facing actions stay deferred unless the current phase contract and explicit lane approval permit them.
- Under ordinary supervised execution, the user reviews the phase validate-contract before substantial implementation.
- A failing automated gate inside the current blast radius is fixed inline and rerun. A fix that widens scope becomes a follow-up plan or backlog artifact.
- A hybrid failure caused by unavailable external infrastructure is recorded with exact evidence; it is not converted into a fake green test.
- Every phase gets a logical execution commit and a separate process/plan/context commit.

---

## Durable Report Destinations

| Phase | Report path |
|---|---|
| 01 | process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_REPORT_08-09-26.md |
| 02 | process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_REPORT_08-09-26.md |
| 03 | process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_REPORT_08-09-26.md |
| 04 | process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md |
| 05 | process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_REPORT_08-09-26.md |
| 06 | process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_REPORT_08-09-26.md |
| 07 | process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_REPORT_08-09-26.md |

Reports stay flat inside the program task folder. The folder moves as one unit when the program completes.

---

## Program Status Table

| Phase | Status |
|---|---|
| 01 — Foundation | 🔨 CODE DONE |
| 02 — Payment contracts | ✅ VERIFIED |
| 03 — ASC credit evidence | ✅ VERIFIED |
| 04 — AI gateway/executor | ⏳ PLANNED |
| 05 — Indexer/read model | ⏳ PLANNED |
| 06 — Web UI/UX | ⏳ PLANNED |
| 07 — Integrated deployment/demo | ⏳ PLANNED |

Status values: ⏳ PLANNED | 🔨 CODE DONE | 🧪 TESTING | ✅ VERIFIED | 🚧 BLOCKED | ✅ COMPLETE

---

## Touchpoints

- process/features/pact/active/pact-mvp_08-09-26/umbrella and all seven direct phase plans
- docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md
- Pact implementation roots planned under contracts, packages, supabase, services, apps, architecture, config, scripts, e2e, and docs/runbook

## Public Contracts

- The approved design document remains the product and architecture contract.
- The public API behavior stays limited to config, card/activity/payment reads, intent creation, preflight, and execute routes defined by the spec.
- The implementation must not expose raw model output, private keys, arbitrary merchant addresses, or database-authoritative balances.

## Blast Radius

Files created by this planning turn:

- process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md
- process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md
- docs/superpowers/plans/2026-09-08-pact-mvp-implementation-plan.md

No implementation source files are changed by the planning phase.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Umbrella validator exits 0 | Fully-Automated | AICD/plan artifact is structurally executable |
| Seven direct plan validators exit 0 | Fully-Automated | Each phase has loop, checklist, and contract handoff |
| git diff --check exits 0 | Fully-Automated | Plan files contain no whitespace/conflict corruption |
| User-approved design is referenced by every phase | Agent-Probe | All execution work traces back to approved Pact behavior |

## Test Infra Improvement Notes

The Pact repository begins without an application test harness or process context router. Phase 01 explicitly creates the minimum context files and the root commands consumed by later phases. Until Phase 01 executes, commands such as yarn test and yarn validate:aicd are planned gates, not claims about an existing implementation.

---

## Phase Completion Rules

User Confirmation: required before marking a phase ✅ VERIFIED or the program ✅ COMPLETE.

A phase may be marked ✅ VERIFIED only after:

- its checklist is complete and its Validate Contract is a non-placeholder contract written by vc-validate-agent;
- automated tests pass from a clean checkout;
- required hybrid testnet/provider/database evidence is recorded, or a bounded blocker is routed without weakening safety;
- agent-probe/manual review records the required judgment;
- overlapping prior-phase regression checks pass;
- the phase report, plan update, and execution/process commits exist.

---

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
- Last completed step: Phase 03 Task 5B live single-proof + EVL PASS + closeout artifacts (uncommitted, pending review)
- Validate-contract status: Phase 03 CONDITIONAL accepted; Phase 04 PVL pending
- Next Step: review Phase 03 closeout, commit process/execution separately, then Phase 04 RESEARCH (no live deployment without its own contract).

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
