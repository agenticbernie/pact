# Phase 03 — ASC Credit Evidence Research

Date: 2026-09-09 · Status: RESEARCH COMPLETE — READY FOR INNOVATE · Plan: `phase-03-asc-credit-evidence_PLAN_08-09-26.md`
Mode: RESEARCH (read-only; no code, no RPC, no deploys, no commits, no pushes).
Entry basis: Phase 01 ✅ VERIFIED; Phase 02 ✅ VERIFIED; F1–F3 preserved untouched.

## Research question

Can Pact prove a Sepolia `CreditGranted` event through the Attestcoin readability flow
and apply it to the Phase 02 verified-credit hook with the current repo + toolchain,
and exactly what (verifier, decoder, chain keys, worker shape) must the plan pin down?

## Source/evidence table

| # | Claim | Source (retrieved 2026-09-09) | Type / confidence |
|---|---|---|---|
| S1 | `ASCBase.execute(uint8,uint64,uint64,bytes,bytes32,MerkleProofEntry[],bytes32,bytes32[])`; query dedupe; `_processAndEmitEvent(action,queryId,encodedTx)` virtual | pinned `node_modules/@gluwa/asc-contracts/.../ASCBase.sol` (installed source) | primary / HIGH — plan signature matches exactly |
| S2 | Verifier = precompile `0xFD2` (4050); `extcodesize==0` yet callable; `isCreditcoinChainId` = {102030, 102031, 102032} | pinned `INativeQueryVerifier.sol` (`NativeQueryVerifierLib`) | primary / HIGH |
| S3 | `EvmV1Decoder` is a pure library with **zero** external/public functions — fully inlined, no deployment exists or is needed | grep over pinned `EvmV1Decoder.sol` (NON_INTERNAL_COUNT=0) | primary / HIGH |
| S4 | Official handler pattern: tx-type check → `decodeReceiptFields` → `receiptStatus==1` → `getLogsByEventSignature` → `log.address_` source binding → topic/data checks → `abi.decode`; enum action + `InvalidAction`; `Ownable(msg.sender)`; single registered source | `ASCLoanManager.sol` + `AuxiliaryLoanContract.sol` (official examples, raw fetch) | primary / HIGH |
| S5 | Official toolchain: solc 0.8.30, `via_ir`, `evm_version="shanghai"`; worker reconcile-by-reading, 3 attempts, 5s backoff, state-check-then-act; attestation latency ~8 min; gas ~445k +35% buffer with size-based fallback; 50-block Sepolia log chunks | official `foundry.toml`, `loan_proof.ts`, `shared/utils/index.ts`, loan README (raw fetches) | primary / HIGH |
| S6 | `ProofBuilder(chainKey, builderUrl, timeout)` → `getProof(txHash)` → `{chainKey, headerNumber, txBytes, merkleProof{root, siblings[{hash,isLeft}]}, continuityProof{lowerEndpointDigest, roots}}`; HTTP `GET /api/v1/proof-by-tx/{chainKey}/{tx}`; `PrecompileChainInfoProvider` + `waitUntilHeightAttested` | pinned `@gluwa/usc-sdk@0.18.0` `proof-provider/` + `chain-info/` (installed source) | primary / HIGH |
| S7 | CC3 testnet proof builder `https://prover.cc3-testnet.creditcoin.network`; example `SOURCE_CHAIN_KEY=1`; CC3 RPC `https://rpc.cc3-testnet.creditcoin.network` | official loan `.env.example` (raw fetch) | official static artifact / MEDIUM (values documented, liveness unprobed) |
| S8 | CC3 testnet identity 102031 / tCTC / blockscout explorer; official Discord `/faucet` for EVM + Substrate; thirdweb faucet 0.01 tCTC/day | docs.creditcoin.org (endpoints + faucet pages) + aggregators (Phase 02 research, 2026-09-09) | official docs / HIGH (identity); liveness unprobed |
| S9 | Source chain for ASC examples is Sepolia (chainId 11155111, public knowledge); Sepolia ETH via public faucets | official loan README (raw fetch) | official / HIGH (chain selection); Sepolia ASC **chainKey UNKNOWN** — example env says 1, tutorial logs + SDK docs show 2 |
| S10 | creditcoin3 adds chainKey 3 = Ethereum Mainnet (test matrix); `102032` recognized by the pinned verifier lib | gluwa/creditcoin3 changelog + S2 | official / MEDIUM (context only) |
| S11 | Phase 02 hook `applyVerifiedCreditForAgent(agent, evidenceId, amount, expiresAt)`, ASC-only one-time authority, overwrite-by-new-ID, `UnknownAgent`/`EvidenceAlreadyApplied` | Phase 02 report + `contracts/src/PactCardController.sol` (on-disk) | local evidence / HIGH |

## Advance identity assessment (Q1)

Official name Creditcoin Testnet (CC3 label Advance Testnet is ours): chain ID **102031**,
RPC `https://rpc.cc3-testnet.creditcoin.network`, explorer
`https://creditcoin-testnet.blockscout.com/`, asset tCTC (18 decimals assumed, EVM-native
standard). Faucet path documented (Discord bot + thirdweb). EVM is Frontier-based with
EIP-1559; exact hardfork level unconfirmed (U1). Our shanghai target + storage-only guard
needs no Cancun opcode, so Phase 03 local work is unaffected. No liveness probed (U2).

## Verifier/decoder assessment (Q2)

- **Verifier: RESOLVED as a protocol constant.** `0xFD2` is a native precompile, not a
  deployed contract: no bytecode exists or is expected, no ABI beyond
  `INativeQueryVerifier.sol` (pinned), no Blockscout verification applicable. Presence is
  established by (chain ID ∈ {102030,102031,102032} per the pinned lib) + address constant.
- **Decoder: RESOLVED as compile-time.** S3 proves no decoder deployment exists or is
  needed with asc-contracts@0.2.1. The example `EVM_V1_DECODER_LIBRARY_ADDRESS`
  (`0x04B9…`) is not consumed by any inlined-linkage flow — do NOT copy it into Pact
  config (provenance unverified, mechanism inapplicable). Decoder pinning = yarn +
  foundry locks (already held).
- **Cross-phase correction required (high):** Phase 01's readiness semantics
  (`verifierHasBytecode` / `decoderHasBytecode` non-empty) can never open on the real
  chain — the verifier precompile has no bytecode by design (S2 documents exactly this),
  and the decoder has no address by construction (S3). Recommend the R-item below that
  revises readiness to: matching allowlisted chain ID + verifier `0xFD2` constant +
  decoder acknowledged compile-time. Untouched in this pass (Phase 01 files).

## ASC evidence model (Q3)

ASC proves: a source transaction was included at a height (Merkle inclusion) within a
continuous attested header chain (continuity), exactly once per query
(`queryId = keccak(chainKey, blockHeight, txIndex)`, txIndex verifier-derived).
Anyone may submit `execute()`; authorization lives in the handler (source binding +
action allowlist), not in submission. Freshness/expiry is application-side (our
`expiresAt` check). Identity = evidence ID (our dedupe) layered over query ID (base
dedupe): two valid queries cannot double-apply one event. Failure = full revert, no
partial state. Required handler checks mirror S4: tx-type validity, `receiptStatus==1`,
exact event signature, registered emitter (`log.address_`), topic count/shape, data
length/shape, beneficiary/agent resolution, positive amount, future expiry, unused
evidence ID. Read accessors: `processedQueries` (base) + our `usedEvidence`-equivalent
(the controller already exposes it) + `sourceContract`/`sourceChainKey` getters.
Deterministic local tests: yes — etched mock verifier at `0xFD2` (Anvil has no precompile;
`hasPrecompile()` falls back to bytecode presence, so the mock satisfies it) returning
fixture-controlled `verifyAndEmit`/`calculateTxIndex`, plus hand-built encoded transactions
decoded by the real `EvmV1Decoder`.
**Chain-binding limitation (new finding):** `ASCBase.execute` is non-virtual and
`_processAndEmitEvent` receives no chainKey, so the handler cannot re-check the source
chain — exactly like the official example. Protection rests on (i) emitter-address binding
plus (ii) the verifier's supported-chain set. An attacker replicating the source address
(CREATE2) on another verifier-supported chain with a real tx + valid proof is the residual
threat model: record it, bind `(chainKey, emitter)` at registration, have the worker serve
only the registered chain, and resolve the verifier's supported set at the hybrid gate.
Do not weaken anything over it in MVP.

## Pact integration boundary (Q4)

- Hook: `PactCreditASC` (new, `Ownable` + `ASCBase`) → controller
  `applyVerifiedCreditForAgent` (exists, ASC-only one-time wiring via `setAscAuthority`).
  Controller needs no changes (hook signature already matches; overwrite + replay +
  unknown-agent semantics already tested).
- `CREDIT_GRANTED = 0` sole action; anything else reverts (`InvalidAction`-style error).
- `registerSourceCreditContract(sourceChainKey, sourceContract)` owner-only (mirrors S4).
- Agent gains no new authority: it cannot call the ASC meaningfully (no policy path),
  cannot touch pool/merchant, cannot mint credit (hook is ASC-only). Treasury separation intact.
- Chain/address guards: registration-time binding + worker allowlist; deploy script
  reuses the Phase 02 non-mainnet guard pattern.
- Off-chain boundary: worker prepares `ContinuityResponse` → maps 1:1 to `execute()` args
  (`headerNumber`→`blockHeight`, `txBytes`→`encodedTransaction`, `root`→`merkleRoot`,
  `siblings[{hash,isLeft}]`, `lowerEndpointDigest`, `roots`→`continuityRoots`); decoder
  stays on-chain only (S4 pattern — no off-chain decoding authority).
- SDK surface for Phase 03: existing `ProofBuilder` + `PrecompileChainInfoProvider` +
  `mergeProofs` from the pinned usc-sdk (no new dependency); Pact SDK gains ASC + source
  ABIs/addresses via the existing export script.

## Real-vs-mock matrix (Q5)

| Dependency | Class |
|---|---|
| `execute()` signature, query dedupe, `0xFD2` constant, `EvmV1Decoder` logic, `ProofBuilder`/`mergeProofs`/chain-info client | official static artifact (pinned package/source) |
| CreditGranted event shape, handler checks, worker reconcile loop, gas fallback, log chunking | official static artifact (example pattern, adapted) |
| Sepolia CreditGranted emission, Anvil harness, mock verifier at `0xFD2`, fixture proofs, worker retry/idempotency tests | local deterministic fixture / Anvil mock |
| Sepolia chainKey value, proof-builder liveness, attestation latency, CC3 verifier behavior, faucet availability, tCTC denomination confirmation, decoder-address N/A confirmation on chain | future Advance hybrid evidence |
| Anything else claimed live (receipts, bytecode, explorer verification) | UNKNOWN — never inferred |

## State/data-flow description

Source `recordCredit` → Sepolia receipt → worker discovers (tx-hash-driven, 50-block
chunks) → waits attestation (~8 min typical) → `ProofBuilder.getProof` → maps to
`execute(CREDIT_GRANTED, …)` → precompile verifies → base dedupes query →
`_processAndEmitEvent` validates (S4 checks + Pact evidence checks) →
`controller.applyVerifiedCreditForAgent` → `CreditVerified` event → indexer/UI
(Phase 05/06 consume; out of scope here). Retry rule: reconcile on-chain state
(evidence/query processed flags + target tx hash) before any rebroadcast; bounded
attempts (mirror S5: 3 tries, 5s backoff, gas +35% with size fallback).

## Security and trust assumptions

Spec invariants 5 (ASC-only credit) and 8 (replay rejection) hold by construction
(authority + double dedupe). Trust anchors: pinned package sources (S1–S3),
official handler discipline (S4), single registered `(chainKey, emitter)` pair,
owner-only registration/wiring, redacted worker records (no proof blobs/secrets
persisted), disposable keys. Non-goals: underwriting meaning, multi-action,
multi-source, ERC-20, other chains.

## Test strategy (Q6)

Forge: source-emitter tests (plan 1.2 set); harness matrix — valid action, unsupported
action, bad receipt, missing event, wrong emitter, topic/data shape, unknown
beneficiary/agent, expired credit, evidence replay, query replay; mock verifier
fixture-true-only. Vitest: worker discovery/timeout/backoff/dedupe/already-broadcast/
permanent-failure; evidence-record redaction/transitions/classification. Hybrid
(Task 5 lane, approved only): one real Sepolia event → proof → `execute` → verified
credit readback, or a bounded blocker artifact. Anvil integration: full local loop
with etched mock. Field-name fix required: worker payload `siblings[].left` →
`isLeft` (canonical per S6; plan supplement item).

## U1–U5 status

- U1 EVM hardfork: still UNKNOWN — but Phase 03 local scope needs no Cancun opcode
  (shanghai + inlined decoder + storage guard); verify at hybrid deploy. PENDING HYBRID.
- U2 RPC/faucet liveness: paths documented (S7/S8), liveness unprobed. PENDING HYBRID.
- U3 tCTC denomination: 18 assumed (EVM-native standard). PENDING (manifest confirms).
- U4 verifier/decoder addresses: RESOLVED as constants-or-N/A (verifier `0xFD2`
  precompile; decoder compile-time, do-not-copy `0x04B9…`). Sepolia chainKey value:
  UNKNOWN (candidates 1 per example env vs 2 per tutorial logs/SDK docs) — resolve via
  builder/registry query at hybrid gate. Preflight-readiness revision proposed (R-item).
- U5 Blockscout verification: N/A for precompile/decoder; app-contract verification is
  a Phase 07 nicety. UNKNOWN, non-blocking.

## Risks and hard stops

Builder outage/latency (mitigate: bounded waits, durable cursor, honest blocker);
wrong-chain proof accepted (mitigate: `(chainKey, emitter)` binding + worker allowlist,
residual model above); emitter spoof on the SAME chain (mitigate: exact address check —
CREATE2-clone on the same chain is indistinguishable and out of MVP scope, documented);
mock-green masquerading as live (mitigate: hybrid lane labels evidence origin);
preflight-readiness deadlock (mitigate: R-item revision — otherwise deployment stays
unopenable). Hard stops: pinned ASC/solc must compile; proof must not apply credit
without source binding + dedupe; no fake live state; live lane needs contract + approval.

## Exact recommendation for Phase 03 MVP scope

Plan Tasks 1–5 stand as scoped (source emitter, ASC + harness, worker adapter, evidence
shape + AICD links, hybrid-or-blocker lane). Smallest real scope = exactly that; cut
nothing (SDK export and AICD links are consumed downstream).

## Proposed R-items for PLAN-SUPPLEMENT

- R-A: worker payload `siblings[].left` → `isLeft` (+_off-chain→calldata mapping note).
- R-B: `PactCreditASC` stores `(sourceChainKey, sourceContract)`; constructor takes
  controller address (immutable); `CREDIT_GRANTED=0`; `InvalidAction`-style error.
- R-C: harness mock at `0xFD2` implements `verifyAndEmit` (fixture-true-only) +
  `calculateTxIndex` (deterministic); `vm.etch` pattern (Anvil has no precompile).
- R-D: worker bounds mirror S5 (3 tries, 5s backoff, gas +35% w/ size fallback,
  50-block Sepolia chunks, reconcile-before-retry, tx-hash-driven).
- R-E: preflight-readiness revision (cross-phase, Phase 01 files): chain-ID allowlist
  {102030,102031,102032} + verifier `0xFD2` constant + decoder compile-time; drop
  bytecode-presence requirements. HCF: without this, deployment can never open.
- R-F: `tsconfig` must cover `services/asc-proof-worker` (root `tsc --noEmit` gates it).
- R-G: evidence record = plan's `CreditEvidenceRecord` + `evidenceKey =
  chainKey|sourceTxHash|evidenceId`; never persist proof blobs/keys.
- R-H: chain-binding residual model recorded; no handler change possible (non-virtual
  `execute`); worker serves registered chain only.

## AICD traceability

No new components (credit-ASC, source, proof worker, evidence flow, SC-ASC-001/002
already declared with authority/cannot/deployment/evidence). Task 4.3 extends evidence
links per plan; validator re-runs. No ID changes.

## Conclusion

**RESEARCH COMPLETE — READY FOR INNOVATE.** No BLOCKED condition: every Phase 03
dependency is a pinned artifact, a local fixture, or a correctly-routed hybrid gate.
Two supplement-grade corrections found (payload `isLeft`, readiness semantics); one
residual threat model recorded (chain binding); zero scope expansion proposed.
