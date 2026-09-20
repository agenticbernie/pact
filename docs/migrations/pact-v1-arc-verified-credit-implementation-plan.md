# Pact v1 Arc Verified-Credit Implementation Plan

Status: **DESIGN PENDING, LIVE EXECUTION NOT APPROVED.**

Date: 2026-09-19 · Scope: design/plan only. No live credit application, card
creation, payment, redeployment, broadcast, key use, Neon operation, OpenAI
call, commit, or push was performed.

## 1. Selected model

**Model 1 — Owner-authorized bounded testnet credit. RECOMMENDED.**

No contract change. Use the already deployed controller hook with a
disposable, explicitly approved authority address set exactly once through the
existing one-time `setAscAuthority`.

## 2. Current contract audit

### Verified-credit hook

`applyVerifiedCreditForAgent(agent, evidenceId, amount, expiresAt)`:

- Caller must equal `ascAuthority`, otherwise `UnauthorizedCaller`.
- Agent must already have an active card mapping (`agentActiveCard[agent] != 0`),
  otherwise `UnknownAgent`.
- Card must not be `Closed`, otherwise `InvalidCardStatus`.
- `evidenceId` must be unused, otherwise `EvidenceAlreadyApplied`.
- `amount != 0`, otherwise `InvalidAmount`.
- `expiresAt > block.timestamp`, otherwise `InvalidPolicy`.
- Marks `usedEvidence[evidenceId] = true`, overwrites amount/expiry.
- Emits `CreditVerified(cardId, agent, evidenceId, amount, expiresAt)`.

`availableCredit(cardId)` returns zero for unknown/expired cards, expired
credit, or when `min(ownerConfiguredCap, verifiedCredit) <= spent`.

`pay` and `preflightPay` enforce the same effective limit:

```text
spent + amount <= min(ownerConfiguredCap, verifiedCredit)
```

Replay/nonce behavior is independent: payment nonces use `usedNonces`; credit
replay uses `usedEvidence`. A failed payment reverts atomically and does not
consume credit incorrectly. Expired or zero credit yields zero spendable credit
without changing pool/merchant/spent state.

There is no on-chain decrease/revoke entrypoint except overwriting with a new
evidence ID or closing/expiring the card. `ascAuthority` is one-time and cannot
be unset.

| Property | Current behavior | Arc MVP requirement | Gap |
|---|---|---|---|
| Authority caller | `msg.sender == ascAuthority` only | Disposable approved Arc authority | Authority address unprovisioned; live `ascAuthority == 0x0` |
| Authority lifecycle | One-time `setAscAuthority`, no unset | Set once, procedural containment thereafter | No on-chain revocation; must handle procedurally |
| Agent identity | Existing active-card agent only | Disposable test agent | No live agent/card yet |
| Amount | Nonzero `uint256`, no intrinsic cap | Bounded test amount | Cap must be enforced by approval/evidence, not new on-chain logic |
| Expiry | Future `uint64`, no intrinsic max | Short bounded expiry | Max expiry must be enforced procedurally |
| Overwrite | New evidence ID replaces amount/expiry | Single bounded grant per test | Must use one fresh evidence ID; no unauthorized overwrite |
| Reduction/revocation | No dedicated revoke; overwrite/close/expire only | Emergency stop | Procedural: close card, stop approvals, expire credit |
| Event | `CreditVerified` | Provenance-bearing evidence | Must record card/agent/evidence/amount/expiry |
| `availableCredit` | `min(cap, credit) - spent`, zero when expired | Positive before payment | Currently zero; live grant required |
| Preflight/settlement | Same effective-limit check | Allowed path must turn `OK` | Blocked until valid credit exists |
| Replay | `usedEvidence` blocks evidence reuse | One grant, no replay | Fresh evidence ID required |
| Zero/expired | Zero spendable, no state mutation | Fail closed | Already fail-closed; preserve |
| Overflow | Solidity `^0.8.28` checked arithmetic | Bounded test values | Use small approved values; no boundary change |

The hook does not depend on ASC proof decoding or `0xFD2`. It depends only on
whatever address the owner sets as `ascAuthority`. No mock production logic is
introduced.

## 3. Candidate models

| Model | Pros | Cons | Risk | Recommendation |
|---|---|---|---|---|
| 1. Owner-authorized bounded testnet credit | Zero contract change; uses audited hook; one-time existing setter; replay/expiry already enforced; smallest demo; fully compatible | Authority is an EOA and cannot be unset on-chain; amount/expiry caps procedural | Low implementation risk; medium procedural risk if authority handling is sloppy | **RECOMMENDED** |
| 2. Dedicated Arc credit authority contract | Separates authority logic from EOA; explicit caps/revocation possible | New contract, deployment, wiring, audit, redeploy/approval burden; larger blast radius | Medium-high: new privileged code | Rejected for first payment; possible future extension only |
| 3. Backend/oracle-signed credit evidence | Familiar off-chain issuance UX | Requires new signature verification path, key management, replay/expiry oracle design; contract change required | High: new trust and crypto surface | Rejected for first payment |

Model 1 preserves policy authority with the least new trusted code.

## 4. Selected Arc model

- Authority address: `PENDING LIVE SETUP`; a disposable EOA explicitly approved
  for one test run. No address or key appears in source/plans/evidence.
- Authority lifecycle: set once via owner-only `setAscAuthority`; cannot be
  changed or unset on-chain thereafter.
- Credit recipient: the disposable test agent owning exactly one disposable card.
- Amount cap: one small positive bounded amount approved in the live lane;
  must satisfy `amount <= perTransactionLimit` policy and pool-balance checks.
- Expiry cap: short future expiry approved in the live lane; must exceed payment
  deadline but remain bounded.
- Source/evidence ID: one fresh `bytes32` per test run, derived from the
  approved run label; never reused.
- Replay protection: existing `usedEvidence` mapping plus one-evidence-per-run
  procedure.
- Event: `CreditVerified(cardId, agent, evidenceId, amount, expiresAt)`.
- Revocation: no on-chain revoke; containment is card closure/expiry plus no
  further payment approval.
- Emergency stop: stop approvals, close the disposable card if needed, preserve
  evidence, do not submit another transaction.
- Testnet-only disclosure: every UI/report label says testnet demo allowance,
  not real credit.
- Frontend provenance: display-only `cardId`, agent, evidence ID, amount,
  expiry, authority role, and testnet warning. Browser never signs or grants.

## 5. Trust and authority boundary

- Contract owner controls lifecycle and the one-time authority selection.
- Verified-credit authority controls only bounded test grants.
- Agent executes payment but cannot grant itself credit.
- AI/OpenAI never grants, edits, or approves credit.
- Payment executor is separate from credit authority.
- Pool settles only via controller; merchant receives only via pool.
- All payment safety invariants remain: one-send, store-txHash-before-wait,
  receipt reconciliation, no second submit, fail closed.

## 6. Implementation plan

- Contract changes: none for Model 1.
- Backend changes: none for execution. Optional future read-only verifier
  extension may assert `ascAuthority != 0`, nonzero unexpired credit, and
  `availableCredit > 0`; not required to approve this design.
- Frontend changes: display-only provenance field; no mutation path.
- Data model: existing `verifiedCredit`, `verifiedCreditExpiry`,
  `usedEvidence`, `CreditVerified` fields/events. No migration.
- ABI/SDK changes: none. The existing controller ABI already exposes
  `applyVerifiedCreditForAgent`, `availableCredit`, and `ascAuthority`.
- Migration impact: additive decision/plan docs only. No network config,
  deployment manifest, contract source, or address changes in this task.
- Deployment order: no redeployment. Live order, only after separate approvals,
  is verify P0 → approve disposable authority → set authority once → create and
  activate card → apply one bounded grant → read-only verify → resume payment
  plan.
- Rollback strategy: procedural containment above; historical evidence retained.
- Security boundaries: bounded amount/expiry, fresh evidence, distinct
  owner/agent/authority roles, no AI/agent self-grant, redacted evidence.
- Grant/demo narrative: bounded testnet spending allowance enabling one allowed
  and one rejected payment; explicitly not credit scoring or real-world credit.
- Definition of done: model approved; local contract gates remain green; no
  live mutation in this task; payment lane remains blocked until authority
  provisioning and read-only credit verification are separately approved.

## 7. Test matrix

Existing local coverage already exercises the hook:
`contracts/test/PactCardController.t.sol`,
`contracts/test/PactPaymentPolicy.t.sol`,
`contracts/test/PactPaymentAtomicity.t.sol`,
`contracts/test/PactPaymentInvariant.t.sol`.

### Positive

- Approved authority grants bounded credit with future expiry.
- Correct agent receives exact amount/expiry.
- `availableCredit` updates to `min(cap, credit) - spent`.
- `preflightPay(..., from=agent)` transitions from `CREDIT_EXCEEDED` to `OK`.

### Negative

- Non-authority caller reverts `UnauthorizedCaller`.
- Zero amount reverts `InvalidAmount`.
- Stale expiry reverts `InvalidPolicy`.
- Unknown agent reverts `UnknownAgent`.
- Reused evidence reverts `EvidenceAlreadyApplied`.
- Over-cap payment still reverts `CreditExceeded`.
- Expired credit yields zero spendable credit and blocks payment.
- Unauthorized overwrite with reused or unapproved evidence fails.
- Insufficient credit still blocks settlement without state change.
- Over-limit payment still reverts with pool/merchant/spent/nonce unchanged.

### Invariant

- AI cannot grant credit.
- Agent cannot self-grant credit.
- Payment does not increase credit.
- Expired credit is unusable.
- Failed payment consumes no credit incorrectly.
- Rejected payment leaves pool/merchant/spent/nonce unchanged.
- Credit event carries explicit testnet provenance.
- No second submit after timeout/uncertainty.

## 8. Live approval gates

| Gate | Status |
|---|---|
| Decision approved | GREEN |
| Contract design | PENDING |
| Local implementation | NOT STARTED |
| Local tests | NOT STARTED |
| Arc deployment change | NOT APPROVED |
| Authority provisioning | NOT APPROVED |
| Live credit application | NOT APPROVED |
| Card setup | BLOCKED |
| Allowed payment | BLOCKED |
| Rejection payment | BLOCKED |

First payment must not proceed until the model is approved, local tests pass,
any deployment change is approved, authority is safely provisioned, and
read-only state confirms valid credit.
