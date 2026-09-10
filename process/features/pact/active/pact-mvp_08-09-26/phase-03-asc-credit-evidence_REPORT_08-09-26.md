---
phase: phase-03-asc-credit-evidence
date: 2026-09-10
status: VERIFIED_EVL_PASS
feature: pact
plan: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md
---

# Phase 03 — ASC Credit Evidence: Execution Report (Tasks 1–5B, EVL PASS)

**Branch:** `main` · **Contract:** CONDITIONAL accepted (C-P3a–C-P3d) · **Mode:** supervised EXECUTE.
Task 5B hybrid lane EXECUTED 2026-09-10 under explicit live-broadcast approval; EVL PASS read-only 2026-09-10.
Manifest: `config/deployments/asc-evidence-rehearsal.json` (schema-valid, single proof).
No push performed (closeout pending review).

## Toolchain (recorded)

- `forge/anvil/cast 1.7.1`, commit `4072e48705af9d93e3c0f6e29e93b5e9a40caed8`; solc 0.8.30;
  `evm_version=shanghai`; asc-contracts 0.2.1; usc-sdk 0.18.0; Node 24 + Yarn 1.22.22.

## Task RED → GREEN status

- **Task 1 DONE:** `PactCreditSource.t.sol` RED (missing source) → GREEN 7/7.
  Narrow owner-only emitter, unique evidence mapping, renounce-lock, no transfers.
- **Task 2 DONE:** `PactCreditASC.t.sol` RED (missing ASC) → GREEN 17/17
  (incl. registration edge tests added after GREEN: non-owner/zero/overwrite/
  second-evidence/renounce). Full `execute()` path against an etched fixture mock
  with the REAL inlined `EvmV1Decoder`: valid application, unsupported action,
  mock-false base revert, failed receipt, missing event, wrong emitter, topic/data
  shape, unknown beneficiary (controller `UnknownAgent` propagates), expired credit,
  evidence replay (`EvidenceAlreadyApplied` under a fresh query), query replay
  (base `Query already processed`). Harness suite 13/13 without any verifier.
- **Task 3 DONE:** registration one-time/zero/overwrite covered above; ASC-only hook
  proven (non-ASC caller reverts; `ascAuthority` zero blocks everything); no treasury
  path exists on either contract (no payable entry except `recordCredit` accounting —
  neither contract holds user funds; pool untouched).
- **Task 4 DONE:** worker suites RED (missing modules) → GREEN 18/18 across 4 files:
  1:1 `isLeft` mapping incl. transposed-field rejection, gas estimate +35% with
  size fallback, idempotency (duplicate skip, pre/post-broadcast timeout handling,
  bounded permanent failure, allowlist refusal, redacted diagnostics), 50-block
  chunking with halving, domain evidence records (strict parse, status machine,
  key derivation, classification without URL leaks). `tsconfig` now covers
  `services/*`; `vitest` include covers `services/*/test` (runner fix: explicit
  paths were filtered out before).
- **Task 5A DONE:** etched-mock tests (in Task 2 suites); `print-proof-input.mjs`
  dry-run (env names only, exit 2 when missing); manifest JSON Schema
  (`config/asc/evidence-manifest.schema.json`); chain allowlist config
  (`allowedSourceChainKeys`, default `[1]` unconfirmed). R-E readiness revision
  stays specified-not-applied (Phase 01 supplement required before hybrid use).
  AICD verified already-covering Task 4.3 — no edit made.

## Gate results (exact output, no fakes)

- `forge test --root contracts`: 11 suites, 101/101 pass (rerun post-format)
- `forge fmt --check`: clean (4 files formatted once; affected suites re-run after)
- `corepack yarn vitest run services/asc-proof-worker/test packages/domain/test`:
  10 files, 74/74 pass (56 domain + 18 worker/evidence)
- `corepack yarn typecheck` / `lint`: clean · `validate:aicd`: 0 failures
- secret scan: 900 files, 0 findings · `git diff --check`: clean
- Live gates: NONE run (5B gated). No RPC beyond prior local Anvil work in Phases
  01–02; zero testnet contact in this session.

## Proof and isLeft mapping evidence

`mapContinuityResponse` test pins the 8-position mapping
(action, chainKey, height, txBytes, root, siblings[{hash,isLeft}], digest, roots);
transposed `{hash,left}` fixtures are rejected by the strict parser. Sibling order
preserved end-to-end by equality assertion.

## Source-binding and query-dedupe evidence

Emitter mismatch → `UnregisteredSource`; unregistered ASC → same; evidence replay
under fresh query → `EvidenceAlreadyApplied`; identical resubmission → base
`Query already processed`. Controller credit moves only through the ASC path
(`availableCredit` 500 after valid proof, 0 before).

## Precompile/decoder readiness evidence

Verifier = `0xFD2` constant (pinned package); mock etched ONLY in `contracts/test/`
(`mocks/` + harness), never in `src/` or config. Decoder = zero external functions
(grep-verified), fully inlined; no address modeled; example `0x04B9…` absent from
all source/config (single mention inside the plan's explicit rejection).

## C-P3a–C-P3d disposition

- C-P3a closed: all planned local paths exist, each RED-first (hybrid paths stay absent by rule).
- C-P3b accepted as documented note (field labels vary cosmetically; substance 8/8).
- C-P3c stands: R-E application still pending — required before Task 5B, not before.
- C-P3d stands: Sepolia key value + U1–U5 unknowns route to the hybrid pack below.

## U1–U5 status

U1 UNKNOWN (neutralized locally); U2 paths documented, liveness unprobed; U3 assumed
18; U4 split (constants-or-N/A resolved; Sepolia key value UNKNOWN — candidates 1/2);
U5 N/A for precompile/decoder. Nothing inferred.

## Files and commits (local only)

- Commits: `bf2c7b0` source+ASC+harness, `f7ed081` registration tests + fmt,
  `440af26` worker adapter, `72f664c` evidence record + manifest schema.
- New: `contracts/src/PactCreditSource.sol`, `PactCreditASC.sol`,
  `contracts/test/{PactCreditSource,PactCreditASC,PactCreditASCHarness}.t.sol`,
  `contracts/test/{harness,mocks}/`, `services/asc-proof-worker/` (7 src + 3 test),
  `packages/domain/src/evidence.ts` + test, `config/asc/`, `scripts/asc/`.
- Modified: `tsconfig.json`, `vitest.config.ts`, `yarn.lock`,
  `services/asc-proof-worker/package.json` (declared deps), domain `src/index.ts`.
- Uncommitted (UPDATE PROCESS scope): this report; plan file (supplement +
  checkbox ticking on approval); research + PVL findings (verbatim).

## Plan deviations (in-blast-radius)

1. `setMerchantActive`-class addition: none needed (hook uses existing controller API).
2. ASC-local errors (`InvalidAction`, `InvalidProof`, `UnregisteredSource`) instead of
   extending the shared union (official-example pattern; shared codes reused where exact).
3. `discovered→verified` direct transition allowed (atomic prove-and-apply path).
4. Vitest include extended to `services/*` (plan's own explicit-path commands required it).
5. Worker deps declared + lockfile refreshed (`yarn install`, local only).
6. AICD Task 4.3 verified already-covering — no edit rather than churn.

## SPEC mapping (local scope)

AC-04 local half (valid proof → credit) and AC-05 (emitter/receipt/action/replay
rejection) met by passing automated gates; AC-04 live half + manifest readback are
Task 5B hybrid; AC-17 links verified present, Task 4.3 extension confirmed unnecessary.

---

# HYBRID GATE PACK — TASK 5B (APPROVAL REQUIRED)

> Executable version: `phase-03-task5-hybrid-gate-pack_09-09-26.md` (same folder).
> The section below is the summary; the pack file governs on approval.

**Purpose (exact):** emit one Sepolia `recordCredit`, build one proof via the
configured builder, submit one `PactCreditASC.execute` on Advance Testnet, wait for
`CreditVerified`, and write one redacted manifest. No other live action.

**Required Advance endpoint:** `https://rpc.cc3-testnet.creditcoin.network`
(documented, liveness unprobed — preflight must open first).

**Chain identity / chainKey evidence required:** `eth_chainId` → 102031; Sepolia
chainKey value resolved via proof-builder registry query (candidates 1/2 — record
the answer before submitting); submitted chainKey must equal the registered one in
the manifest.

**Verifier/precompile identity evidence:** `0xFD2` constant per pinned package;
Creditcoin-chain allowlist {102030,102031,102032}; NO bytecode expectation.
**tCTC denomination evidence:** manifest-readable decimals/symbol at rehearsal time
(assumed 18 until then).

**Liveness/faucet evidence:** funded disposable wallets on Sepolia (faucet path) and
Advance (Discord/thirdweb faucet paths) — balances read back before any submission.

**Disposable wallet/environment plan:** three fresh disposable EOAs (source operator,
ASC relayer, agent beneficiary); gas-only funding; keys in process env only, never
written to disk/repo/logs; rotation statement in the manifest.

**Required environment variable names (never values):** `SOURCE_CHAIN_RPC_URL`,
`SOURCE_CHAIN_KEY`, `SOURCE_CREDIT_SOURCE_ADDRESS`, `PROOF_BUILDER_URL`,
`CREDITCOIN_RPC_URL`, `PACT_CREDIT_ASC_ADDRESS`, `ASC_RELAYER_PRIVATE_KEY`,
`DEPLOYER_PRIVATE_KEY` (source deploy only), `AGENT_WALLET_ADDRESS`.

**Exact commands to run (on approval):** Phase 01 preflight (must open after R-E
supplement) → Sepolia `recordCredit` → worker proof build → `execute` submit →
confirmation waits → manifest write → readback verification. Full command lines
with the resolved values will be printed in the approval response, never before.

**Expected outputs:** source tx hash + block; builder proof payload; target proof tx
hash + block; `CreditVerified` event; `availableCredit` equals credited amount;
manifest validating against `config/asc/evidence-manifest.schema.json`.

**Rollback/cleanup:** no rollback possible on testnet (disposable state by design);
cleanup = drain leftover tCTC to the faucet return address if supported, archive
keys destroyed, manifest records final balances. Failed lane → bounded blocker
artifact per plan 5.5, local gates stay green.

**No-production-key evidence:** all three wallets freshly generated for the lane;
`git status` + secret scan clean before and after; env-only key transport.

**Hard-stop conditions:** preflight closed; chainKey unresolved; builder unreachable;
faucet unfunded; attestation stall beyond 20 minutes twice; ANY mainnet chain ID
anywhere; any secret-shaped value near the repo; any deviation from this pack
without a new approval.

## TASK 5B CLOSEOUT — EXECUTED + EVL PASS (2026-09-10, approval granted)

Prior Sections 1–5A above preserved as executed 2026-09-09. This section records only the
Task 5B live lane and its independent EVL. No prior evidence modified.

**Lane scope:** exactly one Sepolia `CreditGranted` through `PactCreditASC.execute`
on Advance (chain 102031), one redacted manifest. No second proof.

**Chain identity (EVL re-verified read-only):** source 11155111 true; target 102031 true;
chainKey 1 derived via `getSupportedChains()` against 11155111 only (never 102031).

**Source (11155111):**
- deployTx `0x2550d1746a6badccbc067342c303313b1ecaba9a700ddc8d311dc62dd1fb600c`, status 1, block 11672869, contract == manifest source.
- recordTx `0x8aeb3e57d22352de1c29e2cd167c25ccf91313511da4313e7a42d17c7b5248f8`, status 1, block 11672872 == manifest.
- `CreditGranted` in block: 1; evidenceId/amount 1e18/beneficiary match manifest.
- sourceContract `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B`; evidenceId `0x6ff34eed582ba1f452d8e9908c1736424c121e06e923f00a2625295ae45af121`; amount `1000000000000000000`; expiry `1791609777`.

**Proof (builder NOT re-queried in EVL; decoded from execute input):**
- `execute(action 0, chainKey 1, header 11672872, …)` to ASC; chainKey 1 == derived == registered; header == sourceBlock.
- Lane build (EXECUTE, bounded): attested true within single 20min cap; `ProofResult.success`; root `0xfd1513d14a5ac3f80e635c31374d8bee8c5c4eb3336a1bb1cba23b9df3608930`, siblings 8, lower `0x73650d2912be95988e2b78a3f0826258f22a6362442aaae2a3caff7a602d73c7`, roots 9.

**Target (102031):**
- merchant `0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F`; pool `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B`; controller `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423`; cardId 1 (cap 10 tCTC, activated).
- creditAsc `0xf6E7915e590d43d47c7046aB9B6B34d7Bbd0208D`; setAuthorityTx `0xced4dfd9252d690644d0b79fffdadfdf7bc91635de12837962545f122bc0f27a` block 5461849 status 1; registerTx `0xe92f93133d2a2d8f54a882fac6c07dc58cd560a6e7c863662a782efc4831a0e2` block 5461850 status 1, registeredKey 1.
- executeTx `0x483f849aa4fa81b0e02b158a0eb733b6bab341eb9b961ec7b925fb42b91e0752`, status 1, block 5461852 == manifest, gas 353511 (estimate+35%).
- `CreditEvidenceApplied`: 1, evidenceId + 1e18 match. `CreditVerified`: 1, card 1 + evidenceId + 1e18 match.
- `availableCredit(1)=1000000000000000000` == 1e18 true. `processedEvidenceIds`=true. Registered 1 == submitted 1.
- Verifier `0xFD2` canonical per pinned asc-contracts@0.2.1 (no bytecode probe by design). Decoder compile-time/zero address; example `0x04B9…` never used. No decoder deployment.
- Single proof: same evidenceId in ±5-block windows source 1 / ASC 1 / controller 1.

**Manifest:** `config/deployments/asc-evidence-rehearsal.json` schema-valid true, confirmations 2, both keys 1. Secret scan 909 files 0 findings.

**UNKNOWNs (preserved exactly, not verified):**
- tCTC 18-decimal denomination assumed;
- post-lane builder liveness unknown;
- no exhaustive chain-wide mutation audit;
- faucet/explorer/triangle/key-destruction items operator-attested.

Denomination is NOT claimed as independently verified. Operator key destruction/rotation is NOT claimed as independently verified (env-only transport attested; operator must destroy/rotate disposables, never reuse).

## APPROVAL SATISFIED — TASK 5B EXECUTED (supersedes prior WAITING line)
