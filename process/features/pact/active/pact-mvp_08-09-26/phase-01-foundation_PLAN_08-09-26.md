---
name: plan:pact-mvp-phase-01-foundation
description: "Pact — Phase 01: foundation, domain contracts, configuration, and AICD"
date: 08-09-26
metadata:
  node_type: memory
  type: plan
  feature: pact
  phase: phase-01
---

# Phase 01 — Foundation, Domain Contracts & AICD

**Date**: 2026-09-08
**Status**: ⏳ PLANNED
**Complexity**: COMPLEX
**Program:** pact-mvp
**Umbrella plan:** process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
**Report destination:** process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_REPORT_08-09-26.md
**Primary execute anchor:** Tasks 1–4 in this plan, after PVL writes the Validate Contract.
**Supporting phase files:** phase-blast-radius-registry.md and the Phase 01 report destination above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Create the Pact monorepo foundation, stable cross-runtime domain contracts, fail-closed Advance Testnet configuration, AICD source, and the test-context router used by every later phase.

**Architecture:** No payment authority or live deployment is created here. This phase defines shared vocabulary and validators so Solidity, Supabase, Cloudflare, and the browser cannot quietly disagree about intent, network, evidence, or authority.

**Tech Stack:** Node 20, Yarn workspaces, TypeScript, Zod, ethers v6, Vitest, ESLint, Foundry, YAML, JSON Schema-style validation.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Plan Supplement — 2026-09-09

This supplement records the V2 validation findings and is required before Phase 01
can re-enter PVL. It changes plan sequencing and public contracts only; it does not
authorize live testnet calls, provider spend, deployment, or payment execution.

### Pre-PVL harness and test-context bootstrap

The repository is greenfield, so the first PVL attempt exposed a circular dependency:
Task 4 creates the context/test routers, while `vc-test-coverage-plan` must load those
routers and discover real blast-radius tests before it may assign tiers. Resolve this
explicitly before re-running PVL:

1. Run the user-approved Vibecode harness setup for this repository and verify the
   installed agent/skill routing. Do not silently reorganize existing project files.
2. Ensure the standard process routing directories exist (`process/general-plans/`
   and its active/completed/backlog paths, plus the feature context paths) without
   moving the approved Pact task folder.
3. Populate `process/context/all-context.md` and the complete
   `process/context/tests/` routing chain from the actual repository scan, including
   the deeper container, browser-automation, and live-E2E routes.
4. Discover the real test files and runners in the Phase 01 blast radius. If the
   repository still has no test files, keep the phase `BLOCKED`; do not invent tier
   assignments or treat planned filenames as existing evidence. The first accepted
   execution increment must then begin with the red TDD tests named in this plan.
5. Re-run context discovery, plan discovery, and the full V1–V2 validation fan-out.
   Only a non-blocked V2 result may proceed to the Validate Contract and EXECUTE.

### Bootstrap result — 2026-09-09

- [x] Vibecode harness installed and Claude/Codex agent-skill parity validated.
- [x] Standard process directories and seed companions created without moving the
  approved Pact task folder.
- [x] `process/context/all-context.md` populated from the actual repository scan.
- [x] `process/context/tests/all-tests.md` and its contract, backend, browser,
  container, browser-automation, and live-E2E routing chain populated.
- [x] Context routing, concrete references, README catalog, seed integrity, and
  plan structure validators pass.
- [ ] Real Phase 01 source/test files discovered — none exist yet at this checkpoint.

Result: the context bootstrap prerequisite is satisfied, but the strict
`vc-test-coverage-plan` hard stop remains active because this greenfield
repository has no executable in-blast-radius test file to discover. PVL must not
invent tier assignments or advance to a Validate Contract until the first red
TDD tests are created by the approved Phase 01 execution path.

This is a process/tooling precondition, not a waiver of the Vibecode test-context
hard stop. The absence of a verified Advance identity remains an independent,
fail-closed hybrid gate.

### Contract and ownership decisions locked by this supplement

- `AgentIntent` and `CanonicalIntentInput` both carry `policyVersion`; the hash
  serialization is versioned and its field order/types are golden-vector tested.
- `asset` remains the logical ID `native-testnet-ctc`, while one shared asset
  descriptor maps it to the native EVM representation (`address(0)`), symbol, and
  decimals. Merchant IDs, timestamps, amounts, and addresses have explicit
  cross-runtime conversion rules before Solidity/API work begins.
- `config/networks/advance-testnet.json` is the canonical network-readiness input.
  Phase 07 deployment manifests are output artifacts and must use an adapter or
  consistency check; they do not become a second source of truth.
- Phase 01 owns `scripts/preflight-testnet.mjs`, shared context routers, and the
  AICD validator. Later phases extend these only through a plan supplement and
  additive stable-ID/route changes; they do not rename or overwrite them.
- AICD validation includes strict recursive secret-boundary checks, critical-policy
  to invariant/scenario links, UI-success to receipt/evidence links, real-data-path
  to evidence links, stable scenario registry checks, and deterministic diagram
  drift checks.
- High-risk evidence is a required handoff: `harness/risk-gate.json`,
  `harness/context-snippets.json`, `harness/verification.json`,
  `harness/review-decision.json`, and `harness/adversarial-validation.json` must
  exist before finalization/push, with live-provider probes explicitly marked when
  they were not run.

### Innovate decision record

- Chosen: one pinned workspace with a pure domain package, versioned canonical hash,
  injected network preflight, strict machine-readable AICD, and explicit evidence
  artifacts. This keeps policy/authority decisions testable without requiring live
  payment execution in Phase 01.
- Rejected: accepting a static `verified: true` flag; letting AI/model output carry
  recipients or asset addresses; maintaining separate flat/nested network schemas;
  making AICD a prose-only diagram; and using mock green results for unavailable
  Advance/ASC identity.

## Global Constraints

- The approved Pact design is the product and architecture authority.
- No private key, API key, secret, PAN, CVV, or real customer data enters the repository.
- Advance Testnet values are invalid until RPC URL, chain ID, native symbol, explorer URL, ASC verifier, and decoder library are concrete and cross-checked.
- AgentIntent contains no raw payout address, calldata, private key, or financial authority.
- AgentIntent exposes `policyVersion`, and every hash consumer uses the same
  `CanonicalIntentInput` and versioned serialization.
- The logical native asset ID is `native-testnet-ctc`; its EVM address, symbol, and
  decimals come only from the shared asset descriptor, never from model output.
- AICD IDs and scenario IDs are stable after creation.
- Keep the root commands below stable for all later phases.
- Pin the package manager and high-risk parser/crypto/test dependencies; do not rely
  on an ambient Yarn, compiler, or formatter version.
- `.env`, credential files, private-key files, and generated evidence containing
  secrets are ignored before any secret-shaped fixture is introduced.
- Run automated, hybrid, and agent-probe evidence; do not replace a failed hybrid gate with a mock green result.

---

## Overview

Pact starts with the approved design document and no application harness. This phase creates only the reusable foundation: root commands, pure domain schemas, canonical intent hashing, network/provider config, AICD definitions, a validator, a secret scanner, and process/test routing.

## Entry Gate

- Before PVL, complete the Pre-PVL harness and test-context bootstrap in the Plan
  Supplement. `process/context/all-context.md`, the complete
  `process/context/tests/` routing chain, and discovered Phase 01 test files are
  mandatory inputs to `vc-test-coverage-plan`.
- During execution, re-read process/context/all-context.md and
  process/context/tests/all-tests.md before each gate; the routers are not optional
  just because this phase creates them.
- Confirm docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md is unchanged.
- Confirm no unrelated changes exist under the paths in the Blast Radius section.
- Treat an unknown Advance Testnet identity as a fail-closed preflight blocker, never as permission to guess.

## Phase Loop Progress

- [ ] 1. RESEARCH — inspect the approved design, kit protocol, repository drift, and available test context
- [ ] 2. INNOVATE — choose pure shared schemas plus machine-readable AICD; record rejected alternatives
- [ ] 3. PLAN-SUPPLEMENT — add discovered preconditions or record n/a — research clean
- [ ] 4. PVL — vc-validate-agent writes the V1–V7 Validate Contract with exact gates
- [ ] 5. EXECUTE — complete Tasks 1–4 and run each section gate immediately
- [ ] 6. EVL — independently rerun gates, review AICD coverage, and record regression evidence
- [ ] 7. UPDATE PROCESS — write the phase report, update the umbrella, and commit process/execution separately

**Validate-contract required before execute.** The placeholder Validate Contract is a blocker.

---

## Implementation Checklist

### Task 1 — Bootstrap root tooling

**Files:** Create package.json, yarn.lock, tsconfig.json, vitest.config.ts, eslint.config.js, .env.example, .gitignore, contracts/foundry.toml, packages/domain/package.json, packages/domain/src/bootstrap.ts, packages/domain/test/root-smoke.test.ts.

**Produces:** Stable commands: yarn typecheck, yarn lint, yarn test, yarn test:contracts, yarn validate:aicd, yarn test:db, yarn test:e2e, yarn dev:web, yarn dev:edge, yarn preflight:testnet.

- [ ] 1.1. Write root-smoke.test.ts importing `@pact/domain/bootstrap` and assert the foundation marker is true; verify it fails because the module does not exist yet.
- [ ] 1.2. Add `packages/domain/package.json` with name `@pact/domain`, ESM exports, and a `./bootstrap` export. Add the smallest pure `packages/domain/src/bootstrap.ts` implementation only after the red smoke test exists.
- [ ] 1.3. Add package.json with workspaces apps/*, packages/*, services/*, Node >=20, `packageManager: yarn@1.22.22`, and exact dependency pins for Zod, ethers v6, YAML, AJV, TypeScript, Vitest, ESLint, Node types, `@gluwa/asc-contracts@0.2.1`, `@gluwa/usc-sdk@0.18.0`, and `@openzeppelin/contracts@5.4.0`. Include these scripts:

~~~json
{
  "type": "module",
  "private": true,
  "packageManager": "yarn@1.22.22",
  "engines": { "node": ">=20" },
  "workspaces": ["apps/*", "packages/*", "services/*"],
  "dependencies": {
    "@gluwa/asc-contracts": "0.2.1",
    "@gluwa/usc-sdk": "0.18.0",
    "@openzeppelin/contracts": "5.4.0",
    "ajv": "8.17.1",
    "ethers": "6.17.0",
    "yaml": "2.8.1",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@eslint/js": "9.33.0",
    "@types/node": "24.2.0",
    "eslint": "9.33.0",
    "typescript": "5.9.2",
    "typescript-eslint": "8.39.0",
    "vitest": "3.2.4"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:contracts": "forge test --root contracts",
    "validate:aicd": "node scripts/validate-aicd.mjs",
    "test:db": "supabase db reset --local",
    "test:e2e": "playwright test",
    "dev:web": "yarn workspace @pact/web dev",
    "build:web": "yarn workspace @pact/web build",
    "dev:edge": "wrangler dev --config apps/edge/wrangler.toml",
    "preflight:testnet": "node scripts/preflight-testnet.mjs"
  }
}
~~~

- [ ] 1.4. Add `.gitignore` rules for `.env`, `.env.*` except `.env.example`, credential/key files, local reports, and generated secret-bearing evidence; keep `.worktrees/` ignored.
- [ ] 1.5. Add strict TypeScript with target ES2022, module ESNext, bundler resolution, noEmit, and Vitest globals. Keep root typecheck scoped to currently existing Node packages; document Deno and Worker-specific checks in the test router until their owning phases create them.
- [ ] 1.6. Add Foundry config with the ASC reference toolchain (`solc_version = 0.8.30`, optimizer enabled, `via_ir = true`, `libs = ["node_modules"]`, src/test/script/out directories), and pinned OpenZeppelin/ASC remappings. Record any incompatibility with the approved 0.8.28-compatible interface as a feasibility finding rather than silently changing the design.
- [ ] 1.7. Generate `yarn.lock` through the pinned Yarn version and record the exact resolved dependency graph.
- [ ] 1.8. Run the root smoke test and typecheck.

Run: corepack prepare yarn@1.22.22 --activate && yarn install && yarn vitest run packages/domain/test/root-smoke.test.ts && yarn typecheck
Expected: PASS and exit 0.

- [ ] 1.9. Commit: git add package.json yarn.lock tsconfig.json vitest.config.ts eslint.config.js .env.example .gitignore contracts/foundry.toml packages/domain packages/domain/test/root-smoke.test.ts; git commit -m "chore: bootstrap Pact monorepo".

### Task 2 — Define shared domain contracts

**Files:** Create packages/domain/src/types.ts, schemas.ts, errors.ts, canonical-hash.ts, index.ts, packages/domain/test/schemas.test.ts, canonical-hash.test.ts, config.test.ts, canonical-hash-vectors.json, config/networks/advance-testnet.json, config/ai/openai.json.

**Interfaces:**

- AgentIntentSchema.parse(input): AgentIntent
- `canonicalIntentHash(input: CanonicalIntentInput): string`
- `merchantIdToBytes32(merchantId: string): string`
- loadAdvanceTestnetConfig(path): AdvanceTestnetConfig
- `assertDeploymentReady(config, observation): void`
- DomainError(code, message, details)

- [ ] 2.1. Write failing tests for a valid intent, malformed/unknown merchant ID, catalog lookup rejection for an unregistered merchant, zero amount, wrong logical asset, invalid confidence/time, zero agent address, raw recipientAddress, nested secret-bearing fields, and non-OpenAI provider/model.
- [ ] 2.2. Write failing hash tests and golden vectors proving property order is irrelevant, canonical timestamps/amounts are stable, and policyVersion, amount, card, merchant, asset, purpose, or expiry changes alter the hash.
- [ ] 2.3. Write failing config tests for missing/invalid chain ID, non-HTTPS RPC/explorer, empty native asset descriptor, zero verifier, missing decoder, unverified flag, unsafe chain ID, and an observation mismatch.
- [ ] 2.4. Run failures.

Run: yarn vitest run packages/domain/test/schemas.test.ts packages/domain/test/canonical-hash.test.ts  
Expected: FAIL because exports do not exist.

- [ ] 2.5. Implement these stable fields and conversion contracts:

~~~typescript
type AgentIntent = {
  intentId: string; agentId: string; cardId: string; merchantId: string;
  amountBaseUnits: string; asset: "native-testnet-ctc"; purpose: string;
  confidence: number; provider: "openai"; model: string;
  createdAt: string; expiresAt: string; policyVersion: number; intentHash: string;
};

type CanonicalIntentInput = Pick<AgentIntent,
  "cardId" | "agentId" | "merchantId" | "amountBaseUnits" |
  "asset" | "purpose" | "expiresAt" | "policyVersion"
>;

type NativeAssetDescriptor = {
  id: "native-testnet-ctc"; evmAddress: string; symbol: string; decimals: number;
};

type AdvanceTestnetConfig = {
  protocol: "creditcoin-evm"; label: "advance-testnet"; rpcUrl: string;
  chainId: number; explorerUrl: string; nativeAsset: NativeAssetDescriptor;
  asc: { verifierPrecompile: string; evmV1DecoderLibrary: string };
  verified: boolean;
};

type NetworkObservation = {
  rpcChainId: number; verifierHasBytecode: boolean;
  decoderHasBytecode: boolean;
};
~~~

- [ ] 2.6. Enforce strict recursive schemas: positive canonical decimal base units (no sign, point, exponent, whitespace, or leading zero; safe `uint256` bounds), decimal card IDs, normalized non-zero EVM agent addresses, kebab-case merchant IDs, purpose <=160 chars, canonical UTC RFC3339 timestamps, expiry after creation, `policyVersion` as a safe `uint32`, provider exactly `openai`, model exactly `gpt-5.6-luna`, and rejection—not stripping—of unknown keys and deny-list keys (`recipient`, `recipientAddress`, `calldata`, `privateKey`, `apiKey`, `secret`, `token`).
- [ ] 2.7. Define one canonical serialization with fixed field order and types. Hash only cardId, agentId, merchantId, amountBaseUnits, asset, purpose, expiresAt, and policyVersion with ethers `keccak256`; normalize addresses, timestamps, and merchant strings before hashing. Map merchant strings to Solidity `bytes32` via the exported `merchantIdToBytes32` helper and consume shared golden vectors.
- [ ] 2.8. Separate static config parsing from runtime readiness. `loadAdvanceTestnetConfig` validates the strict nested schema and absolute HTTPS URLs; `assertDeploymentReady(config, observation)` is the only path that can accept `verified === true`, matching chain identity, non-zero addresses, and non-empty verifier/decoder bytecode. Any empty, unsafe, unverified, malformed, or mismatched value throws `NETWORK_CONFIG_INVALID` with redacted details.
- [ ] 2.9. Set config/ai/openai.json to provider openai, model gpt-5.6-luna, region us-east-1, allowFallback false, and add a strict loader/test so runtime env cannot substitute a provider or model silently.
- [ ] 2.10. Run TypeScript hash-vector checks against the exact Solidity ABI encoding contract planned for Phase 02; record any compiler/encoding mismatch as a blocker, not a changed vector.
- [ ] 2.11. Run tests and typecheck.

Run: yarn vitest run packages/domain/test/schemas.test.ts packages/domain/test/canonical-hash.test.ts packages/domain/test/config.test.ts && yarn typecheck
Expected: PASS.

- [ ] 2.12. Commit: git add packages/domain config; git commit -m "feat: define Pact domain contracts".

### Task 3 — Materialize AICD and its validator

**Files:** Create architecture/pact.system.aicd.yaml, pact.contracts.aicd.yaml, pact.policies.aicd.yaml, pact.trust-boundaries.aicd.yaml, pact.ui.aicd.yaml, pact.deployment.aicd.yaml, pact.evidence.aicd.yaml, architecture/aicd.schema.json, architecture/scenario-registry.json, architecture/generated/pact-architecture.mmd, packages/domain/test/aicd-fixture.test.ts, scripts/validate-aicd.mjs.

**Interfaces:** AICD nodes require id, type, authority, cannot, interfaces, deployment, evidence. Flows reference declared components. Evidence references approved SC-* IDs. The Mermaid diagram is generated from AICD. The seven fragments are loaded in deterministic lexical order into one strict merged document; duplicate IDs and conflicting declarations fail.

- [ ] 3.1. Write the fixture test first; assert unique IDs, valid references, required authority/cannot/deployment/evidence, critical-policy → invariant/scenario links, UI-success → receipt/evidence links, real-data paths → evidence links, recursive secret-boundary rules, scenario-registry membership, and generated component parity.
- [ ] 3.2. Run it and observe missing-file failure.

Run: yarn vitest run packages/domain/test/aicd-fixture.test.ts  
Expected: FAIL before AICD files exist.

- [ ] 3.3. Define components for web, Cloudflare edge, regional AI gateway, agent executor, ASC proof worker, source contract, ASC, controller, pool, merchant simulator, and indexer.
- [ ] 3.4. Define policies active-card, assigned-agent, merchant-allowlist, matching-asset, effective-credit, deadline, unused-nonce, receipt-required, and AI-not-authority.
- [ ] 3.5. Define flows card setup, credit evidence, allowed payment, rejected payment, provider failure, and indexed receipt.
- [ ] 3.6. Mark Advance Testnet deployments as requiring verified runtime config; include SC-NETWORK-001 through SC-AICD-001 links.
- [ ] 3.7. Implement validate-aicd.mjs with pinned YAML and JSON Schema dependencies. It must parse/merge all seven YAML files deterministically, reject duplicate/orphan IDs and unknown keys, require authority/cannot/deployment/evidence, enforce the three authority/evidence linkage rules, reject secret-bearing browser/edge components recursively, require every SC-* ID to exist in architecture/scenario-registry.json, and compare generated Mermaid component IDs plus a normalized content hash against the checked-in diagram.
- [ ] 3.8. Generate pact-architecture.mmd from the same deterministic merged AICD source; fail when the checked-in artifact is stale.
- [ ] 3.9. Run fixture, validator, and typecheck.

Run: yarn vitest run packages/domain/test/aicd-fixture.test.ts && yarn validate:aicd && yarn typecheck  
Expected: PASS with no orphan references.

- [ ] 3.10. Commit: git add architecture packages/domain/test/aicd-fixture.test.ts scripts/validate-aicd.mjs; git commit -m "feat: add Pact AICD architecture source".

### Task 4 — Add test context, network preflight, and secret scan

**Files:** Create process/context/all-context.md, process/context/tests/all-tests.md, process/context/tests/contract-tests.md, process/context/tests/backend-tests.md, process/context/tests/browser-tests.md, process/context/tests/container-e2e.md, process/context/tests/browser-automation.md, process/context/tests/live-e2e.md, process/development-protocols/pact-mvp-gates.md, scripts/preflight-testnet.mjs, scripts/check-no-secrets.mjs, packages/domain/test/preflight.test.ts, scripts/print-config.mjs, harness/risk-gate.json, harness/context-snippets.json, harness/verification.json, harness/review-decision.json, harness/adversarial-validation.json.

**Interfaces:**

- node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json exits 0 only if verified is true, RPC chain ID matches, and verifier/decoder bytecode exists.
- node scripts/check-no-secrets.mjs exits non-zero for private keys, OpenAI keys, JWT-like tokens, or populated secret variables.
- Context files route later agents to the design, current plan, protocol, and exact automated/hybrid/agent-probe commands. `all-tests.md` must link every deeper test document and identify runner, command, precondition, evidence, and what the command does not prove.

- [ ] 4.1. Write failing preflight tests for every missing value, chain mismatch, malformed JSON-RPC, timeout, RPC error, empty verifier/decoder bytecode, attempted static `verified: true`, redaction case, and one concrete valid observation fixture.
- [ ] 4.2. Implement preflight with `eth_chainId` and `eth_getCode` calls, bounded timeout, malformed/error handling, canonical chain comparison, non-empty bytecode checks, and redacted JSON output. Fixture transport tests are automated; the actual Advance identity remains hybrid.
- [ ] 4.3. Implement secret scan patterns for private keys, OpenAI key prefixes, JWT-like strings, populated secret assignments, and forbidden secret field names; scan recursively and fail on non-example credential files.
- [ ] 4.4. Write all-context.md and the complete all-tests.md routing chain under `process/context/tests/`; include the actual repository inventory, exact commands, runner availability, required preconditions, evidence locations, and explicit blocked states. Run context discovery/audit after authoring.
- [ ] 4.5. Populate the high-risk evidence pack with redacted gate inputs, context snippets, verification results, reviewer decision, and adversarial-validation status. Missing live-provider evidence must be marked `not-run` with its required safe next action.
- [ ] 4.6. Run the foundation gate.

Run: yarn typecheck && yarn lint && yarn test && yarn validate:aicd && node scripts/check-no-secrets.mjs  
Expected: PASS; preflight fails closed with NETWORK_CONFIG_INVALID while verified values are absent.

- [ ] 4.7. Commit process separately: git add process harness scripts architecture; git commit -m "docs: add Pact context and gate routing".
- [ ] 4.8. Commit remaining foundation changes: git add package.json yarn.lock tsconfig.json vitest.config.ts eslint.config.js .gitignore config packages; git commit -m "chore: finalize Pact foundation".

## Acceptance Criteria

- AC-01: incomplete/wrong-chain config is rejected before card/payment work.
- AC-06/07/08: intent schema is strict, provider/model-attributed, and fail-closed.
- AC-17: AICD has complete IDs, authority/cannot/deployment/evidence links and generated parity.

## Risk Predictions

| Risk | Severity | Mitigation |
|---|---|---|
| Advance label has no verified RPC identity | High | Require concrete chain ID and bytecode preflight; keep verified false |
| Runtime schemas drift | High | One pure domain package and shared fixture corpus |
| AICD becomes documentation only | High | Validator fails on missing authority, forbidden boundary, deployment, evidence, or diagram parity |
| Secret enters repository | Critical | scanner plus later CI gate |

## Scenario / Edge-Case Pack

| Scenario | Expected behavior | Strategy |
|---|---|---|
| zero amount or unknown merchant | schema/catalog rejection before provider/chain | automated |
| recipientAddress or nested secret in model output | strict rejection and redacted error | automated |
| malformed JSON-RPC, timeout, or RPC error | non-zero preflight with redacted diagnostic | automated fixture |
| RPC chain mismatch | non-zero preflight | hybrid/live identity |
| verifier or decoder has no bytecode | non-zero preflight | hybrid/live identity |
| undeclared AICD reference or stale Mermaid | non-zero validator | automated |
| critical policy lacks invariant/scenario/evidence linkage | non-zero validator | automated |
| missing context router or undiscovered test files | phase cannot advance | agent-probe |

## Security Review

STRIDE checks cover identity fields, config tampering, audit correlation IDs, secret disclosure, future edge rate limits, and privilege boundaries. This phase reserves requestId, intentId, cardId, evidenceId, nonce, txHash, and chainId without granting any of them authority.

## Test Tier Matrix

| Gate | Exact procedure | Strategy | Evidence |
|---|---|---|---|
| domain tests | yarn vitest run packages/domain/test | automated | test output |
| type/lint | yarn typecheck; yarn lint | automated | command log |
| AICD | yarn validate:aicd | automated | validator JSON |
| secret scan | node scripts/check-no-secrets.mjs | automated | clean report |
| preflight parser/fixture failures | yarn vitest run packages/domain/test/preflight.test.ts | automated | mutation/fixture output |
| network identity | node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json | hybrid | redacted live preflight or bounded blocker |
| routing usability | fresh executor follows all-tests.md through deeper test docs and locates gates | agent-probe | review note |
| high-risk evidence pack | inspect five harness JSON artifacts for redaction, status, and reviewer decision | agent-probe | pack review |

## Touchpoints

- package.json, yarn.lock, tsconfig.json, vitest.config.ts, eslint.config.js, .env.example, .gitignore, contracts/foundry.toml
- packages/domain and config
- architecture and scripts
- process/context/tests and process/development-protocols/pact-mvp-gates.md
- harness high-risk evidence pack

## Public Contracts

- AgentIntent, AdvanceTestnetConfig, root commands, AICD IDs, and SC-* IDs are stable.
- No payment endpoint, card mutation, or secret-bearing runtime exists after this phase.

## Blast Radius

Only new foundation/process/harness files are changed. No payment contract, database,
Supabase secret, Cloudflare route, browser page, or testnet state is changed. Later
phases consume the canonical network/domain/AICD outputs and may extend them only
through an explicit plan supplement.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| schema/hash/config tests | Automated | AC-01, AC-06, AC-07, AC-08 |
| AICD fixture and validator | Automated | AC-17 |
| no-secret scan | Automated | security invariants |
| RPC identity preflight | Hybrid | network constraint |
| preflight malformed/error fixtures | Automated | fail-closed network handling |
| context routing review | Agent-Probe | process constraint |
| high-risk evidence pack review | Agent-Probe | security handoff |

## Test Procedure

Read process/context/all-context.md and process/context/tests/all-tests.md, then run:
yarn vitest run packages/domain/test
yarn typecheck
yarn lint
yarn validate:aicd
node scripts/check-no-secrets.mjs
node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
git diff --check

## Data Verification

- No secret-shaped value appears in config or test fixtures.
- AICD declared component count equals generated diagram component count.
- Every AICD evidence ID exists in the approved spec.
- Config verified false is never treated as runtime-ready.
- The deployment manifest contract consumes the Phase 01 network config through an
  explicit parity check and does not silently introduce a second source of truth.
- Every high-risk evidence artifact is redacted, status-labelled, and linked to a
  concrete gate or an explicit not-run blocker.

## Manual Test

A fresh executor can locate the approved spec, active plan, context router, test commands, and AICD source without prior Pact knowledge. Config errors name the missing field without printing its value.

## Phase Completion Rules

User Confirmation: required before promoting this phase to ✅ VERIFIED.

All Task 1–4 boxes are checked; automated gates pass; hybrid preflight is green or has a bounded blocker report; agent-probe evidence is recorded; process and execution commits are separate; user confirms the phase before ✅ VERIFIED.

## Test Infra Improvement Notes

The harness/test chain is a pre-PVL input and an execution output. Until the bootstrap
has populated it and real test files are discoverable, later commands such as `yarn test`
and `yarn validate:aicd` remain planned gates, not claims about an existing
implementation; PVL must stay blocked rather than infer them.

## Exit Gate

~~~bash
yarn typecheck
yarn lint
yarn test
yarn validate:aicd
node scripts/check-no-secrets.mjs
node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
git diff --check
~~~

## Blockers That Would Justify BLOCKED Status

- authoritative Advance Testnet RPC or chain identity cannot be resolved;
- RPC chain ID and configured chain ID disagree;
- ASC verifier or decoder bytecode cannot be located;
- AICD completeness requires an unapproved product change;
- PVL cannot write a contract because required context or gate scripts are missing.

## Resume and Execution Handoff

- Selected plan: process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md
- Last completed step: not started
- Validate-contract status: pending
- Next Step: RESEARCH, then PVL; no live deployment is allowed in this phase.
- On verification, continue to phase-02-payment-contracts_PLAN_08-09-26.md.

## Validate Contract

Status: CONDITIONAL
Date: 2026-09-09
date: 2026-09-09
generated-by: inner-pvl: phase-1

PVL scope: V1 pre-check + V2 two-layer fan-out rerun on 2026-09-09 against
real files and real command output on branch `main` @ `168c493` (clean
worktree). The requested `feat/pact-mvp @ 6131789` does not exist locally or
on origin (`origin/feat/pact-mvp` is `23e1b81`); the user directed execution
to stay on `main`. No OpenAI calls, RPC calls, testnet mutations, or secret
writes were made in this PVL pass.

V1 evidence (all real output, exit codes recorded in session report):
- Structural validation: `validate-plan-artifact.mjs` on this plan → exit 0,
  0 failures, 0 warnings.
- Context audit: `validate-context-discovery.mjs` → exit 0 (9 docs,
  239 concrete refs, 33 skills, 15+15 agents, 0 failures).
- Scout path check: all 22 implementation target paths MISSING (expected —
  this plan creates them); `process/context/all-context.md` and
  `process/context/tests/all-tests.md` EXIST.
- Baseline smoke: no baseline exists (`package.json` absent). `corepack yarn
  install --non-interactive --ignore-scripts` produced only an empty lockfile
  + empty `node_modules` (no manifest to resolve); both spurious artifacts
  were removed and the tree is clean again. `corepack yarn vitest run
  packages/domain/test` → exit 1 via yarn itself
  ("Couldn't find a package.json file"), Vitest never launched — this is a
  pre-RED state, NOT a genuine Vitest RED, and is not claimed as one.
- Spec + plan stability: both unchanged since `23e1b81` (single commit each).
- Phase-program check: no `## Pre-PVL Conflict Resolution` in the umbrella
  AND no `## Potential Blast Radius Conflicts` in any phase plan → HARD STOP
  condition not triggered. `phase-blast-radius-registry.md` covers ownership;
  the missing explicit umbrella note is CONCERN C2 below.
- Existing contract: placeholder only — no auto-proceed; this contract is new
  (no `supersedes:` field).
- Toolchain observed: node `v24.17.0` (doc said `v24.19.0` — drift, still
  satisfies `>=20`), corepack `0.35.0` (doc said `0.34.6`), `forge` and
  `wrangler` now AVAILABLE (doc said unavailable at scan), `supabase`/`deno`
  NOT AVAILABLE (only needed Phase 04/05). Ambient `yarn` exists — EXECUTE
  must use only `corepack yarn` (pinned `1.22.22`) and verify with
  `corepack yarn --version` as its first step.

Test gates (exact commands; currently 0 green — all become executable as
EXECUTE materializes files, in task order):

- `corepack yarn vitest run packages/domain/test` (domain: schemas, hash,
  config, preflight fixtures, AICD fixture)
- `corepack yarn typecheck` and `corepack yarn lint`
- `corepack yarn validate:aicd`
- `node scripts/check-no-secrets.mjs`
- `node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json` (hybrid — expected fail-closed `NETWORK_CONFIG_INVALID` while values unverified)
- `git diff --check`
- agent-probe: fresh-executor routing review of `all-tests.md` chain; review of the five `harness/*.json` evidence artifacts

Dimension findings:

- infra/setup-fit: CONCERN — all plan target paths absent but the plan creates them (documented creation, not drift); toolchain meets Phase 01 needs (Node+Yarn+forge present; supabase/deno not needed until Phase 04/05).
- test-coverage: CONCERN — zero executable test files exist, so tier assignments bind to planned files only. No PASS is claimed. The first EXECUTE increment MUST be the RED tests of Task 1.1 (then 2.4, 3.2, 4.1): RED → minimal GREEN → refactor → focused verification. Inventing tier PASS pre-RED is forbidden.
- breaking-changes: PASS with notes — greenfield, no downstream consumers yet. Public contracts declared stable (AgentIntent + `policyVersion`, `native-testnet-ctc` descriptor, root commands, AICD/SC-* IDs). Residual risk carried into execution: Task 2.10 Solidity ABI-encoding parity check; any mismatch is a BLOCKER, never a changed vector.
- security-surface: PASS with notes — no secrets in repo/tree; scanner (Task 4.3), fail-closed preflight (Task 4.2), and redacted high-risk pack (Task 4.5, live probes marked `not-run`) are planned work, not gaps. Phase 01 makes no live calls by plan constraint.

Layer-2 per-section answers (mechanical feasibility / gaps / conflicts / highest-risk edit):

- Task 1 (root tooling): feasible. Highest risk: registry resolution of pinned `@gluwa/asc-contracts@0.2.1` / `@gluwa/usc-sdk@0.18.0` / OpenZeppelin `5.4.0`; record exact resolution or a blocker. `solc 0.8.30` vs `0.8.28`-compatible interface: feasibility finding, not silent change.
- Task 2 (domain contracts): feasible pure-TS. Highest risk: canonical serialization field order/types and `merchantIdToBytes32` must be exact before Solidity/API work; golden vectors lock this.
- Task 3 (AICD + validator): feasible. Highest risk: validator strictness (recursive secret-boundary checks, three linkage rules, registry membership, deterministic diagram-drift hash).
- Task 4 (context, preflight, secret scan): feasible. Highest risk: preflight hybrid gate stays red until Advance identity is verified (expected fail-closed); evidence pack must mark non-run live probes honestly.
- No section depends on untested runtime behavior beyond the explicit hybrid gates → no feasibility probe emitted, no re-spawn needed.

Open gaps (CONCERNs, no FAILs):

- C1: zero executable tests; tiers bind to planned files; EXECUTE must start RED (Task 1.1). Acceptance: user approval of this contract. Known tension (cycle 2): the umbrella Next Step says "write its PVL Validate Contract only if the hard stop is cleared," while the supplement hard stop clears only when first RED tests exist — which require EXECUTE, which requires this contract. This CONDITIONAL contract is the deadlock breaker, not an evasion: it claims 0 green, invents no tiers, and binds the first increment to RED tests. A BLOCKED verdict would route to the same user decision one round-trip later. Approving this contract IS the hard-stop clearance for the RED-first increment only.
- C1-supplement (cycle 2): Phase 01 umbrella entry gate verified SATISFIED — approved design present and unchanged since `23e1b81`, baseline clean (only this plan file modified, no execution changes), no conflicting Pact changes. Phase 02 forward-dependency verified compatible — it assumes only `contracts/foundry.toml` + `packages/domain` (Phase 01 Tasks 1.6/1.2/2.x outputs) plus domain/AICD regression gates. Full test-context chain verified present (`contract/blocked` routes: `contract-tests.md`, `backend-tests.md`, `browser-tests.md`, `container-e2e.md`, `browser-automation.md`, `live-e2e.md` all exist).
- C2: umbrella lacks an explicit `## Pre-PVL Conflict Resolution` note. Proposed one-line supplement (needs approval, not yet applied): note under the umbrella Blast Radius section pointing to `phase-blast-radius-registry.md` as the conflict-resolution record with "no conflicts for Phase 01 scope."
- C3: Advance Testnet identity unverified (RPC/chainID/explorer/verifier/decoder). By-design fail-closed; plan handles via `verified: false` + preflight. Hybrid gate expected red through Phase 01.
- C4: toolchain doc drift (node/corepack versions; forge+wrangler newly available). Informational; EXECUTE re-verifies pinned Yarn first.

What This Coverage Does NOT Prove (required statement):

- No test has run green — every gate above is planned, none is evidence of working behavior.
- No Advance network identity, ASC integration, contract bytecode, deployment address, or model-access claim is proven.
- No secret scan has meaningful scope yet (no source files exist to scan).
- No dependency pin is proven installable until EXECUTE runs the real `yarn install` against the Task 1.3 manifest.
- No Solidity/hash parity is proven until Task 2.10 runs.
- Agent-probe tiers (routing usability, evidence-pack review) are deferred to Task 4 completion.

Hard stops carried into EXECUTE (verbatim for /goal block):

- Do not fake PASS, RED, dependency installation, RPC identity, or testnet evidence.
- No OpenAI API calls, RPC calls, Advance Testnet mutations, or secret writes in Phase 01.
- Config `verified: false` is never runtime-ready; preflight fail-closed stays.
- First increment must be RED tests (Task 1.1); no implementation before its red test exists.
- Stop on: unknown Advance identity, RPC chain mismatch, missing verifier/decoder bytecode, or any required AICD linkage failure.

Strategy for EXECUTE: sequential, single executor, Tasks 1→4 in order (each task's files are the next task's inputs; shared `packages/domain` surface forbids parallel writers). No fan-out.

Accepted by: user, 2026-09-09 — CONDITIONAL accepted with concerns C1–C4 (V5 exit gate, after 3 re-validation cycles). Advance to EXECUTE requires the user's explicit ENTER EXECUTE MODE with this plan path.

Re-validation cycle 1 (2026-09-09, user-selected Re-validate): V1 evidence
refreshed — structural validator exit 0 (0 failures, 0 warnings, 587 lines),
context audit exit 0 (0 failures), `git diff --check` exit 0, tree unchanged
except this contract, `package.json`/`packages/domain` still absent (expected
pre-EXECUTE state). BLOCKED-vs-CONDITIONAL stress test: the Plan Supplement
hard stop forbids inventing tiers and treating planned files as evidence —
neither occurs here (tiers are the plan's own matrix, 0 green claimed); the
absent-test-files state is the plan's correct entry precondition with RED-first
mandated (Tasks 1.1/2.4/3.2/4.1), not a plan defect, so test-coverage remains
CONCERN, not FAIL. No FAILs → no plan-agent supplement triggered. Verdict
CONFIRMED: CONDITIONAL, unchanged.

Re-validation cycle 2 (2026-09-09): umbrella Phase 01 entry gate verified
SATISFIED (design unchanged, baseline clean, no conflicting changes); Phase 02
forward-dependency verified compatible; umbrella-tension deadlock analysis
recorded in C1. Verdict CONFIRMED: CONDITIONAL, unchanged.

Re-validation cycle 3 = final allowed re-run (protocol cap: 3 re-runs, then
escalation). Deepened surfaces: planning context group (all-planning.md —
Rule 6 complied with, 0 green claimed), contract-tests.md (absence tracked as
bootstrap gap, corroborating the CONCERN-not-FAIL call), vc-validate-findings
skill conformance. New machine-checked artifact:
process/features/pact/active/pact-mvp_08-09-26/phase-01-pvl-v2-findings_09-09-26.md
— `validate-findings-output.mjs` exit 0, 0 failures, net gate CONDITIONAL.
Method note: fan-out executed inline by the orchestrator (no validate-agent
subagent type in this environment); Simple Mode per skill criteria. Verdict
CONFIRMED: CONDITIONAL, unchanged. Re-run budget exhausted — further
"re-validate" requests escalate per protocol; remaining options are Accept
with concerns or Request plan changes.
