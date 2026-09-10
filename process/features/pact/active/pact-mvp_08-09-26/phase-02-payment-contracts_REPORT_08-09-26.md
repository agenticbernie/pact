---
phase: phase-02-payment-contracts
date: 2026-09-09
status: COMPLETE
feature: pact
plan: process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md
---

# Phase 02 — Payment Contracts & Native Settlement: Execution Report

**Branch:** `main` · **Contract:** CONDITIONAL accepted (C-P2a–C-P2d) · **Mode:** supervised EXECUTE.
**Status: ✅ VERIFIED by user confirmation, 2026-09-09.** No push performed.

## Toolchain (recorded, C-P2c)

- `forge Version: 1.7.1 / Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8`
- `anvil Version: 1.7.1` (same commit); `cast` 1.7.1 (readback only)
- solc 0.8.30 downloaded at first build into the svm store; proven compiling
  (`solc-0.8.30 --version` → `0.8.30+commit.73712a01`); C-P2b closed by evidence
- `evm_version = "shanghai"` applied (R1); forge-std v1.16.2 installed as submodule,
  pinned by `contracts/foundry.lock`

## Tasks 1–5 status (all TDD, every increment RED-first)

- **Task 1 DONE:** `PactTypes.t.sol` RED (missing sources; solc resolved during the run)
  → GREEN 5/5. Types, 16-error set, 3 interfaces, 12 reason codes.
- **Task 2 DONE:** merchant/pool tests RED → GREEN 11+11. Real-balance accounting,
  owner withdraw + `PoolWithdrawn`, storage guard, reverting-recipient atomicity at
  merchant level, one-time wiring setters, renounce-lock.
- **Task 3 DONE:** lifecycle/credit tests RED → GREEN 9+10. Lifecycle machine,
  one-active-card rule, ASC-only hook, dedupe, overwrite-by-new-ID replacement,
  derived expiry/credit reads.
- **Task 4 DONE:** policy/atomic/invariant tests RED (no `pay`) → GREEN 14+1+3.
  12-case paired preflight/pay matrix, snapshot atomicity, 3 invariants over ~128k
  handler calls with 0 discards and 0 unexpected reverts.
- **Task 5 DONE:** deploy-script test RED → GREEN 3/3; live Anvil broadcast exit 0
  (chain 31337, triangle asserted on chain); export exit 0 (manifest + SDK);
  `typecheck` clean (SDK included); `cast` readback verified wiring, funding,
  and the agent-pool revert (`0x5c427cd9` == `UnauthorizedCaller()`).

## Gate results (exact output, no fakes)

EXECUTE run plus independent EVL re-run (EVL trusted no handoff output; selected
deltas noted). Anvil instances used: EXECUTE on port 8545, EVL on a fresh port 8546.

- `forge test --root contracts`: 8 suites, 64/64 pass, rerun in EVL identically
- `forge test --match-path test/PactPaymentInvariant.t.sol`: 3/3 pass; EVL counted
  ~128k handler calls, 0 reverts, 0 discards
- `forge test --match-path test/PactPaymentPolicy.t.sol -vvv`: 14/14 PASS (EVL verbose)
- `forge fmt --check`: clean · `forge build`: exit 0 (EVL; build note about
  block.timestamp lint is informational only)
- Anvil deploy: `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL` on both ports; pool 10 ETH
- Export: exit 0; EVL re-export byte-identical SDK (`abi.ts`, `addresses.ts`,
  `index.ts` match committed files); manifest chain 31337 / `anvil-local`
- `cast` readback (EVL, fresh chain): 3/3 owners = operator; 5/5 wiring pointers;
  pool balance 1e19; merchant active; agent→`settleNative` reverts `0x5c427cd9`
  (verified equal to `UnauthorizedCaller()` selector); ASC hook unreachable
  (`ascAuthority` zero)
- `--ffi=false`: forge 1.7.1 has no such flag form (exit 2 usage). Recorded, not
  faked: ffi is disabled by default and no ffi cheatcode or `ffi=true` exists
  anywhere in `contracts/` (grep-verified). Residual note, not a gap.
- `yarn test` (domain regression): 56/56 · `typecheck`/`lint`: clean
- `validate:aicd`: 0 failures · secret scan: 874 files, 0 findings (EVL count)
  · `diff --check`: clean

## Authority and fund-flow verification

- Agent calls only `pay`/`preflightPay`; pool `settleNative` is controller-only and
  merchant `receivePayment` pool-only (unit-tested + proven on Anvil via the
  `UnauthorizedCaller` revert).
- Ownership triangle after deploy: merchant→pool→controller→(pool, merchant), all
  three owned by the operator key; wiring setters one-shot; ASC authority unset
  until Phase 03 (hook unreachable on the local deploy).
- Merchant failure atomicity: spent, pool balance, merchant total, and nonce mark
  identical before/after a reverting-recipient payment; available credit unchanged.

## C-P2a–C-P2d disposition

- C-P2a closed: all planned paths now exist, every one created via a RED test first.
- C-P2b closed: solc 0.8.30 fetched and proven (see toolchain).
- C-P2c closed except `--ffi=false`: versions recorded above; `forge build` runs as
  part of every test invocation; no ffi cheatcode exists anywhere in the tree
  (residual note, not a gap).
- C-P2d closed: R1 `evm_version` applied; R2 rejection honored (remapping untouched).

## U1–U5

Still deferred, zero testnet contact in this phase (no RPC beyond local Anvil,
no broadcasts beyond chain 31337, no keys committed — Anvil test key lived only
in process env). U1 mitigated by construction (shanghai target + storage guard).

## Plan deviations (all in-blast-radius, no scope widening)

1. `setMerchantActive` added to the merchant interface (required by the plan's own
   inactive-merchant tests).
2. `availableCredit`/`isCardExpired` added to the controller interface (R8 readback).
3. `foundry.toml`: `libs += lib`, forge-std remapping, `allow_paths` (OZ resolution).
4. forge-std v1.16.2 submodule + `contracts/foundry.lock`.
5. Deploy script funds the pool in a separate broadcast tx (script-EVM sender
   semantics); `deployAll` takes the operator and transfers ownership.
6. Plan's chained `--match-path A --match-path B` does not parse in forge 1.7.1 —
   suites run sequentially (command drift, reported for PVL).
7. Memorized Anvil default key was corrupted; correct key derived from the Anvil
   mnemonic via `cast` (local only, never stored).
8. `contracts/broadcast/` gitignored (machine-local run records; manifest + SDK
   are the committed evidence).

## SPEC mapping (Phase 02 scope)

AC-02 (lifecycle + readback), AC-03 (suspend blocks), AC-09 (Anvil atomic settlement
+ intentHash event), AC-10 (12-case matrix), AC-11 (expiry/deadline), AC-12 (nonce
replay + invariant), AC-13 (atomicity snapshot) — all met by passing automated gates
except AC-09's live-testnet half, which belongs to Phase 07 (hybrid, deferred).

## Files and commits

- New: `contracts/src/` (5), `contracts/test/` (6), `contracts/script/` (2),
  `packages/pact-sdk/` (package.json + generated abi/addresses/index),
  `config/deployments/local-payment.json`, `scripts/export-contract-artifacts.mjs`,
  `contracts/foundry.lock`, `.gitmodules` + forge-std gitlink
- Modified: `contracts/foundry.toml`, `.gitignore`
- Commits (local only): `4152582` types, `7ab7f1d` merchant+pool, `24b3964`
  lifecycle+hook, `0bbd1da` payment+invariants, `21fef27` deploy/SDK/toolchain
- Uncommitted at EXECUTE handoff (closed by the UPDATE PROCESS commit): this report;
  plan file (supplement + checkbox ticking); research + PVL findings artifacts
  (preserved verbatim)

## EVL observation (non-blocking, no history rewrite)

The five execution commits are file-grouped final snapshots, not per-task
incremental states: Task-4 controller/interface code sits inside the C1/C3
snapshots because all implementation finished before any commit ran. Content is
complete and verified; rewriting history would gain nothing. Future phases
should commit per task promptly.

## Remaining blockers / deferred items

Blockers: none. Deferred: U1–U5 (hybrid gates); `--ffi=false` form unsupported
(note); F1–F3 preserved untouched per instruction.
