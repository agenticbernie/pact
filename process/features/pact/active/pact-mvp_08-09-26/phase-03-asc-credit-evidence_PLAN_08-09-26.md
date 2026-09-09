---
name: plan:pact-mvp-phase-03-asc-credit-evidence
description: "Pact — Phase 03: Attestcoin source evidence, ASC verification, and proof worker"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-03
---

# Phase 03 — ASC Credit Evidence

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–5 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 03 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Record a real source-chain credit event, prove it through the Attestcoin readability flow, and apply verified credit to the correct Pact card without accepting an unregistered emitter, failed receipt, unsupported action, or replay.

**Architecture:** PactCreditSource is a deliberately narrow source-testnet event emitter. PactCreditASC follows the official ASCBase + EvmV1Decoder pattern and is the only component allowed to call the controller’s verified-credit hook. The proof worker only discovers events, requests proof data, submits ASC.execute, retries idempotently, and records evidence.

**Tech Stack:** Solidity 0.8.28-compatible ASC contracts, @gluwa/asc-contracts, @gluwa/usc-sdk, ethers v6, Foundry, TypeScript/Node 20, Vitest.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- Creditcoin EVM Advance Testnet remains the target for PactCreditASC and card state; default source is an Ethereum Sepolia-compatible testnet.
- ASC is an evidence verifier, not a settlement contract; the proof worker cannot change credit directly.
- Use the exact ASCBase.execute signature from the pinned package:
  execute(uint8,uint64,uint64,bytes,bytes32,MerkleProofEntry[],bytes32,bytes32[]) returns (bool).
- Verify successful receipt status, CreditGranted event signature, registered source emitter, beneficiary/card mapping, positive amount, future expiry, unique evidence ID, and unique ASC query.
- The proof worker may retry a timeout but must dedupe by source transaction/evidence ID and query ID.
- Live proof submission is a cost-bearing/outward-facing testnet action and requires the phase Validate Contract plus explicit lane approval.
- No real credit underwriting is implied by a testnet CreditGranted event.

---

## Overview

This phase adapts the official Attestcoin loan readability example to Pact’s credit-evidence use case. A source event becomes usable credit only after the target ASC verifies proof inclusion/continuity and the application-specific handler validates the event. The phase separates local proof logic from live proof rehearsal so a source outage cannot be hidden behind a mock success.

## Entry Gate

- Phase 02 is ✅ VERIFIED; controller exposes setAscAuthority and applyVerifiedCreditForAgent.
- ASC package versions and compiler constraints are pinned.
- Read process/context/all-context.md, process/context/tests/contract-tests.md, and the official Attestcoin example source available in the workspace.
- Source-chain and Advance Testnet wallets are disposable and have only testnet gas.
- Exact source chain key, proof builder endpoint, target RPC, verifier precompile, decoder library, and deployed controller/ASC addresses are available for a live lane or recorded as a bounded blocker.

## Phase Loop Progress

- [ ] 1. RESEARCH — inspect official ASCBase/EvmV1Decoder signatures, Phase 02 artifacts, package versions, and prior proof attempts
- [ ] 2. INNOVATE — choose a single CreditGranted action plus evidence-ID dedupe; record rejected direct database credit and multi-action alternatives
- [ ] 3. PLAN-SUPPLEMENT — update decoder/proof payload touchpoints if pinned packages differ
- [ ] 4. PVL — vc-validate-agent writes V1–V7 contract with local and live proof gates
- [ ] 5. EXECUTE — complete Tasks 1–5 and run each section gate immediately
- [ ] 6. EVL — rerun local ASC harness, worker tests, and inspect live evidence or blocker artifact
- [ ] 7. UPDATE PROCESS — write report, update umbrella/downstream plans, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Pin ASC dependencies and implement the source emitter

**Files:** Modify contracts/foundry.toml and package.json. Create contracts/src/PactCreditSource.sol, contracts/test/PactCreditSource.t.sol, config/asc/source-testnet.json.

**Stable interface:**

~~~solidity
event CreditGranted(
    bytes32 indexed evidenceId,
    address indexed beneficiary,
    uint256 creditAmount,
    uint64 expiresAt
);

function recordCredit(
    bytes32 evidenceId,
    address beneficiary,
    uint256 creditAmount,
    uint64 expiresAt
) external onlyOwner;
~~~

- [ ] 1.1. Pin @gluwa/asc-contracts and @gluwa/usc-sdk to the versions verified against the official examples; record compiler/package versions in config/asc/source-testnet.json.
- [ ] 1.2. Write source tests for owner-only emission, duplicate evidence, zero beneficiary, zero amount, and past expiry.
- [ ] 1.3. Run forge test --root contracts --match-path test/PactCreditSource.t.sol; expect failure before the source contract exists.
- [ ] 1.4. Implement the source emitter with no transfer, no repayment logic, and a unique evidence mapping.
- [ ] 1.5. Run focused tests and commit source/dependency changes.

### Task 2 — Implement PactCreditASC using official ASCBase flow

**Files:** Create contracts/src/PactCreditASC.sol, contracts/test/PactCreditASC.t.sol, contracts/test/PactCreditASCHarness.t.sol. Modify contracts/src/IPactCardController.sol and packages/pact-sdk/src/abi.ts through the export script.

**Stable interface:**

~~~solidity
function registerSourceCreditContract(uint64 sourceChainKey, address sourceContract) external onlyOwner;

function execute(
    uint8 action,
    uint64 chainKey,
    uint64 blockHeight,
    bytes calldata encodedTransaction,
    bytes32 merkleRoot,
    INativeQueryVerifier.MerkleProofEntry[] calldata siblings,
    bytes32 lowerEndpointDigest,
    bytes32[] calldata continuityRoots
) external returns (bool success);

function _processAndEmitEvent(
    uint8 action,
    bytes32 queryId,
    bytes memory encodedTransaction
) internal override;
~~~

- [ ] 2.1. Write local harness tests for valid action, unsupported action, invalid receipt status, missing event, wrong emitter, wrong topic count/data, unknown beneficiary, expired credit, evidence replay, and query replay.
- [ ] 2.2. Install a mock verifier implementation at 0xFD2 in the Foundry harness before deploying PactCreditASC; make the mock return true only for the fixture proof.
- [ ] 2.3. Run focused tests and observe failures.

Run: forge test --root contracts --match-path 'test/PactCreditASC.t.sol' --match-path 'test/PactCreditASCHarness.t.sol' -vvv  
Expected: FAIL before PactCreditASC exists.

- [ ] 2.4. Implement PactCreditASC inheriting Ownable and ASCBase, define action CREDIT_GRANTED = 0, compute the CreditGranted event signature, register one source chain key/address, and bind the controller address.
- [ ] 2.5. Implement _processAndEmitEvent to reject unsupported action, decode receipt/logs with EvmV1Decoder, require receiptStatus == 1, require exact event signature, require log.address_ equals registered source, decode evidenceId/beneficiary/amount/expiry, and call controller.applyVerifiedCreditForAgent only after evidence checks.
- [ ] 2.6. Keep separate processedEvidenceIds in addition to ASCBase.processedQueries so two valid queries cannot apply the same evidence event.
- [ ] 2.7. Run the full local ASC harness and Phase 02 regression.

Run: forge test --root contracts --match-path 'test/PactCreditASC.t.sol' -vvv && forge test --root contracts --match-path 'test/PactPaymentPolicy.t.sol' -vvv  
Expected: all ASC and payment policy tests pass.

- [ ] 2.8. Export the ABI and commit the ASC contract/test changes.

### Task 3 — Build the proof-worker adapter and durable retry state

**Files:** Create services/asc-proof-worker/package.json, src/types.ts, src/proof-client.ts, src/source-scanner.ts, src/worker.ts, src/state-store.ts, test/proof-client.test.ts, test/worker-idempotency.test.ts, config/asc/proof-worker.example.json, scripts/asc/print-proof-input.mjs.

**Stable interface:**

~~~typescript
type AscProofPayload = {
  chainKey: number;
  blockHeight: number;
  encodedTransaction: string;
  merkleRoot: string;
  siblings: Array<{ hash: string; left: boolean }>;
  lowerEndpointDigest: string;
  continuityRoots: string[];
};

interface ProofProvider {
  buildProof(sourceTxHash: string, sourceChainKey: number): Promise<AscProofPayload>;
}

interface EvidenceStore {
  seen(evidenceKey: string): Promise<boolean>;
  recordAttempt(input: { evidenceKey: string; sourceTxHash: string; status: string; targetTxHash?: string }): Promise<void>;
}
~~~

- [ ] 3.1. Write worker tests for event discovery, proof-builder timeout, retry with bounded backoff, duplicate evidence, target transaction already broadcast, and permanent invalid-proof failure.
- [ ] 3.2. Run focused tests; expect missing-module failures.
- [ ] 3.3. Implement ProofProvider around the pinned @gluwa/usc-sdk/proof-builder API after reading its exact package signature; isolate SDK types in proof-client.ts.
- [ ] 3.4. Implement source-scanner using ethers provider getLogs for PactCreditSource.CreditGranted and derive evidenceKey from source chain key + source tx hash + evidenceId.
- [ ] 3.5. Implement state-store with durable cursor and unique evidenceKey; before retrying a timeout, query the target chain by stored targetTxHash and ASC processed query state.
- [ ] 3.6. Implement worker loop with one bounded retry policy, redacted errors, requestId/evidenceId/sourceTxHash/targetTxHash correlation, and no direct controller credit write.
- [ ] 3.7. Run worker tests and typecheck.

Run: yarn vitest run services/asc-proof-worker/test && yarn typecheck  
Expected: PASS.

- [ ] 3.8. Commit the worker adapter and tests.

### Task 4 — Add evidence read shape and proof observability

**Files:** Create services/asc-proof-worker/src/evidence-record.ts, packages/domain/src/evidence.ts, packages/domain/test/evidence.test.ts, config/asc/evidence-fields.json. Modify architecture/pact.evidence.aicd.yaml and architecture/pact.contracts.aicd.yaml.

**Stable evidence record:**

~~~typescript
type CreditEvidenceRecord = {
  evidenceId: string;
  sourceChainKey: number;
  sourceTxHash: string;
  sourceContract: string;
  beneficiary: string;
  creditAmountBaseUnits: string;
  expiresAt: string;
  proofAttemptCount: number;
  proofTxHash?: string;
  targetBlock?: number;
  status: "discovered" | "proving" | "verified" | "rejected" | "failed";
  lastErrorCategory?: string;
};
~~~

- [ ] 4.1. Write tests for redacted records, state transitions, duplicate source transaction, and proof success/failure classification.
- [ ] 4.2. Implement the record mapper; never persist raw proof blobs or private keys in the read shape.
- [ ] 4.3. Update AICD evidence links so SC-ASC-001 and SC-ASC-002 point to source event, proof worker, ASC, controller, and target evidence.
- [ ] 4.4. Run yarn vitest run packages/domain/test/evidence.test.ts services/asc-proof-worker/test and yarn validate:aicd.
- [ ] 4.5. Commit evidence types and AICD links separately from worker execution code.

### Task 5 — Rehearse a live proof lane or create a bounded blocker

**Files:** Create scripts/asc/rehearse-credit-evidence.mjs, config/deployments/asc-evidence-rehearsal.json, docs/runbook/asc-evidence-rehearsal.md.

**Interfaces:** The rehearsal accepts only environment-provided source/target RPCs and disposable keys, emits one source event, builds one proof, submits one ASC.execute transaction, waits for confirmations, and writes a redacted evidence manifest.

- [ ] 5.1. Add a chain guard that rejects mainnet chain IDs and any target chain not matching config/networks/advance-testnet.json.
- [ ] 5.2. Run the rehearsal in dry-run mode to print required env names without calling a provider.
- [ ] 5.3. When the live lane is explicitly approved, run source recordCredit, wait for finality, build proof through the worker adapter, submit ASC.execute, wait for CreditVerified/CardCreditUpdated, and verify controller.verifiedCredit(cardId).
- [ ] 5.4. Write a redacted manifest with source tx hash, target proof tx hash, chain keys, block heights, evidence ID, beneficiary, amount, expiry, contract addresses, and confirmations.
- [ ] 5.5. If the proof builder/source/target is unavailable, write a blocker artifact with exact error, safe next action, and no fake verified credit. Keep local gates green.
- [ ] 5.6. Commit only the runbook/manifest template and report the live result in the phase report.

## Acceptance Criteria

- AC-04: valid source CreditGranted event is proven through ASC and updates verified credit.
- AC-05: unregistered emitter, failed receipt, unsupported action, and replay cannot update credit.
- AC-17: ASC components/flows/evidence are represented in AICD.
- Security invariants 5 and 8: only ASC applies verified credit; evidence/query replay is rejected.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| ASC package signature/compiler differs from example | High | pin version, read exact source, compile before implementation, isolate adapter |
| Proof builder times out after target tx broadcast | High | durable targetTxHash, query/reconcile before retry, evidenceKey uniqueness |
| Fake emitter produces matching event | Critical | compare log.address_ to registered source contract |
| Same event is accepted through two proofs | Critical | ASCBase query dedupe plus evidenceId dedupe |
| Source event has failed receipt or malformed topics | High | receipt status/signature/topic/data checks before controller call |
| Live proof unavailable | Medium | bounded blocker and pre-recorded verified evidence only labeled as recorded evidence, never fake new state |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| wrong source emitter | ASC reverts, credit unchanged | automated |
| failed source receipt | ASC reverts | automated |
| unsupported action | ASC reverts | automated |
| same query twice | ASCBase replay rejection | automated |
| same evidence ID in new query | application replay rejection | automated |
| proof builder timeout before broadcast | retry with same evidenceKey | automated |
| timeout after broadcast | reconcile target tx before retry | automated |
| valid source event | verified credit event and controller state | hybrid |
| source/target RPC unavailable | bounded failed status, no direct credit | hybrid |

## Security Review

Spoofing is addressed by source-chain key and emitter binding; tampering by ASC proof verification and decoded event checks; repudiation by evidence/tx correlation; disclosure by redacted evidence records; denial of service by bounded retries and cursor progress; and elevation by keeping proof-worker authority separate from controller policy and pool settlement.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| source contract | forge test --root contracts --match-path test/PactCreditSource.t.sol | automated | Forge output |
| ASC harness | forge test --root contracts --match-path test/PactCreditASC.t.sol | automated | harness output |
| worker | yarn vitest run services/asc-proof-worker/test | automated | Vitest output |
| AICD | yarn validate:aicd | automated | validator JSON |
| live proof | yarn asc:rehearse with approved disposable env | hybrid | redacted manifest |
| evidence provenance | inspect source/target tx links and controller readback | agent-probe | review note |

## Touchpoints

- contracts/src/PactCreditSource.sol and PactCreditASC.sol
- contracts/test/*ASC*.t.sol and PactCreditSource.t.sol
- services/asc-proof-worker/src and test
- packages/domain/src/evidence.ts and config/asc
- scripts/asc, docs/runbook/asc-evidence-rehearsal.md, AICD evidence/contracts files

## Public Contracts

- PactCreditSource.CreditGranted event fields are fixed.
- PactCreditASC action 0 is the only supported action in the MVP.
- ASCBase.execute arguments and controller.applyVerifiedCreditForAgent are fixed downstream contracts.
- Proof worker is a relayer interface, not an authority interface.

## Blast Radius

This phase modifies ASC/source contracts, proof-worker code, evidence types, AICD links, and proof runbook. It does not change pay policy, pool settlement, AI provider logic, browser UI, or production data.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| valid source emitter test | Automated | AC-04 |
| invalid emitter/receipt/action test | Automated | AC-05 |
| query/evidence replay tests | Automated | AC-05 |
| proof-worker idempotency tests | Automated | evidence flow safety |
| real source-to-ASC proof | Hybrid | AC-04 |
| evidence manifest/readback review | Agent-Probe | AC-04, AC-17 |

## Test Procedure

Read process/context/all-context.md and process/context/tests/contract-tests.md. Run:
forge fmt --check
forge test --root contracts --match-path test/PactCreditSource.t.sol
forge test --root contracts --match-path test/PactCreditASC.t.sol
yarn vitest run services/asc-proof-worker/test packages/domain/test/evidence.test.ts
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check

## Data Verification

- Valid evidence has sourceTxHash, sourceContract, chain key, evidenceId, proofTxHash, target block, beneficiary, amount, expiry.
- Invalid/replayed evidence creates no controller CreditVerified event and does not change verifiedCredit.
- The worker state has one evidenceKey per source event and can reconcile a broadcast timeout.
- No raw proof blob or secret is stored in the evidence read shape.

## Manual Test

Open the redacted evidence manifest, source explorer transaction, target explorer proof transaction, ASC event, and controller card readback. Confirm the beneficiary matches the agent wallet and the amount is capped by ownerConfiguredCap.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All five tasks are complete; local source/ASC/worker gates pass; live proof manifest is recorded or blocker artifact is honest; Phase 02 regression passes; AICD links are current; user confirms before ✅ VERIFIED.

## Test Infra Improvement Notes

This phase adds a local precompile-backed ASC harness and the first hybrid cross-chain gate. The proof-worker adapter is intentionally isolated from the live SDK so tests can use deterministic fixtures while the hybrid lane proves real source/target behavior.

## Exit Gate

~~~bash
forge fmt --check
forge test --root contracts --match-path test/PactCreditSource.t.sol
forge test --root contracts --match-path test/PactCreditASC.t.sol
yarn vitest run services/asc-proof-worker/test packages/domain/test/evidence.test.ts
yarn typecheck
yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- Pinned ASC package cannot compile with the contract toolchain.
- Native verifier or decoder addresses cannot be confirmed on Advance Testnet.
- Proof builder cannot produce the required payload and no safe retry/reconciliation path exists.
- A valid proof could update credit without registered source binding or evidence dedupe.
- Live lane is unavailable; the blocker cannot be converted into fake verified state.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; live proof submission is gated.
- On ✅ VERIFIED or constrained proof backlog, continue to phase-04-ai-gateway-executor_PLAN_08-09-26.md.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
