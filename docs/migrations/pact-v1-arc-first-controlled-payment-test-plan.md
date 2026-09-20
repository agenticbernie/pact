# Pact v1 Arc First Controlled Payment Test Plan

Status: **PLAN CREATED, EXECUTION NOT APPROVED.**

This is an additive, approval-gated test plan. It does not authorize a
broadcast, key use, card creation, payment, rejection call, OpenAI call, Neon
operation, contract change, commit, or push.

## Objective

Prove one bounded end-to-end Arc payment and one bounded policy rejection for
the already deployed Pact v1 payment triangle, while preserving the one-send,
receipt-reconciliation, and fail-closed invariants.

## Scope

- Arc Testnet chain `5042002`, RPC `https://rpc.testnet.arc.io`.
- Read-only verification of the deployed contracts and registered merchant.
- One disposable card, one allowed native payment, and one rejected payment.
- Evidence of receipts, events, state transitions, and rejection invariants.
- No source, contract, configuration, Neon, OpenAI, or Phase 04 behavior changes.

## Non-goals

- Deploying or redeploying contracts.
- Funding the pool, claiming a faucet, or changing merchant registration.
- Production use, fiat settlement, real card data, or reusable wallets.
- Verifying OpenAI, Neon, hosted Phase 04, or Phase 05 behavior.
- Changing the controller to bypass verified credit or ASC authority.
- Closing Phase 04, Phase 05, A3, or claiming end-to-end completion.

## Current Arc Addresses

| Item | Value | Status |
|---|---|---|
| Chain | `5042002` | read-only confirmed |
| RPC | `https://rpc.testnet.arc.io` | read-only confirmed |
| Reference block | `62906924` | deployment evidence block |
| MerchantSimulator | `0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F` | reconciled |
| PactCreditPool | `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B` | reconciled |
| PactCardController | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` | reconciled |
| Merchant ID | `0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70` | registered evidence |
| Merchant recipient | `0xCb051F15436C352c6498Ec8702246FeaEdD35bB4` | registered evidence |
| Merchant active | `true` | read-only evidence |
| Pool balance | `1000000000000000000` | read-only evidence; recheck in P0 |

The deployment evidence is authoritative for address-to-contract mapping. The
historical broadcast artifact's additive labeling mismatch must remain
preserved and must not be rewritten.

The payment asset is the native Arc asset represented on-chain as
`address(0)`. Amounts are integer base units; the Arc network descriptor uses
18 decimals. The plan must not introduce an ERC-20 address or decimal conversion
outside the shared network descriptor.

## Approved Operating Bounds

Testnet operating policy only; caps are procedural, not on-chain enforcement.
See `docs/migrations/pact-v1-arc-verified-credit-operating-policy.md`.

| Parameter | Value | Base units / duration |
|---|---|---|
| Credit amount | 0.1 USDC | `100000000000000000` |
| First-test payment amount | 0.01 USDC | `10000000000000000` |
| Credit expiry duration | 20 minutes | `1200` seconds |
| Evidence ID | Fresh, non-zero, never reused | `bytes32` |

Owner cap and per-transaction limit on the disposable card must each be at
least the credit/payment amounts above so the intended allowed payment is not
accidentally policy-blocked. Scenario B still uses an over-limit amount to
prove rejection.

## Actors and Wallets

| Actor | Required role | Current status |
|---|---|---|
| Owner wallet | owns controller/pool/merchant; creates and activates card | address and approved disposable wallet: `PENDING LIVE SETUP` |
| Agent wallet | card agent; submits `pay`; used as `from` for `preflightPay` | address, key provisioning, and gas balance: `PENDING LIVE SETUP` |
| ASC authority | calls `applyVerifiedCreditForAgent` | authority address and approved provisioning: `PENDING LIVE SETUP / BLOCKER` |
| Merchant recipient | receives forwarded native value | `0xCb051F15436C352c6498Ec8702246FeaEdD35bB4` |
| Controller/pool/merchant owner | deployment owner from evidence | `0xb8bdcc633cd8e67250358d807918f99dc0c14d52`; recheck read-only |

No private key, seed, secret value, or fabricated wallet/card identifier may be
written to this plan or evidence.

### Role Matrix

| Role | Identity | Allowed action |
|---|---|---|
| Owner/deployer | Existing deployer | Set one-time authority, create/configure card |
| Credit authority | Fresh burner EOA | Apply one bounded verified credit |
| Agent | Separate burner EOA | Submit payment only |
| Merchant recipient | Existing recipient | Receive settlement |
| AI/backend | Server-side | Generate intent only, never grant credit |

Live burner addresses are `PENDING LIVE SETUP`. Authority must not equal owner
or agent; agent must not equal owner. Pure separation checks live in
`packages/domain/src/arc-credit-policy.ts`.

## Exact Lifecycle

1. P0 confirms chain, code, wiring, merchant, pool, owner, and gas readiness
   using read-only calls only.
2. P1 provisions or confirms disposable owner, agent, and approved verified-
   credit authority wallets. The owner creates one card with the known merchant
   ID, then activates it. The approved authority applies nonzero verified credit.
3. P2 reads the card, credit, allowlist, status, expiry, limits, nonce, and
   balance. It calls `preflightPay` with `from=agent` and requires `OK`.
4. P3 submits exactly one allowed `pay` transaction from the agent. The
   transaction hash is stored before waiting; there is never a second submit.
5. P4 reads and reconciles the successful receipt, `PaymentSettled`, merchant
   receipt event, balances, totals, spent amount, and nonce.
6. P5 calls exactly one deliberately rejected `pay` using a fresh nonce and an
   amount above the per-transaction limit. It first requires the matching
   read-only rejection, then sends one transaction expected to revert.
7. P6 verifies receipt status, revert classification, unchanged card/pool/
   merchant/nonce state, and absence of settlement events.
8. P7 writes a redacted evidence index and stops. No cleanup mutation is
   performed unless separately approved; card closure is not part of this plan.

### Lifecycle Contract

| Step | Actor/caller | Contract/function and input | State/event | Expected failure | Read-only postcondition |
|---|---|---|---|---|---|
| Setup | owner wallet | `PactCardController.createCard(agent, cap, perTxLimit, expiresAt, [merchantId])` | Card created as `Issued`; `CardCreated` | zero agent/cap/limit, stale expiry, duplicate active agent | `cards(cardId)`, `agentActiveCard(agent)`, allowlist |
| Activate | owner wallet | `activateCard(cardId)` | status `Active`; `CardActivated` | non-owner or wrong status | `cards(cardId).status == Active` |
| Credit prerequisite | approved ASC authority | `applyVerifiedCreditForAgent(agent, evidenceId, amount, creditExpiry)` | nonzero verified credit; `CreditVerified` | wrong authority, zero amount, stale expiry, unknown agent | `cards(cardId)`, `availableCredit(cardId)` |
| Preflight | agent as `eth_call.from` | `preflightPay(cardId, merchantId, amount, address(0), nonce, deadline)` | no mutation | returns reason code such as `WRONG_CALLER`, `OVER_TX_LIMIT`, `CREDIT_EXCEEDED`, or `DEADLINE_EXPIRED` | `(true, OK)` for allowed path; expected reason for rejected path |
| Execute | agent wallet | `pay(cardId, merchantId, amount, address(0), nonce, deadline, intentHash)` | nonce marked before external call; `PaymentSettled` after success | custom policy error; all state rolls back on revert | receipt status, logs, card spent/nonce |
| Settlement | controller internal call | pool `settleNative` -> merchant `receivePayment` | pool decreases; merchant total increases; recipient receives native value; `MerchantPaymentReceived` | unauthorized pool/controller, low balance, inactive/unknown merchant, zero amount | pool balance, merchant record, recipient balance |
| Reconcile | read-only operator | receipt, logs, `cards`, `usedNonces`, `availableBalance`, `merchants` | no mutation | missing receipt/event or mismatched amount/hash | successful receipt plus matching events and exact deltas |

The owner is `msg.sender` on card creation and controls lifecycle/policy. The
agent is only the card's assigned `agent` and may execute `pay`; it cannot call
pool settlement directly. The pool accepts settlement only from the controller,
and the merchant accepts payment only from the pool. The agent wallet needs gas
for the transaction but does not need pool funds.

## Scenario A: Allowed Payment

Use the known active merchant ID, native asset `address(0)`, a fresh nonce, a
future deadline, and an approved intent hash. Exact first-test values:

- Credit amount `A_credit = 100000000000000000` (0.1 USDC).
- Payment amount `A = 10000000000000000` (0.01 USDC).
- Credit expiry duration 20 minutes from grant.
- Fresh non-zero evidence ID.

Before submission:

- `A > 0` and `A <= perTransactionLimit`;
- `spent + A <= min(ownerConfiguredCap, verifiedCredit)`;
- card and verified-credit expiries exceed the deadline;
- pool balance is at least `A`;
- `preflightPay(..., from=agent)` returns `(true, OK)`.

Submit `pay(cardId, merchantId, A, address(0), nonceA, deadlineA,
intentHashA)` once from the agent wallet. A successful run has one successful
receipt and matching `PaymentSettled` and `MerchantPaymentReceived` events.

## Scenario B: Rejected Payment

Use the same active card and merchant, a fresh nonce, native asset
`address(0)`, a future deadline, and `B = perTransactionLimit + 1`. The
read-only call must return `(false, OVER_TX_LIMIT)`. Submit exactly one
`pay(cardId, merchantId, B, address(0), nonceB, deadlineB, intentHashB)` from
the agent wallet and require a reverted transaction classified as
`CreditExceeded`.

This rejection is chosen because it is deterministic, does not require changing
merchant state, and must leave all payment state unchanged. If live ABI/error
decoding cannot classify the revert safely, classify the result as unknown and
fail closed; do not retry.

## Read-only Preflight

P0 and every later verification phase may use only `eth_chainId`, block/header,
gas/fee, `eth_getCode`, `eth_call`, receipt, log, and balance reads. Confirm:

- chain ID, RPC identity, advancing block, and fee policy;
- non-empty code at all three addresses and deployment wiring;
- controller `pool`, `merchant`, `ascAuthority`, owner, and card counter;
- pool `controller`, owner, balance, and merchant `pool`/owner wiring;
- merchant record, recipient, active flag, and `totalReceived`;
- wallet addresses and gas balances without exposing keys;
- card fields and `availableCredit` after P1;
- `preflightPay` with `from=agent` for both scenarios.

The verified-credit hook is mandatory. `availableCredit` is zero until
`applyVerifiedCreditForAgent` is called by `ascAuthority`; therefore P1 is
blocked unless an approved disposable authority provisioning path exists.

## Required Live Mutations

Only after a separate written live-lane approval, and only with disposable
wallets, the bounded mutation set is:

1. Owner `createCard` with the known merchant ID and bounded cap/limit/expiry
   covering the 0.1 USDC credit and 0.01 USDC payment.
2. Owner `activateCard` for the returned card ID.
3. Approved authority `applyVerifiedCreditForAgent` with a fresh evidence
   ID, amount `100000000000000000`, and 20-minute expiry.
4. Agent `pay` once for Scenario A with amount `10000000000000000`.
5. Agent `pay` once for Scenario B, expected to revert and make no state change.

No deployment, pool funding, faucet claim, merchant mutation, policy update,
withdrawal, card closure, or second submission is included. If pool balance or
gas is insufficient, stop and request a new approval; do not fund or retry.

## Approval Boundaries

- Plan creation is not execution approval.
- P0/P2/P4/P6/P7 are read-only or local evidence operations, but still must
  honor secret redaction.
- P1 requires explicit approval for disposable wallet provisioning, card setup,
  and the verified-credit authority call. The authority blocker is unresolved.
  Sub-gates: approve `setAscAuthority`, read-only verify authority, approve
  card creation, read-only verify card, approve credit application, read-only
  verify `availableCredit` equals the bounded grant.
- P3 requires explicit approval for one payment transaction with amount
  `10000000000000000`, nonce, deadline, and intent hash fixed before signing.
- P5 requires explicit approval for one expected-revert transaction.
- Any uncertainty about chain, signer, receipt, decoded error, or event matching
  is a hard stop. Never retry by submitting another transaction.

## Expected Transaction Sequence

If and only if approvals and the P0 gate pass, the expected sequence is:

1. `createCard` from owner -> `CardCreated`, status `Issued`.
2. `activateCard` from owner -> `CardActivated`, status `Active`.
3. `applyVerifiedCreditForAgent` from ASC authority -> `CreditVerified`, positive
   verified credit and future credit expiry.
4. Scenario A `pay` from agent -> receipt status `1`, `PaymentSettled`, pool
   settlement, merchant receipt, recipient forwarding.
5. Scenario B `pay` from agent -> receipt status `0`, `CreditExceeded`, no
   settlement or state transition.

The actual card ID, transaction hashes, blocks, gas, and receipts are
`PENDING LIVE SETUP` and must never be fabricated.

## Events

Capture and decode, by transaction hash and receipt block:

- `CardCreated(cardId, owner, agent, ownerConfiguredCap,
  perTransactionLimit, expiresAt)`;
- `CardActivated(cardId)`;
- `CreditVerified(cardId, agent, evidenceId, amount, expiresAt)`;
- Scenario A `PaymentSettled(cardId, merchantId, amount, nonce, intentHash)`;
- Scenario A `MerchantPaymentReceived(merchantId, amount, totalReceived)`;
- Scenario B no `PaymentSettled` and no `MerchantPaymentReceived`.

## State Transitions

`no card` -> `Issued` -> `Active` -> `Active with verified credit` ->
`Active with spent=A` after Scenario A. Scenario B must remain
`Active with spent=A`; `usedNonces[cardId][nonceB]` remains false because the
revert rolls back the pre-settlement nonce mark. Pool balance decreases by `A`
only, and merchant `totalReceived` increases by `A` only.

## Failure Handling

- Missing verified-credit authority or zero `availableCredit`: `BLOCKED`, no
  payment attempt.
- Wrong chain, code, wiring, owner, merchant, balance, gas, expiry, or stale
  read: stop and classify `PREFLIGHT_BLOCKED`.
- Failed or uncertain receipt: classify `FAILED` or `UNCERTAIN`; never settled.
- Receipt without matching `PaymentSettled`, or event without successful receipt:
  not settled.
- Unexpected success, unexpected revert, unknown custom error, or mismatched
  event: stop, preserve evidence, no retry.
- Any RPC/provider failure: bounded read retry only during preflight; no second
  signed submission.

## Containment

Use only disposable, labeled testnet wallets with minimal gas and no production
funds. Keep owner and agent keys separate. Use a single card, one allowed
nonce, one rejection nonce, one merchant, and one bounded amount. Do not expose
keys, raw environment values, prompts, personal card data, or secret-shaped
configuration. Do not use OpenAI, Neon, hosted Phase 04, or an unapproved RPC.

## Evidence Capture

Create an append-only, redacted evidence pack containing command names, UTC
timestamps, chain ID, block numbers, contract addresses, wallet addresses,
card ID, call parameters excluding secrets, preflight outputs, tx hashes,
receipt status, gas, decoded events, state snapshots, explorer links, and
failure classifications. Record the exact one-send decision and whether each
expected signal was present. Store transaction hash before waiting and reconcile
it after the receipt; never overwrite prior evidence.

## Security Checklist

- [ ] Explicit approval exists for each mutation phase.
- [ ] Chain is `5042002`; RPC and contract addresses match the reconciled target.
- [ ] Owner and agent are distinct disposable wallets; keys are not logged.
- [ ] ASC authority is explicitly approved and is the controller's authority.
- [ ] Verified credit is exactly `100000000000000000` with 20-minute expiry
  before payment; evidence ID is fresh and non-zero.
- [ ] Merchant ID is the exact known `bytes32`; merchant is active.
- [ ] Asset is native `address(0)`; no ERC-20 path is used.
- [ ] Scenario A uses one fresh nonce and one send only.
- [ ] Scenario B uses one fresh nonce, `OVER_TX_LIMIT`, and one expected revert.
- [ ] No second submit occurs after timeout or uncertainty.
- [ ] Settlement requires both successful receipt and matching events.
- [ ] Evidence is redacted and append-only; no OpenAI/Neon calls occurred.
- [ ] Phase 04, Phase 05, A3, and end-to-end completion remain unclaimed.

## Definition of Done

The plan is executed only when P0-P7 have explicit evidence, the authority
blocker was resolved by approval, Scenario A has exactly one successful payment
with matching receipt/events/state deltas, Scenario B has exactly one expected
revert with no state/event deltas, all evidence is redacted and reconciled, and
no unrelated mutation or retry occurred. Until then the status remains **PLAN
CREATED, EXECUTION NOT APPROVED**.

## Next Action

Review and approve P0–P2 live disposable-card setup before executing the allowed
payment. This approval must explicitly resolve the disposable verified-credit
authority blocker; until then, do not execute P1.
