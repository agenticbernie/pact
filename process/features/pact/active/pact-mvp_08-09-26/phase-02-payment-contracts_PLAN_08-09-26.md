---
name: plan:pact-mvp-phase-02-payment-contracts
description: "Pact — Phase 02: on-chain card policy and native settlement contracts"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-02
---

# Phase 02 — Payment Contracts & Native Settlement

**Date**: 2026-09-08
**Status**: ✅ VERIFIED (user confirmation 2026-09-09; EVL green, report closed)
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–5 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 02 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Implement and prove the on-chain authority for Pact cards: lifecycle, policy, verified-credit hook, merchant allowlist, native testnet settlement, atomic state changes, and replay protection.

**Architecture:** PactCardController is the only policy authority. PactCreditPool holds native testnet CTC and settles only through the controller; MerchantSimulator maps stable merchant IDs to registered recipients. The agent signer can call only the controller payment method and cannot transfer pool funds directly.

**Tech Stack:** Solidity 0.8.30 toolchain with 0.8.28-compatible public interfaces, Foundry, OpenZeppelin Ownable/ReentrancyGuard, ethers v6 artifact export, invariant tests.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Plan Supplement — 09-09-26

Status: INNOVATE complete; R1–R12 applied below as binding task extensions.
PVL not started; no implementation performed. Research artifact
(`phase-02-payment-contracts_RESEARCH_09-09-26.md`) is preserved as evidence.

### Innovate decision record

Accepted with refinements: D1 controller/pool/merchant split; D2 `evm_version="shanghai"`;
D3 storage `ReentrancyGuard`; D4 pragma `^0.8.28`; D5 `Ownable(msg.sender)`; D6 ordered
one-time wiring; D7 hardcoded `address(0)` asset; D8 derived expiry; D9 nonce-before-call;
D10 overwrite-by-new-ID evidence replacement.

Refinements adopted: pool accounting reads real balance (`address(this).balance`, never a
tracked counter, so force-fed value cannot desync solvency checks); merchant records
`totalReceived` BEFORE forwarding so reentrant reads observe updated state, event emitted
after the call; `updatePolicy` allowed on ISSUED/ACTIVE/SUSPENDED (never CLOSED); `closeCard`
allowed on expired cards; same `intentHash` with a fresh nonce on the same card is a distinct
authorized payment bounded by the deadline (accepted semantics, not replay); stale-expiry
evidence overwriting newer credit is a documented limitation of D10 (accepted: the ASC path
is trusted and the Phase 03 worker submits in order).

Rejected (no scope expansion): ERC-20/multi-asset branch; transient `ReentrancyGuardTransient`;
Cancun/Osaka EVM target; owner==ASC authority model (spec requires a human owner lifecycle);
pausable contracts (per-card suspend suffices); pull-refund flow (failures revert atomically,
nothing moves); monotonic-evidence gate (complexity without MVP threat coverage); R2 ASC
remapping realignment (both forms resolve; avoid cross-phase churn for zero functional gain —
Phase 01 form stays).

AICD impact: none. The authority model, component set, flows, and scenario links are
unchanged; the new admin `PoolWithdrawn` event needs no scenario link (stated in R5).

### Applied tasks (R1–R12)

Each item names the implementation task, affected file, acceptance criteria, required
test, AICD linkage, and gate class (local-only vs future testnet gate). Anchors reference
the base checklist above, which now reads together with this supplement.

- R1: set `evm_version = "shanghai"` in `contracts/foundry.toml` (Phase 01-owned file;
  additive one-line change, semantics otherwise preserved — record in the Phase 01
  supplement chain at PVL). Acceptance: `forge config --root contracts` resolves
  `evm_version = "shanghai"` and the full suite stays green. Test: Task 5 deploy-test
  preamble asserts the resolved EVM version. AICD: toolchain only, no link change.
  Gate: local-only. Extends Task 1.
- R2: DECIDED — keep the Phase 01 ASC remapping (rejected change, see above). No task.
- R3: extend `contracts/src/PactErrors.sol` with `UnknownAgent` (credit hook for an agent
  with no card), `AuthorityAlreadySet` (second call to any one-time wiring/authority
  setter), `RenounceDisabled` (see R4). Zero-address wiring/measurement misuse reuses
  `InvalidPolicy` (documented, not a new error). Acceptance: `forge build` clean; every
  new error has a named revert test at its call site. Test: Task 1 type test lists the
  full set; Tasks 2–3 revert tests consume them. AICD: authority model unchanged.
  Gate: local-only. Extends Tasks 1.2, 2.x, 3.x.
- R4: override `renounceOwnership()` to revert with `RenounceDisabled` on all three
  contracts (accidental renounce would brick policy updates, ASC wiring, and testnet fund
  recovery). Acceptance: calling `renounceOwnership` from the owner reverts; ownership
  transfer still works. Test: per-contract renounce-revert test. AICD: none.
  Gate: local-only. Extends Tasks 2–3.
- R5: add `withdraw(address payable to, uint256 amount) external onlyOwner` to
  `PactCreditPool` plus `PoolWithdrawn(address indexed to, uint256 amount)` event
  (testnet administration per spec; never a payment path). Acceptance: owner withdraws
  partial/full balance with event; non-owner reverts; over-balance reverts; settlement
  accounting unaffected. Test: withdraw unit tests in `PactCreditPool.t.sol`.
  AICD: admin operation, no scenario link required. Gate: local-only (exercised on Anvil).
  Extends Task 2.4.
- R6: `preflightPay` returns stable short-ASCII `bytes32` reason codes: `OK`,
  `INACTIVE_CARD`, `WRONG_CALLER`, `MERCHANT_BLOCKED`, `WRONG_ASSET`, `ZERO_AMOUNT`,
  `OVER_TX_LIMIT`, `CREDIT_EXCEEDED`, `CARD_EXPIRED`, `DEADLINE_EXPIRED`, `POOL_LOW`,
  `NONCE_USED`. Caller mirroring rule: `preflightPay` checks `msg.sender` against the
  assigned agent; off-chain callers static-call with `from` set to the agent address
  (tests call from the agent fixture). Also publish the contract-error→DomainError map
  for the Phase 04 executor (`MerchantNotAllowed`↔`MERCHANT_NOT_ALLOWLISTED`, etc.).
  Acceptance: paired matrix — every `pay` revert case has a matching `preflightPay`
  reason assertion. Test: Task 4.1 table-driven tests on both entrypoints.
  AICD: existing flow links cover. Gate: local-only. Extends Task 4.6.
- R7: wiring sequence — deploy `MerchantSimulator` → `PactCreditPool` →
  `PactCardController`; then one-time owner-only `merchant.setPool`,
  `pool.setController`, `controller.setAscAuthority` (ASC address lands in Phase 03);
  the Task 5 script asserts the full triangle (controller→pool, pool→controller,
  pool→merchant, merchant→pool) before merchant registration. Second calls and
  zero addresses revert (`AuthorityAlreadySet` / `InvalidPolicy`); calls to
  unconfigured contracts revert. Acceptance: assertion passes on Anvil; mis-ordering
  fails fast. Test: wiring unit tests + script assertion. AICD: deployment hosts
  unchanged. Gate: local-only (script reused by Phase 07). Extends Tasks 2–3, 5.3.
- R8: public read accessors for off-chain readback — public `cards`, `agentActiveCard`,
  `usedNonces`, merchant registry/totals mappings plus an `isMerchantActive` view.
  Acceptance: `cast call` readback in the Task 5.1 deployment test returns creation
  values. Test: readback assertions. AICD: none. Gate: local-only. Extends Tasks 2–4, 5.1.
- R9: full event parameter lists (all 12 events incl. R5's `PoolWithdrawn`):
  `PaymentSettled` carries `intentHash` with indexed `cardId` and `nonce`;
  `CreditVerified` carries agent, evidence ID, amount, expiry. Acceptance:
  `vm.expectEmit` assertions on every state-changing path. Test: event tests in each
  suite. AICD: existing links cover. Gate: local-only. Extends Task 1.3 and all suites.
- R10: toolchain discipline — pragma `^0.8.28` on new contracts;
  `Ownable(msg.sender)` constructors; storage `ReentrancyGuard` (never transient);
  project toolchain forge/anvil 1.7.1, solc 0.8.30. Acceptance: clean build; no
  `TSTORE`/`TLOAD` in emitted artifacts. Test: build + suite green. AICD: none.
  Gate: local-only. Extends Task 1.
- R11: deploy-script chain guard — explicit `--rpc-url` required (no default broadcast
  target); allowlist local `31337` plus configured testnet IDs; reject known mainnet
  IDs `{1,10,56,137,42161,…}`; abort before broadcast on mismatch. Acceptance: wrong-chain
  invocation aborts with no broadcast (the plan's hybrid scenario). Test: guard unit
  tests with mocked chain ID in `DeployPaymentSystem.t.sol`. AICD: none.
  Gate: local-only (testnet use is Phase 07). Extends Task 5.3.
- R12: evidence replacement = overwrite-by-new-ID in `applyVerifiedCreditForAgent`
  (D10), with the stale-overwrite limitation documented above. Acceptance: second valid
  evidence replaces amount/expiry and emits `CreditVerified`; replayed ID reverts.
  Test: Task 3.2 replacement + replay tests. AICD: ASC authority unchanged.
  Gate: local-only. Extends Task 3.7.

### Conflicts resolved

- Task 1.2 error list extended by R3 (additive; no existing error renamed/removed).
- Task 2 interface extended by R5 withdraw (additive; settlement paths untouched).
- Task 1.3 event list extended by R5 `PoolWithdrawn` (additive).
- `contracts/foundry.toml` (Phase 01-owned) gains one additive key via R1; recorded here
  for the Phase 01 supplement chain; no existing key changes value.
- R2 realignment rejected (above); no cross-phase churn.

### Deferred (U1–U5, unchanged)

U1 EVM hardfork level, U2 RPC/faucet liveness, U3 tCTC denomination, U4 `0xFD2`/decoder
values, U5 blockscout verification — all stay on the Phase 03/07 hybrid gates. Nothing
inferred; D2/D3 remove the only EVM-level dependency from Phase 02 scope.

## Global Constraints

- Creditcoin EVM-compatible Advance Testnet is the settlement/policy target; exact runtime values come from Phase 01.
- MVP asset is native-testnet-ctc represented in Solidity as address(0); no ERC-20 or multi-chain branch is added.
- The off-chain logical asset ID, native EVM address, symbol, and decimals are read
  from the Phase 01 shared asset descriptor; this phase does not create a second
  asset mapping.
- `merchantId` is the canonical kebab-case off-chain ID converted to Solidity
  `bytes32` by the Phase 01 `merchantIdToBytes32` rule; payment functions never
  accept a raw recipient address.
- `Card.policyVersion` is the same uint32 value carried by the domain
  `CanonicalIntentInput`; hash vectors and ABI encoding must remain compatible.
- Policy is checked again on chain after off-chain preflight.
- Owner controls lifecycle/policy; assigned agent controls no policy; ASC controls verified-credit application; pool accepts only controller settlement.
- pay accepts merchantId, never a raw recipient address.
- Spend increments only after a successful pool/merchant call; any revert preserves all state.
- Testnet funds and keys are disposable.

---

## Overview

This phase makes Pact's central safety promise executable: the owner configures a policy once, an agent can attempt a payment without a per-payment owner signature, and the chain enforces the policy. This phase is local-first and does not implement ASC proof decoding, off-chain endpoints, or live deployment.

## Entry Gate

- Phase 01 is ✅ VERIFIED or has a written bounded exception that does not weaken contract authority.
- contracts/foundry.toml and packages/domain exist.
- Read process/context/all-context.md, follow process/context/tests/all-tests.md,
  then read process/context/tests/contract-tests.md.
- OpenZeppelin version is pinned; ASC package integration remains Phase 03.
- No mainnet address/key exists in fixtures.

## Phase Loop Progress

- [x] 1. RESEARCH — inspect Phase 01 report, Foundry/package versions, official ASC example conventions, and contract tree
- [x] 2. INNOVATE — choose native-only controller/pool/merchant split; record rejected ERC-20 and direct-agent-treasury alternatives
- [x] 3. PLAN-SUPPLEMENT — update touchpoints/tests if compiler or dependency facts change
- [x] 4. PVL — vc-validate-agent writes the V1–V7 Validate Contract with exact Forge gates
- [x] 5. EXECUTE — complete Tasks 1–5 and run each section gate immediately
- [x] 6. EVL — independently rerun Forge tests, invariant tests, and local deployment
- [x] 7. UPDATE PROCESS — write report, update umbrella, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Define contract types, errors, and interfaces

**Files:** Create contracts/src/PactTypes.sol, PactErrors.sol, IPactCardController.sol, IPactCreditPool.sol, IMerchantSimulator.sol, contracts/test/PactTypes.t.sol.

**Stable interface:**

~~~solidity
enum CardStatus { Issued, Active, Suspended, Closed }

struct Card {
    address owner;
    address agent;
    address asset;
    uint256 ownerConfiguredCap;
    uint256 verifiedCredit;
    uint64 verifiedCreditExpiry;
    uint256 spent;
    uint256 perTransactionLimit;
    uint64 expiresAt;
    CardStatus status;
    uint32 policyVersion;
}

interface IPactCardController {
    function applyVerifiedCreditForAgent(address agent, bytes32 evidenceId, uint256 amount, uint64 expiresAt) external;
    function preflightPay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline)
        external view returns (bool allowed, bytes32 reason);
}
~~~

- [x] 1.1. Write a compile test importing the types and asserting status order.
- [x] 1.2. Add custom errors: UnauthorizedCaller, InvalidCardStatus, InvalidAmount, InvalidAsset, MerchantNotAllowed, CreditExceeded, CardExpired, PaymentDeadlineExpired, NonceAlreadyUsed, PoolBalanceLow, MerchantInactive, EvidenceAlreadyApplied, InvalidPolicy. Keep error names/codes mapped to the Phase 01 DomainError union without introducing an incompatible API code.
- [x] 1.3. Add typed events CardCreated, CardActivated, CardSuspended, CardResumed, CardClosed, PolicyUpdated, CreditVerified, PaymentSettled, PoolFunded, MerchantRegistered, MerchantPaymentReceived.
- [x] 1.4. Run forge test --root contracts --match-path test/PactTypes.t.sol; expect PASS.
- [x] 1.5. Commit the type/interface files.

### Task 2 — Implement MerchantSimulator and PactCreditPool

**Files:** Create contracts/src/MerchantSimulator.sol, PactCreditPool.sol, contracts/test/MerchantSimulator.t.sol, PactCreditPool.t.sol.

**Stable interface:**

~~~solidity
function registerMerchant(bytes32 merchantId, address payable recipient) external onlyOwner;
function receivePayment(bytes32 merchantId) external payable onlyPool;
function fundPool() external payable onlyOwner;
function settleNative(bytes32 merchantId, uint256 amount) external onlyController;
function availableBalance() external view returns (uint256);
~~~

- [x] 2.1. Write tests for owner-only registration, zero/duplicate merchant rejection, inactive merchant rejection, recipient forwarding, owner-only funding, controller-only settlement, low balance, and reverting recipient.
- [x] 2.2. Run focused tests and observe missing-contract failures.

Run: forge test --root contracts --match-path 'test/MerchantSimulator.t.sol' --match-path 'test/PactCreditPool.t.sol' -vvv  
Expected: FAIL because contracts are absent.

- [x] 2.3. Implement MerchantSimulator with bytes32 merchant IDs, active status, recipient, totalReceived, pool-only receivePayment, and a reentrancy guard around forwarding.
- [x] 2.4. Implement PactCreditPool with immutable controller/merchant addresses, owner-only fundPool, controller-only settleNative, balance check, and receipt event after successful merchant call. Reject untracked direct deposits.
- [x] 2.5. Run focused and full Forge tests.

Run: forge test --root contracts --match-path 'test/MerchantSimulator.t.sol' -vvv && forge test --root contracts --match-path 'test/PactCreditPool.t.sol' -vvv && forge test --root contracts -vvv  
Expected: PASS.
- [x] 2.6. Commit pool/merchant source and tests.

### Task 3 — Implement card lifecycle and verified-credit hook

**Files:** Create contracts/src/PactCardController.sol, contracts/test/PactCardController.t.sol, contracts/test/PactCardLifecycle.t.sol.

**Stable interface:**

~~~solidity
function createCard(address agent, uint256 ownerConfiguredCap, uint256 perTransactionLimit, uint64 expiresAt, bytes32[] calldata allowlistedMerchants) external returns (uint256);
function activateCard(uint256 cardId) external;
function suspendCard(uint256 cardId) external;
function resumeCard(uint256 cardId) external;
function closeCard(uint256 cardId) external;
function updatePolicy(uint256 cardId, uint256 ownerConfiguredCap, uint256 perTransactionLimit, uint64 expiresAt, bytes32[] calldata allowlistedMerchants) external;
function setAscAuthority(address ascAuthority) external onlyOwner;
function applyVerifiedCreditForAgent(address agent, bytes32 evidenceId, uint256 amount, uint64 expiresAt) external;
~~~

- [x] 3.1. Write failing lifecycle tests for create/activate, owner-only transitions, suspend/resume, terminal close, zero agent/caps, past expiry, and one active card per agent.
- [x] 3.2. Write failing credit tests for ASC-only access, positive amount/future expiry, evidence replay, unknown agent, and replacement by a newer verified evidence record.
- [x] 3.3. Run focused tests; expect missing controller failures.
- [x] 3.4. Implement card storage, card-scoped merchant allowlists, used evidence IDs, used nonces, agent-to-active-card mapping, and card IDs starting at 1.
- [x] 3.5. Implement lifecycle: ISSUED → ACTIVE → SUSPENDED ↔ ACTIVE; ISSUED/ACTIVE/SUSPENDED → CLOSED; CLOSED is terminal.
- [x] 3.6. Implement effective credit as min(ownerConfiguredCap, verifiedCredit), with zero available when card or evidence expiry has passed.
- [x] 3.7. Implement ASC-only applyVerifiedCreditForAgent, evidence dedupe, agent-card lookup, state update, and CreditVerified event.
- [x] 3.8. Run lifecycle and credit tests.

Run: forge test --root contracts --match-path 'test/PactCardController.t.sol' -vvv && forge test --root contracts --match-path 'test/PactCardLifecycle.t.sol' -vvv  
Expected: PASS.
- [x] 3.9. Commit controller lifecycle source and tests.

### Task 4 — Implement payment authority and invariants

**Files:** Modify contracts/src/PactCardController.sol and PactCreditPool.sol. Create contracts/test/PactPaymentPolicy.t.sol, PactPaymentAtomicity.t.sol, PactPaymentInvariant.t.sol.

**Stable interface:**

~~~solidity
function pay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline, bytes32 intentHash) external;
function preflightPay(uint256 cardId, bytes32 merchantId, uint256 amount, address asset, uint256 nonce, uint64 deadline)
    external view returns (bool allowed, bytes32 reason);
~~~

- [x] 4.1. Write a table-driven policy test for inactive card, wrong caller, merchant inactive/not allowlisted, wrong asset, zero amount, per-transaction cap, effective credit, card expiry, payment deadline, low pool balance, and reused nonce.
- [x] 4.2. Write success tests for one PaymentSettled event, exact spent increment, exact merchant increment, and intentHash retention.
- [x] 4.3. Write atomicity tests using a reverting merchant recipient and compare card spent, pool balance, merchant balance, and nonce state before/after revert.
- [x] 4.4. Write invariant tests proving spent never exceeds current effective limit and a used nonce cannot settle twice.
- [x] 4.5. Run failures before implementation.

Run: forge test --root contracts --match-path 'test/PactPaymentPolicy.t.sol' --match-path 'test/PactPaymentAtomicity.t.sol' --match-path 'test/PactPaymentInvariant.t.sol' -vvv  
Expected: FAIL before pay exists.

- [x] 4.6. Implement preflightPay as a read-only mirror returning stable bytes32 reason codes. Consume the Phase 01 canonical merchant/asset conversion and verify `policyVersion`/intentHash inputs use the shared field order.
- [x] 4.7. Implement pay with identical checks, mark nonce before the external call, call pool.settleNative, increment spent only after success, and emit PaymentSettled.
- [x] 4.8. Ensure expired status is derived for reads; do not create a mutable expiry transition.
- [x] 4.9. Run full Forge tests and invariant suite.

Run: forge test --root contracts -vvv && forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv  
Expected: PASS with no invariant counterexample.
- [x] 4.10. Commit controller payment source and tests.

### Task 5 — Add local deployment and SDK artifacts

**Files:** Create contracts/script/DeployPaymentSystem.s.sol, contracts/script/DeployPaymentSystem.t.sol, scripts/export-contract-artifacts.mjs, packages/pact-sdk/package.json, packages/pact-sdk/src/abi.ts, addresses.ts, index.ts, config/deployments/local-payment.json.

**Interfaces:** The script deploys MerchantSimulator, PactCardController, and PactCreditPool with explicit wiring, registers one merchant, funds the pool from an invocation key, and emits a manifest. The export script writes ABI plus address metadata; it never reads a committed key.

- [x] 5.1. Write an Anvil deployment test for deploy, wire, merchant registration, pool funding, card creation/activation, and readback.
- [x] 5.2. Run the deployment test before implementation; expect missing-script failure.
- [x] 5.3. Implement script with environment-provided key/RPC, explicit non-mainnet chain guard, and no default broadcast target.
- [x] 5.4. Implement artifact export with protocol, label, chainId, controller, pool, merchantSimulator, deployedAtBlock, and gitCommit.
- [x] 5.5. Run local deployment and export.

Run: anvil --silent & forge script contracts/script/DeployPaymentSystem.s.sol --rpc-url http://127.0.0.1:8545 --broadcast && node scripts/export-contract-artifacts.mjs && yarn typecheck  
Expected: deployment succeeds, SDK imports, typecheck passes.

- [x] 5.6. Run full local gates and commit generated artifacts.

Run: forge test --root contracts -vvv && yarn validate:aicd && node scripts/check-no-secrets.mjs  
Expected: PASS.

## Acceptance Criteria

- AC-02: create/activate card with agent, caps, allowlist, native asset, and expiry.
- AC-03: suspension blocks payment with no settlement.
- AC-09: allowed native payment settles atomically and emits intentHash.
- AC-10: on-chain policy matrix rejects invalid caller/status/merchant/asset/limit/credit.
- AC-11: card/deadline expiry blocks payment.
- AC-12: nonce replay cannot settle twice.
- AC-13: merchant failure preserves all balances and spend.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| Pool/controller wiring creates circular dependency | High | Deploy in dependency order, use one-time owner-only wiring if required, assert final addresses |
| Reverting merchant corrupts accounting | Critical | external call before spend increment, full transaction revert, snapshot test |
| Agent reaches treasury | Critical | pool onlyController, no agent withdrawal, gas-only agent |
| Model/client supplies payout address | Critical | bytes32 merchant ID registry and allowlist |
| preflightPay differs from pay | High | shared reason matrix and paired tests |
| credit evidence replay | High | ASC-only caller plus evidence ID dedupe |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| suspended card | revert, no balance change | automated |
| amount exactly at cap | settle | automated |
| cap plus one base unit | revert | automated |
| evidence expires after preflight | on-chain pay reverts | automated |
| same nonce twice | second call reverts | automated |
| merchant recipient reverts | full state snapshot preserved | automated |
| direct agent call to pool | unauthorized | automated |
| wrong chain in deployment | script aborts before broadcast | hybrid |

## Security Review

The contract review covers spoofing via owner/agent/ASC caller checks; tampering via on-chain policy and nonce state; repudiation via typed settlement events; information disclosure by keeping prompts/secrets off chain; denial of service from reverting merchant calls; and elevation of privilege through pool/controller separation. No external call accepts a model-provided payout address.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| Forge suite | forge test --root contracts -vvv | automated | Forge output |
| Invariants | forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv | automated | invariant output |
| Anvil deployment | anvil plus forge script plus export script | hybrid | local manifest |
| On-chain readback | cast calls for card/pool/merchant | agent-probe | readback note |
| Shared regression | yarn test packages/domain/test and yarn validate:aicd | automated | regression output |

## Touchpoints

- contracts/src/PactTypes.sol, PactErrors.sol, PactCardController.sol, PactCreditPool.sol, MerchantSimulator.sol
- contracts/test and contracts/script/DeployPaymentSystem.s.sol
- packages/pact-sdk and scripts/export-contract-artifacts.mjs
- config/deployments/local-payment.json

## Public Contracts

- Methods/events in Tasks 1–4 are stable for ASC, executor, indexer, and UI.
- Native asset is address(0); merchant lookup is bytes32 merchantId.
- Phase 03 consumes setAscAuthority and applyVerifiedCreditForAgent; it does not change pay authority.

## Blast Radius

Only Solidity sources/tests/scripts and generated SDK artifacts change. No Supabase function, Cloudflare route, UI, provider secret, or live testnet state changes in this phase.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| lifecycle and access tests | Automated | AC-02, AC-03 |
| policy matrix and expiry | Automated | AC-10, AC-11 |
| nonce replay | Automated | AC-12 |
| atomic recipient failure | Automated | AC-13 |
| allowed local payment | Hybrid | AC-09 |
| contract readback | Agent-Probe | AC-02, AC-09 |

## Test Procedure

Read process/context/all-context.md and process/context/tests/contract-tests.md. Run:
forge fmt --check
forge test --root contracts -vvv
forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv
yarn test
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check

## Data Verification

- Card asset is address(0); owner/agent/caps/expiry/allowlist match the creation call.
- Successful payment changes spent and merchant total exactly once by amount.
- Failed payment preserves spent, pool balance, merchant total, and nonce state.
- SDK addresses come only from the deployment manifest.

## Manual Test

With Anvil, use cast call to inspect controller/pool/merchant; confirm an agent cannot call pool and that the recipient is resolved only from merchantId.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All five tasks are checked; Forge unit/policy/atomicity/invariant gates pass; local deployment/readback evidence exists; SDK is current; Phase 01 tests regress green; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase adds the first real behavior suite and the SDK bridge consumed by ASC, executor, indexer, and UI. Any constructor or event change must be reflected in the blast-radius registry and downstream plans before implementation continues.

## Exit Gate

~~~bash
forge fmt --check
forge test --root contracts -vvv
forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv
yarn test
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- Pinned Solidity/OpenZeppelin versions cannot compile.
- Wiring requires giving agent treasury authority.
- Merchant failure cannot preserve all state.
- A policy requirement would widen scope to multiple assets/chains.
- PVL cannot produce exact Forge gates.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; no Advance Testnet deployment from this phase.
- On ✅ VERIFIED, continue to phase-03-asc-credit-evidence_PLAN_08-09-26.md.

## Validate Contract

Status: CONDITIONAL
Date: 2026-09-09
date: 2026-09-09
generated-by: inner-pvl: phase-2

PVL scope: V1 pre-check + V2 two-layer fan-out + V3 synthesis on 2026-09-09 against
real files and real command output on branch `main` @ `6cc2d0e`. No RPC calls,
deploys, transactions, provider calls, or secret writes in this pass. U1–U5 stay
deferred to the Phase 03/07 hybrid gates.

V1 evidence: plan structural validator exit 0 (0 failures, 0 warnings); baseline
`typecheck` exit 0 and domain suite 6 files / 56 tests green; `forge fmt --check`
exit 0 (vacuous pre-implementation — recorded as such, not as formatting evidence);
context-discovery audit exit 0; scout confirms 6 plan-created paths absent as expected
with all 3 prerequisites present; toolchain observed forge 1.7.1 / anvil 1.7.1 /
commit 4072e48 (matches contract; no svm cache — solc 0.8.30 download occurs at first
EXECUTE build).

V2 evidence: machine-checked findings artifact
`phase-02-pvl-v2-findings_09-09-26.md` (`validate-findings-output.mjs` exit 0,
net gate CONDITIONAL). Layer 1: infra CONCERN, coverage CONCERN, breaking PASS-notes,
security PASS-notes. Layer 2: all 10 sections feasible, no failing verdicts, no
feasibility probes (every unknown is an explicit hybrid gate or a NOT-RUN
pre-implementation gate).

Test gates (exact commands; Forge gates are exact in-plan and NOT RUN
pre-implementation — RED-first runs begin EXECUTE Task 1.1/2.2):

- `forge fmt --check`
- `forge test --root contracts -vvv`
- `forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv`
- `anvil --silent` + `forge script contracts/script/DeployPaymentSystem.s.sol --rpc-url http://127.0.0.1:8545 --broadcast` + `node scripts/export-contract-artifacts.mjs` (hybrid, Task 5)
- `cast` readback for card/pool/merchant (agent-probe, Task 5.1/manual test)
- `corepack yarn test` + `corepack yarn typecheck` (Phase 01 regression, green at PVL time: 56/56)
- `corepack yarn validate:aicd`
- `node scripts/check-no-secrets.mjs`
- `git diff --check`
- Version recording: EXECUTE report must log `forge --version` / `anvil --version` output (the plan does not pin version-assertion gates; C-P2c note).

Dimension findings:

- infra/setup-fit: CONCERN — created paths absent-but-planned; toolchain present; solc download pending.
- test-coverage: CONCERN — tiers cover all areas; micro-gaps only (version assertions, explicit build gate, `--ffi=false` pin; fuzzing via invariant runs).
- breaking-changes: PASS with notes — new surface, Phase 01 consumed read-only, R1 touch recorded, R2 rejected.
- security-surface: PASS with notes — STRIDE + D1–D10 + named revert tests; residual EVM risk on U1 gate.

Open gaps (CONCERNs, no FAILs):

- C-P2a: plan-created paths absent (correct pre-EXECUTE state; first increments are RED tests).
- C-P2b: solc 0.8.30 download pending first EXECUTE build.
- C-P2c: gate explicitness notes (version assertions, explicit build, `--ffi=false`).
- C-P2d: R1 cross-phase `foundry.toml` touch pending EXECUTE application.

What This Coverage Does NOT Prove (required statement):

- No Forge test, build, deployment, RPC identity, or testnet evidence exists or is claimed.
- `forge fmt` green is vacuous pre-implementation. Chain identity (102031) is documented
  from official sources with liveness unprobed. Solc and OS toolchain versions observed,
  not exercised. Green confirmation of every NOT-RUN gate is deferred to EXECUTE/EVL.

Hard stops carried into EXECUTE (verbatim for /goal block):

- Do not fake Forge results, builds, deployment, RPC identity, or testnet evidence.
- No live calls, testnet mutations, or secret writes in Phase 02 (local Anvil only).
- Wiring must never grant the agent treasury authority at any step.
- Merchant failure must preserve all state, or the phase is BLOCKED.
- No scope widening to other assets, chains, or product surface.
- U1–U5 stay deferred; record exact evidence or mark UNKNOWN.

Strategy for EXECUTE: sequential, single executor, Tasks 1→5 in order (shared
`contracts/src` forbids parallel writers). No fan-out.

Accepted by: user, 2026-09-09 — CONDITIONAL accepted with concerns C-P2a–C-P2d (V5 exit gate).
