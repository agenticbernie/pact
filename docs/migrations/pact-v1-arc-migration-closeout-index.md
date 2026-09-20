# Pact v1 Arc Migration Closeout Index

Date: 2026-09-20 · Branch: `main` · Scope: DOCUMENTATION-ONLY synthesis of all
Arc Testnet evidence for grant application and live demo review. No live
mutation, broadcast, signer/private-key use, deployment, funding, commit, or
push was performed in this task. No historical report was rewritten or deleted.

## 1. Document status and scope

- Status: **READY FOR GRANT/DEMO REVIEW**.
- This index links and summarizes prior evidence; it does not replace any
  source report. Where this index and a source report could be read
  differently, the source report governs.
- Live-state snapshot reconfirmed read-only during indexing (latest block
  `62959074`): no discrepancies found between reports, receipts, and state.

## 2. Executive summary

Pact v1 payment triangle (MerchantSimulator → PactCreditPool →
PactCardController) is deployed, source-verified, and functionally proven on
Arc Testnet (`5042002`) through one allowed payment (`0.01 USDC` settled
atomically) and one rejected payment (over-limit, `CreditExceeded`, zero state
change). Verified credit is a bounded testnet-only allowance, not real credit.
All lanes ran under separate explicit approvals with read-only preflights.

## 3. Grant/demo-ready highlights

- 3/3 contracts live with non-empty bytecode and Arc Explorer source
  verification.
- Full lifecycle demonstrated: authority → card → credit → allowed payment →
  rejected payment, each with receipt + event evidence.
- Exact-wei accounting: pool `-0.01`, merchant `+0.01`, spent `+0.01`.
- Fail-closed policy proven on-chain, not just in tests.
- Zero secret leakage across 1100+ scanned files.

## 4. Arc network and deployment identity

| Item | Value |
|---|---|
| Network | Arc Testnet |
| Chain ID | `5042002` (live-reconfirmed) |
| RPC | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` (canonical) |
| EVM profile | Osaka (`solc 0.8.30`, `[profile.arc]`) |
| Deployment block | `62906924` |
| Fee policy | 20 Gwei floor holds live; 1 confirmation |

## 5. Contract addresses and source verification

| Contract | Address | Source verified |
|---|---|---|
| MerchantSimulator | `0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F` | Yes |
| PactCreditPool | `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B` | Yes |
| PactCardController | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` | Yes |

Deployer/owner: `0xB8Bdcc633cd8e67250358D807918f99dc0c14D52`. Wiring triangle
(merchant↔pool↔controller) verified read-only.

## 6. A1–A3 migration timeline

- **A1 — Deployment foundation (config only):** Arc config (`verified:false`),
  Osaka profile (build + 101 tests green), dry-run fail-closed (exit 3). No
  live deployment. Policy: min fee, 1 confirmation, zero-address value
  rejection. Deploy order: merchant → pool → controller.
- **A2 — Read-only live preflight:** chain `5042002` live, RPC reachable,
  sub-second blocks, fee floor 20 Gwei compatible, canonical explorer
  `explorer.testnet.arc.io`. Faucet reachable (HTTP 200); faucet flow details
  stayed UNKNOWN in A2 (later funding ran under separate approvals).
- **A3 — Deployment evidence + reconciliation:** 3 contracts live; bytecode,
  ownership, wiring, merchant, and pool state verified; all 3 source-verified.
  Historical Foundry broadcast `transactions` rows mismatch live receipts;
  classified `ARTIFACT_LABELING_MISMATCH`, artifact preserved, live receipts
  authoritative. **A3 CLOSED.**

## 7. P0 verified-credit readiness

- Role separation verified: owner, authority burner
  `0x6E9070dDA153C7bbb975DdAa696F292a10907313`, agent burner
  `0xdc26A45c3166c28A3A6e02fC8A3BA88d631682` — three distinct EOAs.
- Both burners gas-funded (balances verified > 0 before their lanes).
- `ascAuthority` was zero before provisioning. **P0 GREEN.**
- Operating bounds: credit `0.1 USDC` (`100000000000000000`), payment
  `0.01 USDC` (`10000000000000000`), credit expiry `20 minutes` (`1200`s),
  native asset 18 decimals, fresh non-zero evidence IDs. Procedural controls,
  not on-chain caps.

## 8. Authority/card/credit lifecycle

| Step | Transaction | Block | Result |
|---|---|---:|---|
| `setAscAuthority` | `0x383f8a492bbf3d64d79f6a7c024e614728009be682aaaa8409e579bcdc6efe86` | 62948218 | Success; authority = approved burner; exactly one tx |
| `createCard` | `0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb` | 62948913 | Card `1`; cap `1e17`; limit `1e16`; allowlist correct |
| `activateCard(1)` | `0x53b2064be594c082bc4a805cfb75cddf3888405f0713422fe25a9ebdc1f2a705` | 62948948 | Status Active; no second card created |
| `applyVerifiedCreditForAgent` | `0x7837c5c28fc7b5d1659d45a068eb4ccefa630a98536eab991216b0aab91e7d41` | 62949890 | Caller = authority; amount `1e17`; evidence marked used; available credit rose correctly; no second grant |

## 9. Allowed payment evidence

- Tx `0xd795f877780cb967d167cb2d6f6bc989d6bb159fb79a15df9dee7a7fefe8e9eb`,
  block `62952008`, status `1`, caller = agent, amount `10000000000000000`,
  nonce `0`, preflight was `(true, OK)`.
- Events: `Transfer` pool→merchant, `Transfer` merchant→recipient,
  `MerchantPaymentReceived`, `PaymentSettled` — all `1e16`, same tx/block.
- No retry/duplicate. Source: `pact-v1-arc-first-payment-evidence.md`.

## 10. Rejected payment evidence

- Tx `0xde8ea691a8e87246fa100e5ba06356bffa57322667fce1f0305d23e40e53db35`,
  block `62954597`, status `0`, amount `10000000000000001` (= limit + 1),
  nonce `1`.
- Revert `CreditExceeded` (`0xd346dd71`, replay-verified); preflight reason
  `OVER_TX_LIMIT`; receipt logs empty; nonce `1` not consumed.
- Source: `pact-v1-arc-rejected-payment-evidence.md`.

## 11. End-to-end state transition table

| Item | Deployed | After allowed | After rejected | Now (reconfirmed) |
|---|---|---:|---:|---:|
| Pool | `1000000000000000000` | `990000000000000000` | unchanged | `990000000000000000` |
| Merchant total | `0` | `10000000000000000` | unchanged | `10000000000000000` |
| Card spent | `0` | `10000000000000000` | unchanged | `10000000000000000` |
| verifiedCredit | `0` → `1e17` (grant) | `1e17` | unchanged | `1e17` |
| Nonce 0 / 1 | unused / unused | used / unused | used / unused | used / unused |
| Card status | Issued → Active | Active | Active | Active |
| `nextCardId` | `1` | `2` | `2` | `2` |

Every transition equals exactly the approved amount or zero. No drift.

## 12. Security and safety controls

- One-send, store-txHash-before-wait, receipt reconciliation, no second
  submit, fail-closed preflights throughout.
- Three separated roles (owner/authority/agent); AI never grants credit;
  agent never self-grants.
- Each live lane had its own approval with read-only preflight.
- 1103 files secret-scanned, 0 findings; `git diff --check` clean.

## 13. Governance status

- Arc deployment identity: CLOSED.
- Runtime/source verification: CLOSED.
- Verified-credit authority/card/credit path: CLOSED for controlled testnet evidence.
- Allowed payment path: CLOSED.
- Rejected payment path: CLOSED.
- Arc migration closeout index: READY FOR GRANT/DEMO REVIEW.
- Pact Phase 04: NOT CLOSED / COMPLETE_WITH_GAPS.
- Production readiness: NOT CLAIMED.

## 14. Explicitly not covered

Not production-ready, not real credit, not underwriting, not credit data, not
cross-chain verified-credit equivalence, not a Phase 04/hosted-backend/Neon/
OpenAI claim.

## 15. Known assumptions

- Finality beyond 1 confirmation is assumed, not proven.
- Phase 04 remains NOT CLOSED / COMPLETE_WITH_GAPS.
- Neon/backend migration is not live.
- OpenAI/backend production lane is not verified here.
- ASC/Creditcoin legacy boundary holds; no equivalence claimed on Arc.

## 16. Evidence source index

| Evidence | Report | Explorer |
|---|---|---|
| A1 foundation | `pact-v1-arc-a1-deployment-foundation.md` | — |
| A2 preflight | `pact-v1-arc-a2-read-only-preflight.md` | `https://explorer.testnet.arc.io` |
| A3 deployment | `pact-v1-arc-a3-deployment-evidence.md` | address pages `#code` |
| A3 reconciliation | `pact-v1-arc-a3-artifact-reconciliation.md` | — |
| Operating policy | `pact-v1-arc-verified-credit-operating-policy.md` | — |
| Live preflight checklist | `pact-v1-arc-credit-live-preflight.md` | — |
| P0 preflight | `pact-v1-arc-p0-verified-credit-live-preflight.md` | — |
| Authority tx | (chat-approved lane) | `https://explorer.testnet.arc.io/tx/0x383f8a492bbf3d64d79f6a7c024e614728009be682aaaa8409e579bcdc6efe86` |
| Card setup txs | (chat-approved lane) | `https://explorer.testnet.arc.io/tx/0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb` · `https://explorer.testnet.arc.io/tx/0x53b2064be594c082bc4a805cfb75cddf3888405f0713422fe25a9ebdc1f2a705` |
| Credit tx | (chat-approved lane) | `https://explorer.testnet.arc.io/tx/0x7837c5c28fc7b5d1659d45a068eb4ccefa630a98536eab991216b0aab91e7d41` |
| Allowed payment | `pact-v1-arc-first-payment-evidence.md` | `https://explorer.testnet.arc.io/tx/0xd795f877780cb967d167cb2d6f6bc989d6bb159fb79a15df9dee7a7fefe8e9eb` |
| Rejected payment | `pact-v1-arc-rejected-payment-evidence.md` | `https://explorer.testnet.arc.io/tx/0xde8ea691a8e87246fa100e5ba06356bffa57322667fce1f0305d23e40e53db35` |

## 17. Final status

**READY FOR GRANT/DEMO REVIEW.** No discrepancies between reports, receipts,
and live state. No live mutation in this task.

## 18. Exactly one recommended next action

Submit this index plus linked evidence in the grant application / demo review,
and run no further live mutations without a new explicit approval.
