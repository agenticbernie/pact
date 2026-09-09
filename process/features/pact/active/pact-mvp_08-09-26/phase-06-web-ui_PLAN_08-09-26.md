---
name: plan:pact-mvp-phase-06-web-ui
description: "Pact — Phase 06: mobile-first Pact web app, virtual card, agent console, and receipt UX"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-06
---

# Phase 06 — Web UI/UX

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–5 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 06 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver the judge-readable Pact web experience: connect/setup, testnet virtual card, verified-credit provenance, natural-language agent console, policy decision timeline, and truthful payment receipt.

**Architecture:** The browser reads through the public edge/read API and calls owner-only contract methods through the connected wallet. It never receives provider/signer secrets and never treats client state as settlement truth. The UI is a mobile-first control room with explicit testnet disclosure and separate intent, preflight, pending, failed, and settled states.

**Tech Stack:** React, Vite, TypeScript, React Router, ethers v6, CSS modules or scoped CSS, Be Vietnam Pro, IBM Plex Mono, Vitest, Testing Library, axe-style accessibility assertions.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- UI is a real client of the API/chain, not a simulated payment screen; test fixtures may fake responses only in automated tests.
- Show testnet-only and no-fiat-value disclosure before setup and payment.
- Never show Settled until the read API reports receiptConfirmed and indexedPaymentEvent.
- The browser may ask the owner wallet to create/update/suspend a card, but it never signs agent payments.
- Agent output is displayed as a proposal with provider/model attribution, confidence, and policy checks; it is not presented as authorization.
- Merchant display labels come from catalog/read API; no raw model-provided address is rendered as a destination.
- Mobile viewport starts at 320px; touch targets are at least 44px; normal text meets WCAG AA; reduced motion disables nonessential animation.
- Use Be Vietnam Pro for UI text and IBM Plex Mono for amounts, hashes, nonces, and addresses.
- Do not add native mobile apps, team roles, advanced analytics, notifications, or payment-card network styling.

---

## Overview

This phase turns the verified backend state into a coherent product surface. The primary demo path is: connect wallet → see testnet disclosure → create/activate card → inspect verified credit → enter an allowed prompt → review intent/policy → watch pending → open truthful receipt → try a blocked prompt → suspend and retry. The UI must remain understandable when every external system fails.

## Entry Gate

- Phase 05 read APIs return card, activity, evidence, payment, config, and receipt-truth fields.
- Phase 04 session/intent/execute endpoints are stable.
- Read process/context/all-context.md and process/context/tests/browser-tests.md.
- packages/pact-sdk has ABI/address exports and config/network values.
- No browser bundle contains any server secret; the edge URL is the only public runtime secret-like config.

## Phase Loop Progress

- [ ] 1. RESEARCH — inspect read/API contracts, wallet provider behavior, Phase 05 receipt states, and design constraints
- [ ] 2. INNOVATE — choose a control-room layout with one primary action and explicit states; record rejected crypto-wallet dashboard and fake-card alternatives
- [ ] 3. PLAN-SUPPLEMENT — update component/state touchpoints if API shape or accessibility constraints differ
- [ ] 4. PVL — vc-validate-agent writes V1–V7 contract with UI tests, build, responsive probe, and secret scan
- [ ] 5. EXECUTE — complete Tasks 1–5 and run each section gate immediately
- [ ] 6. EVL — rerun tests/build, inspect mobile/desktop states, keyboard flow, and receipt truth
- [ ] 7. UPDATE PROCESS — write report, update umbrella/downstream E2E plan, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Bootstrap web app, routes, and visual tokens

**Files:** Create apps/web/package.json, apps/web/index.html, apps/web/vite.config.ts, apps/web/src/main.tsx, App.tsx, router.tsx, styles/tokens.css, styles/global.css, test/setup.ts, test/app-shell.test.tsx.

**Routes:**

~~~text
/setup
/dashboard
/cards/:cardId
/agent
/payments/:paymentId
~~~

- [ ] 1.1. Write app-shell tests for route rendering, testnet banner visibility, loading/error boundary, and 320px layout not causing horizontal overflow.
- [ ] 1.2. Run yarn vitest run apps/web/test/app-shell.test.tsx; expect missing-app failure.
- [ ] 1.3. Add Vite/React workspace and route shell with semantic main/nav/section elements.
- [ ] 1.4. Add tokens: warm off-white background, charcoal text, burnt-orange accent, success/warning/error colors, spacing scale, radius, shadow, focus ring, and monospace hash style. Avoid neon/glowing gradients.
- [ ] 1.5. Add testnet disclosure component with exact meaning: funds have no fiat value and all actions use a disposable testnet.
- [ ] 1.6. Run focused tests and typecheck.

Run: yarn vitest run apps/web/test/app-shell.test.tsx && yarn typecheck  
Expected: PASS.
- [ ] 1.7. Commit web shell/tokens.

### Task 2 — Implement wallet/network/setup flow

**Files:** Create apps/web/src/wallet/provider.ts, wallet/session.ts, features/setup/SetupPage.tsx, features/setup/setup-state.ts, features/setup/setup-api.ts, features/setup/SetupPage.test.tsx, components/NetworkStatus.tsx, components/TestnetDisclosure.tsx.

**Interfaces:**

~~~typescript
type WalletState =
  | { status: "disconnected" }
  | { status: "wrong_network"; expectedChainId: number; actualChainId: number }
  | { status: "connected"; address: string; chainId: number };

type SetupPolicy = {
  agentAddress: string;
  ownerConfiguredCap: string;
  perTransactionLimit: string;
  expiresAt: string;
  allowlistedMerchantIds: string[];
};
~~~

- [ ] 2.1. Write tests for disconnected wallet, wrong chain, connected wallet, rejected wallet request, owner create transaction pending/success/revert, empty agent/cap/expiry, and duplicate merchant IDs.
- [ ] 2.2. Implement provider adapter around window.ethereum and ethers BrowserProvider; listen for accountsChanged and chainChanged; clear sensitive UI state on account change.
- [ ] 2.3. Implement setup state machine: connect → network check → policy form → owner createCard → activateCard → dashboard. Disable actions on wrong chain.
- [ ] 2.4. Validate policy client-side for UX, then call the controller with owner wallet; after receipt, refetch card from chain/read API instead of assuming success.
- [ ] 2.5. Show assigned agent, cap, per-transaction limit, expiry, allowlist, asset native-testnet-ctc, and card ID. Do not show a raw editable payout address.
- [ ] 2.6. Run tests/build.

Run: yarn vitest run apps/web/src/features/setup/SetupPage.test.tsx && yarn build:web  
Expected: PASS and production bundle builds.
- [ ] 2.7. Commit wallet/setup.

### Task 3 — Build command center, virtual card, and evidence provenance

**Files:** Create apps/web/src/features/dashboard/DashboardPage.tsx, CardVisual.tsx, PolicySummary.tsx, EvidencePanel.tsx, ActivityList.tsx, features/dashboard/dashboard-api.ts, dashboard-state.ts, DashboardPage.test.tsx.

**Interfaces:**

~~~typescript
type CardViewModel = {
  cardId: string;
  status: "issued" | "active" | "suspended" | "closed" | "expired";
  agentAddress: string;
  availableCreditBaseUnits: string;
  effectiveLimitBaseUnits: string;
  spentBaseUnits: string;
  perTransactionLimitBaseUnits: string;
  asset: "native-testnet-ctc";
  expiresAt: string;
  allowlistedMerchants: Array<{ id: string; label: string; active: boolean }>;
  verifiedCredit?: {
    amountBaseUnits: string;
    expiresAt: string;
    sourceTxHash: string;
    proofTxHash?: string;
    status: "verified" | "pending" | "failed";
  };
  latestIndexedBlock: number;
  stale: boolean;
};
~~~

- [ ] 3.1. Write tests for no card, active card, suspended card, expired derived state, stale read model, evidence pending/verified/failed, and suspend/resume action.
- [ ] 3.2. Build the virtual card visual as a testnet control surface, not a fiat-card imitation: show Pact, card ID, agent alias, asset, and testnet badge; keep hashes/amounts monospace.
- [ ] 3.3. Build PolicySummary with available credit/effective cap/spent/per-tx cap/expiry/merchant count; label values as chain-confirmed or indexed.
- [ ] 3.4. Build EvidencePanel with source transaction, proof transaction, target block, amount, expiry, and explorer links; show evidence provenance separately from card visual.
- [ ] 3.5. Add owner suspend/resume buttons that call wallet contract methods and refetch status; show a confirmation state before suspend.
- [ ] 3.6. Run tests and commit dashboard/evidence components.

### Task 4 — Build agent console and policy timeline

**Files:** Create apps/web/src/features/agent/AgentPage.tsx, IntentPreview.tsx, PolicyChecks.tsx, ExecutionTimeline.tsx, agent-api.ts, agent-state.ts, AgentPage.test.tsx.

**Interfaces:**

~~~typescript
type TimelineState =
  | "request_created"
  | "intent_ready"
  | "preflight_approved"
  | "preflight_declined"
  | "submitting"
  | "pending_confirmation"
  | "settled"
  | "failed"
  | "uncertain";
~~~

- [ ] 4.1. Write tests for empty prompt, valid allowed request, over-limit decline, unallowlisted merchant, provider unavailable, malformed output, suspended card, pending, settled, failed, and uncertain receipt.
- [ ] 4.2. Implement the request form with plain-language prompt, selected card display, max length, submit disabled on wrong chain/no session, and no raw calldata field.
- [ ] 4.3. Call /v1/agent/intents and display merchant label/ID, amount, asset, purpose, confidence, provider/model, expiry, and intent hash.
- [ ] 4.4. Call /v1/payments/preflight and render each policy check: active card, assigned agent, merchant allowlist, asset, per-tx limit, effective credit, expiry/deadline, nonce.
- [ ] 4.5. On approved preflight, call /v1/payments/execute without opening a wallet signature popup; show the agent signer as an execution actor, not the owner.
- [ ] 4.6. Poll the payment read endpoint until settled/failed/uncertain with bounded polling; never map an executor 200 directly to Settled.
- [ ] 4.7. Run tests and commit agent console.

### Task 5 — Receipt/activity, errors, and accessibility

**Files:** Create apps/web/src/features/payments/PaymentReceiptPage.tsx, payment-api.ts, PaymentReceiptPage.test.tsx, components/ErrorState.tsx, components/StatusBadge.tsx, components/CopyField.tsx, test/accessibility.test.tsx, test/formatters.test.ts.

- [ ] 5.1. Write tests for pending, declined, failed, uncertain, and settled states; settled requires receiptConfirmed true and indexedPaymentEvent true.
- [ ] 5.2. Implement receipt page with payment ID, intent ID/hash, merchant label, amount/asset, block/time, tx hash, explorer link, and exact decline/failure reason.
- [ ] 5.3. Implement activity list with cursor pagination, chain/indexed labels, and empty state; hide sensitive prompt content unless intentionally redacted.
- [ ] 5.4. Add keyboard focus, semantic labels, aria-live for transaction state, error summaries, 44px controls, visible focus ring, and reduced-motion CSS.
- [ ] 5.5. Run component/accessibility/formatter tests and production build.

Run: yarn vitest run apps/web/test apps/web/src && yarn build:web && node scripts/check-no-secrets.mjs  
Expected: PASS; bundle has no server secret and all receipt truth tests pass.
- [ ] 5.6. Commit receipt/accessibility work.

## Acceptance Criteria

- AC-01: setup/payment controls disable on wrong chain.
- AC-02: owner can create/activate a real card with policy and see chain/read-model state.
- AC-03: suspend action visibly blocks the next agent attempt.
- AC-04: evidence panel shows source/proof/target provenance.
- AC-06/07/08: intent preview shows strict fields, errors, provider, and model.
- AC-14: Settled appears only after receipt/event truth.
- AC-16: mobile/desktop reviewer can understand active card, policy, state, decline reason, and explorer link.
- Security invariants 2, 3, 6, 9: browser cannot sign agent payment, hold secrets, choose raw recipient, or fake success.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| UI maps API success to settlement | Critical | receipt page consumes ReceiptTruth and requires two signals |
| Wallet on wrong network sends mutation | Critical | provider adapter checks chain before every owner action and API request |
| Card visual implies fiat value | High | persistent testnet/no-fiat badge and crypto-native policy presentation |
| Mobile layout hides safety reason | High | single-column 320px layout, state badges, plain-language reason copy |
| Account changes leave stale owner/card data | High | clear local session and refetch on accountsChanged/chainChanged |
| Browser bundle leaks secret | Critical | static secret scan and build grep over emitted assets |
| Polling never stops | Medium | bounded interval/attempts and uncertain state with retry action |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| disconnected wallet | connect prompt | automated |
| wrong chain | setup/payment disabled | automated |
| owner rejects signature | recoverable wallet error | automated |
| stale card read | stale badge, no fake success | automated |
| intent malformed | visible fail-closed error | automated |
| preflight decline | timeline ends declined, no execute | automated |
| executor pending | pending confirmation, no Settled | automated |
| receipt/event mismatch | uncertain, explorer/retry guidance | automated |
| mobile 320px | no horizontal overflow, controls reachable | agent-probe |
| reduced motion | no nonessential animation | agent-probe |
| keyboard-only | all actions/focus visible | agent-probe |

## Security Review

Spoofing is handled by wallet/session state and API auth; tampering by refetching chain/read state after owner transactions; repudiation by displaying IDs/hashes; disclosure by secret scan and redacted prompts; denial of service by bounded polling and clear provider errors; and elevation by ensuring the browser has no agent private key and no contract path to pool settlement.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| component/state | yarn vitest run apps/web/test apps/web/src | automated | Vitest output |
| type/build | yarn typecheck and yarn build:web | automated | build output |
| secret bundle | node scripts/check-no-secrets.mjs plus emitted asset scan | automated | clean scan |
| API/chain read | local edge/read API smoke | hybrid | redacted run |
| responsive/keyboard | 320px and desktop browser review | agent-probe | screenshots/notes |
| receipt truth | state matrix fixture | automated | test output |

## Touchpoints

- apps/web/package.json, vite config, router, styles
- apps/web/src/wallet, components, features/setup, dashboard, agent, payments
- apps/web/test and packages/domain read/API types
- docs/runbook/web-demo.md created by Phase 07

## Public Contracts

- Routes and API calls are fixed: /setup, /dashboard, /cards/:cardId, /agent, /payments/:paymentId and the Phase 04/05 endpoints.
- Wallet actions are owner-only contract calls; agent payment uses server executor with no browser signature.
- Receipt UI consumes ReceiptTruth and never creates a new settlement authority.

## Blast Radius

Browser app, browser tests, and UI styles are added. Backend, contracts, database schema, and provider logic are consumed through existing public contracts and not modified.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| wrong-chain/setup tests | Automated | AC-01, AC-02 |
| card/evidence rendering tests | Automated | AC-02, AC-04 |
| intent/policy timeline tests | Automated | AC-06, AC-07, AC-08 |
| receipt truth state matrix | Automated | AC-14 |
| production build/secret scan | Automated | security invariants |
| responsive/keyboard/reduced-motion review | Agent-Probe | AC-16 |

## Test Procedure

Read process/context/all-context.md and process/context/tests/browser-tests.md. Run:
yarn vitest run apps/web/test apps/web/src
yarn typecheck
yarn build:web
node scripts/check-no-secrets.mjs
git diff --check

## Data Verification

- Card values displayed in dashboard match read API/chain readback.
- Evidence source/proof links and hashes are not invented by UI.
- Settled payment has receiptConfirmed and indexedPaymentEvent.
- Wrong-chain or stale states cannot submit owner/payment actions.
- Generated browser assets contain no private key, provider key, or service-role key.

## Manual Test

At 320px and desktop widths: connect wrong network, observe disabled setup; connect correct network, create/activate card; open evidence; submit allowed prompt; view pending then receipt; submit blocked prompt; suspend card; verify next attempt is visibly blocked. Navigate by keyboard and enable reduced motion.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All five tasks are checked; Vitest/type/build/secret gates pass; local API smoke passes; responsive, keyboard, and reduced-motion probes are recorded; Phase 05 receipt/read regression passes; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase creates the first browser surface and receipt-state contract used by Playwright. It deliberately keeps testnet live data outside unit fixtures; Phase 07 owns live browser rehearsal and evidence capture.

## Exit Gate

~~~bash
yarn vitest run apps/web/test apps/web/src
yarn typecheck
yarn build:web
node scripts/check-no-secrets.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- Read API cannot expose receipt truth without database-authority leakage.
- Wallet provider cannot enforce wrong-chain guard before owner mutation.
- Browser build includes server secrets.
- Settled/pending/uncertain cannot be distinguished from backend fields.
- Responsive/accessibility review reveals a primary safety state is unreachable.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; no live payment is required for unit execution.
- On ✅ VERIFIED, continue to phase-07-integrated-deployment-demo_PLAN_08-09-26.md.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
