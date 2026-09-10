# Phase 02 — Payment Contracts Research

Date: 2026-09-09 · Status: RESEARCH COMPLETE · Plan: `phase-02-payment-contracts_PLAN_08-09-26.md`
Mode: RESEARCH (read-only; no contracts written, no transactions, no commits, no pushes)
Entry basis: Phase 01 ✅ VERIFIED; C1–C4 accepted as bounded exception; Phase 01 EVL green; tree clean.

## Research question

Is the Phase 02 contract boundary (controller / pool / merchant-simulator, native-only,
agent-signer authority, ASC credit hook, allowlist, lifecycle, replay protection) implementable
with the current repository + toolchain, and what must change in the plan before PVL?

## Evidence table

| # | Claim | Source (date accessed 2026-09-09) | Confidence |
|---|---|---|---|
| E1 | CC3 testnet identity: chain ID **102031** (`0x18e8f`), RPC `https://rpc.cc3-testnet.creditcoin.network`, explorer `https://creditcoin-testnet.blockscout.com/`, currency CTC; mainnet 102030 | https://docs.creditcoin.org/smart-contract-guides/creditcoin-endpoints (official docs) + corroborated by chainlist.org, sequence.xyz, thirdweb, metaschool, dRPC | HIGH (identity) — liveness NOT probed (no RPC calls per research rules) |
| E2 | CC3 EVM is Frontier-based (Substrate pallet), EIP-1559 txs supported, block gas limit 75M, base fee 0.5 gwei | https://docs.creditcoin.org/evm-compatibility, https://docs.creditcoin.org/technical-specification | MEDIUM (mainnet spec page; testnet hardfork level unconfirmed) |
| E3 | Official ASC examples pin `solc 0.8.30`, `via_ir=true`, `optimizer_runs=200`, **`evm_version="shanghai"`** | https://github.com/gluwa/attestcoin-protocol-examples/blob/main/foundry.toml (raw fetch) | HIGH |
| E4 | Official example app contracts use `pragma ^0.8.20`, `is Ownable, ReentrancyGuard`, `constructor() Ownable(msg.sender)`, public mappings as read accessors, indexed-ID events | `loan/contracts/sol/AuxiliaryLoanContract.sol` (raw fetch) | HIGH |
| E5 | Installed OZ 5.4.0 `ReentrancyGuard` is **storage-based** (`_status` SSTORE; transient variant is the separate opt-in `ReentrancyGuardTransient`) — zero Cancun dependency | `node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol` (installed source) | HIGH |
| E6 | Installed OZ 5.4.0 `Ownable(address initialOwner)`; `renounceOwnership` is public virtual; errors `OwnableUnauthorizedAccount`, `OwnableInvalidOwner` | `node_modules/@openzeppelin/contracts/access/Ownable.sol` (installed source) | HIGH |
| E7 | Installed ASC package pragma `^0.8.28` (`ASCBase`, `EvmV1Decoder`, `INativeQueryVerifier`); internal imports are relative | `node_modules/@gluwa/asc-contracts/contracts/` (installed source) | HIGH |
| E8 | forge 1.7.1 resolves project config: `solc 0.8.30`, default `evm_version "osaka"`, optimizer on, `via_ir=true` | `forge config --root contracts` (local, read-only) | HIGH |
| E9 | Domain hash vector 1 reproduces under `cast abi-encode` + `cast keccak` (identical digest) | Phase 01 report (local evidence, 2026-09-09) | HIGH |
| E10 | Phase 01 outputs exist: `contracts/foundry.toml`, `packages/domain` (schemas/hash/config/loaders), AICD source + validator, preflight + secret scan | on-disk verification + Phase 01 report | HIGH |

Assumptions (marked, not proven): native value-transfer semantics on CC3 are standard EVM;
tCTC has 18 decimals; Anvil default chain ID 31337 for local lanes; `0xFD2` verifier precompile
and decoder addresses are Phase 03/07 concerns (design-doc claims, unverified here).

## Architecture decisions

- **D1 — Controller/pool/merchant split stands.** No ERC-20 branch, no direct agent treasury path,
  no model-supplied recipient. Rejected (as plan does): ERC-20 settlement, agent-held funds.
- **D2 — `evm_version` must be `"shanghai"`, not the forge default `"osaka"`.** E8 shows the
  toolchain would otherwise emit Osaka-targeted bytecode for a chain whose EVM level is
  unverified (E2). Shanghai matches the official ASC examples (E3) that will run on the same
  testnet, and needs no Cancun-era opcode anywhere in our scope. Requires a Phase 01
  `foundry.toml` touch via plan supplement (see plan changes).
- **D3 — Use storage `ReentrancyGuard`, never the transient variant.** E5 removes the only
  Cancun dependency in the plan's OZ usage. Matches official example pattern (E4).
- **D4 — Contract pragma `^0.8.28`** (0.8.28-compatible interfaces on the 0.8.30 toolchain),
  mirroring the ASC package's own pragma discipline (E7).
- **D5 — OZ constructor pattern `Ownable(msg.sender)`** exactly as the official example (E4, E6).
- **D6 — Circular wiring (controller↔pool↔merchant) resolved by construction order plus one-time
  owner-only setters:** deploy `MerchantSimulator` → `PactCreditPool` → `PactCardController`,
  then `merchant.setPool`, `pool.setController`, `controller.setAscAuthority` (Phase 03 address
  later), each callable once, each asserting final wiring. No agent-treasury authority is created
  at any step. Deploy script asserts the triangle before any test merchant registration.
- **D7 — `createCard` hardcodes `asset = address(0)`.** No asset parameter (native-only MVP);
  `pay` rejects any other asset. Single native mapping lives in Phase 01; no second mapping here.
- **D8 — Expiry is derived, never stored as a status transition** (plan Task 4.8 kept):
  `isExpired = block.timestamp >= expiresAt`; reads and `pay`/`preflightPay` use it.
  Same derivation pattern for evidence expiry in the available-credit read.
- **D9 — Nonce is marked used BEFORE the external pool call.** On revert the whole transaction
  rolls back (atomicity preserved); on success the mark blocks same-transaction reentry through
  the merchant's recipient forwarding. Double protection with `nonReentrant` on `pay`.
- **D10 — Evidence replacement is overwrite-by-new-ID.** `usedEvidence[evidenceId]` dedupes;
  a subsequent valid evidence record for the same agent replaces amount/expiry. No monotonicity
  gate (keeps Phase 03 proof-worker semantics simple; replay is still impossible).

## Contract boundary decisions

| Contract | Owns | Must never |
|---|---|---|
| PactCardController | cards, lifecycle, allowlists, nonces, evidence IDs, agent→card map, policy checks, `pay`/`preflightPay`, ASC hook | hold user funds beyond gas-less operation; trust off-chain input; mint credit |
| PactCreditPool | native balance, `fundPool` (owner), `settleNative` (controller only), `availableBalance` | accept calls from agent/anyone else; decide policy; receive untracked deposits (no `receive`/`fallback`) |
| MerchantSimulator | merchant registry, active flags, recipients, `totalReceived`, pool-only `receivePayment` + forward, receipt event | change policy; authorize cards; accept non-pool callers |

Hook contract: `applyVerifiedCreditForAgent(agent, evidenceId, amount, expiresAt)` is
**ASC-only** (one-time `setAscAuthority`), reverts on unknown agent, replayed evidence ID,
zero amount, or past expiry. Both sides of this call are written by us (Phase 03 writes the
ASC caller), so no external signature constraint exists — the plan's signature is confirmed stable.

## State machines

Card: `ISSUED → ACTIVE ⇄ SUSPENDED → CLOSED`, plus `ISSUED → CLOSED`. CLOSED terminal.
EXPIRED is derived (`block.timestamp >= expiresAt`), never a stored transition.
`updatePolicy` works on ISSUED/ACTIVE/SUSPENDED, never CLOSED. `closeCard` clears the
agent→card mapping entry when it points at the closed card. `createCard` requires no live
active card for the agent and reverts otherwise (one-active-card rule).

Payment (per attempt, single transaction): checks → mark nonce → `pool.settleNative` →
`merchant.receivePayment{value}` → forward to recipient → increment `spent` → emit
`PaymentSettled`. Any revert anywhere rolls back spent, balances, totals, and the nonce mark.

## Security invariants

1. Agent signer can call only `pay`/`preflightPay`; pool and merchant reject it.
2. `spent` increments only after a successful merchant call, inside the same transaction.
3. `spent ≤ min(ownerConfiguredCap, verifiedCredit)` whenever card and evidence are unexpired.
4. Used nonce/payment ID can never settle twice, including same-transaction reentry.
5. Merchant recipient always resolves from the on-chain registry via `merchantId`, never input.
6. Verified credit moves only through the ASC-authorized hook with unused evidence IDs.
7. Ownership actions (lifecycle, policy, wiring, funding) are owner-only; ASC hook is ASC-only.
8. `renounceOwnership` must be disabled (recommended override) — accidental renounce bricks
   policy updates, ASC wiring, and testnet fund recovery on all three contracts.
9. No secret, prompt, key, or off-chain balance is read or stored anywhere on chain.

## Test strategy

Plan's tiering confirmed sufficient, with two emphases for PVL: (a) paired
`preflightPay`-vs-`pay` tests must cover the full 12-case policy matrix including the
`msg.sender`-as-agent mirroring rule; (b) invariant suite must assert invariant 3 and 4
above under the foundry invariant runner, plus handler-driven nonce-reuse attempts.
Reason codes: stable short-ASCII `bytes32` constants (`"OK"`, `"INACTIVE_CARD"`,
`"WRONG_CALLER"`, `"MERCHANT_BLOCKED"`, `"WRONG_ASSET"`, `"ZERO_AMOUNT"`,
`"OVER_TX_LIMIT"`, `"CREDIT_EXCEEDED"`, `"CARD_EXPIRED"`, `"DEADLINE_EXPIRED"`,
`"POOL_LOW"`, `"NONCE_USED"`). Contract→executor error mapping
(`MerchantNotAllowed`↔`MERCHANT_NOT_ALLOWLISTED`, etc.) belongs in the PVL contract.

## Real-vs-mocked data boundary

- REAL: all policy/settlement logic executed on a real EVM (Anvil); real OZ 5.4.0 code;
  real Phase 01 hash vectors (vector 1 `cast`-verified); real forge invariant runner.
- MOCKED (local only, never shipped): ASC authority = owner-set address; agent/owner keys =
  Anvil default accounts; chain = Anvil 31337, not CC3; deployment key = Anvil account;
  verifier/decoder bytecode = absent (no ASC in Phase 02).
- Testnet-only safety: deploy script carries an explicit non-mainnet chain guard, requires an
  explicit `--rpc-url`, has no default broadcast target; Phase 02 performs zero live calls
  (local-first per plan).

## Risks and hard stops

| Risk | Severity | Disposition |
|---|---|---|
| Osaka-targeted bytecode on unverified EVM level | High | pin `evm_version="shanghai"` (plan change R1) |
| Reverting/malicious merchant recipient | Critical | nonce-before-call + storage guard + onlyController/onlyPool + snapshot tests (plan already covers; confirmed sound) |
| Wiring triangle grants agent authority mid-deploy | Critical | D6 ordered wiring with one-time setters + final assertion (plan change R7) |
| preflight/pay drift | High | paired matrix tests + shared reason codes (plan change R6) |
| Evidence replay / unknown agent | High | dedupe + ASC-only + agent lookup (plan covers) |
| Owner renounce bricks contracts | Medium | disable renounce (plan change R4) |
| Pool funds stranded (no withdraw in plan) | Medium | owner-only `withdraw` testnet-admin function (plan change R5) |
| CC3 lacks Cancun opcodes | Low after D2/D3 | no Cancun dependency remains; Phase 07 deploy fails fast otherwise |

Hard stops (carry into PVL/EXECUTE): pinned solc/OZ must compile; no agent treasury authority
at any wiring step; merchant failure must preserve all state (else BLOCKED); no scope widening
to other assets/chains; RPC liveness, faucet, and `0xFD2`/decoder values stay UNKNOWN until
Phase 03/07 hybrid gates — never inferred.

## Unresolved questions

- U1: CC3 testnet EVM hardfork level (Cancun/TSTORE support) — UNKNOWN; mitigated by D2/D3; verify at Phase 07 deploy.
- U2: RPC liveness/latency, faucet availability — UNKNOWN; Phase 07.
- U3: tCTC symbol/decimals on testnet (assume CTC-like, 18) — Phase 07 manifest confirms.
- U4: `0xFD2` verifier precompile + decoder library addresses on testnet — UNKNOWN; Phase 03/07.
- U5: Blockscout verification support for solc 0.8.30 + `via_ir` — nice-to-have for demo legibility.

## Recommended Phase 02 implementation sequence

Tasks 1→5 in plan order (each task's outputs feed the next; shared `contracts/src` forbids
parallel writers): types/errors/interfaces → merchant+pool → controller lifecycle+credit hook →
pay/preflight + invariants → Anvil deploy script + SDK export. No scope cut proposed; the SDK
export stays (consumed by Phases 03/04/06).

## Exact changes required to the Phase 02 plan (for PLAN-SUPPLEMENT, not applied here)

- R1: `contracts/foundry.toml`: add `evm_version = "shanghai"` (needs Phase 01 file touch — record in supplement).
- R2: optionally align ASC remapping to official form (`@gluwa/asc-contracts/=node_modules/@gluwa/asc-contracts/`) for copy-adapt fidelity in Phase 03.
- R3: error set additions: `UnknownAgent`, `AuthorityAlreadySet` (one-time wiring/ASC setters).
- R4: override `renounceOwnership` to revert on all three contracts + test.
- R5: pool `withdraw(address payable to, uint256 amount) external onlyOwner` (testnet admin) + test.
- R6: `preflightPay` reason-code table + `msg.sender`-as-agent mirroring rule; contract→DomainError mapping table for the executor.
- R7: D6 wiring sequence with one-time setters + deploy-time triangle assertion (Task 5).
- R8: public read accessors (mappings) for `cards`, `agentActiveCard`, merchant registry/totals — required by Task 5.1 readback and the manual `cast` test.
- R9: `PaymentSettled` must carry `intentHash` (+ indexed `cardId`, `nonce`); specify all event parameter lists.
- R10: contract pragma `^0.8.28`; OZ `Ownable(msg.sender)` + storage `ReentrancyGuard` (not transient).
- R11: deploy-script chain guard semantics (explicit RPC, allowlist local 31337, reject known mainnet IDs, no default broadcast).
- R12: evidence replacement = overwrite-by-new-ID (D10) stated explicitly in Task 3.7.

## Conclusion

**RESEARCH COMPLETE.** Phase 02 is implementable with the current repository and toolchain;
no BLOCKED condition found. Recommended next loop: INNOVATE (record D1–D10 vs rejected
alternatives) → PLAN-SUPPLEMENT (apply R1–R12) → PVL (V1–V7 with exact Forge gates).
F1–F3 preserved untouched as instructed.
