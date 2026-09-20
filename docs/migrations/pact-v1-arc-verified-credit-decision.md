# Pact v1 Arc Verified-Credit Decision

Status: **Verified-credit Arc MVP: IN SCOPE, DESIGN PENDING, LIVE EXECUTION NOT APPROVED.**

Date: 2026-09-19 · Scope: governance decision record only. No live credit
application, card creation, payment, deployment, broadcast, key use, Neon
operation, OpenAI call, commit, or push was performed.

## 1. Previous decision

Arc MVP excluded verified-credit/ASC:

- No new credit-evidence contract on Arc.
- `PactCreditASC` / `PactCreditSource` remained Creditcoin legacy surfaces.
- `verified-credit` listed in `unsupportedFeatures` for `arc-testnet`.
- First payment planning treated verified credit as `PENDING LIVE SETUP / BLOCKER`.

Rationale at the time: avoid cross-chain ASC proof complexity (`0xFD2`
precompile has no Arc equivalent) and keep Arc settlement/policy minimal.

## 2. Why the previous decision no longer fits

`PactCardController.availableCredit` is:

```text
min(ownerConfiguredCap, verifiedCredit) - spent
```

and zero when `verifiedCredit == 0` or `verifiedCreditExpiry` is stale.
`createCard` initializes both verified fields to zero. `pay`/`preflightPay`
enforce `spent + amount <= min(cap, verifiedCredit)`.

Consequence: without at least one authorized
`applyVerifiedCreditForAgent` call, every Arc payment deterministically fails
with `CreditExceeded` / `CREDIT_EXCEEDED`, even with a funded pool, active
merchant, valid card, nonce, deadline, and agent. A3 proved deployment, not
payment readiness. Keeping verified-credit out of scope therefore blocks the
approved first controlled payment objective.

## 3. New decision

> Verified-credit is an IN-SCOPE capability of Pact v1 Arc MVP.

This is a testnet-only spending-control capability, not real-world credit.

## 4. Testnet-only scope and disclosure

- Testnet-only Arc Testnet usage.
- Bounded amounts, bounded expiries, disposable wallets/cards.
- No credit underwriting, no creditworthiness claim, no real-world identity.
- No production funds, fiat settlement, or reusable credit history.
- Frontend/docs must label this as testnet demo credit with explicit provenance.
- Never describe Arc verified credit as real credit data.

## 5. ASC/Creditcoin legacy boundary

Preserved unchanged:

- `contracts/src/PactCreditASC.sol`.
- `contracts/src/PactCreditSource.sol`.
- `services/asc-proof-worker/`.
- `config/asc/`.
- `config/networks/advance-testnet.json`.
- Phase 03 reports and historical evidence.

No deletions, behavior edits, rewrites, or status changes to Phase 03.

Arc verified credit must not claim to be ASC cross-chain proof and must not
depend on the Creditcoin `0xFD2` precompile. Arc has no equivalent precompile
in this lane; no equivalent is assumed.

## 6. Why the current contract needs verified credit

Live Arc reads confirm the mechanism and the gap:

- Chain `5042002`.
- Controller owner `0xB8Bdcc633cd8e67250358D807918f99dc0c14d52`.
- `ascAuthority == 0x0000000000000000000000000000000000000000`.
- `nextCardId == 1`, therefore no live card exists.
- One-time `setAscAuthority` remains available exactly once.

Until an approved authority is set and applies nonzero, unexpired credit to the
test agent/card, `availableCredit` remains zero.

## 7. Impact on first payment test

The existing plan
(`docs/migrations/pact-v1-arc-first-controlled-payment-test-plan.md`) already
marks verified-credit authority as `PENDING LIVE SETUP / BLOCKER`.

This decision does not authorize execution. It requires:

1. Selection of one Arc-native model.
2. Local design/tests green.
3. Explicit Arc deployment-change approval if a contract change is required.
4. Explicit safe authority provisioning.
5. Read-only confirmation of valid credit before any payment lane resumes.

The P1 card-setup phase remains BLOCKED until those gates pass.

## 8. Approval boundary

Design/plan work is allowed. The following remain NOT APPROVED:

- Live `setAscAuthority`.
- Live `applyVerifiedCreditForAgent`.
- Live card creation.
- Allowed or rejected live payment.
- Contract redeployment.
- Neon deployment/migration.
- OpenAI/hosted Phase 04 live use.
- Commit/push.

## 9. Rollback/reversal strategy

- If no model is approved, reverse only the scope statement back to
  out-of-scope; first payment remains blocked by the same authority gap.
- If a model is approved but not provisioned, retain design artifacts and keep
  live execution blocked.
- If authority is ever mis-provisioned, containment is card closure, expiry,
  pool withdrawal by the owner, and no new payment approval. No contract
  behavior is changed to conceal a bad authority decision.
- Historical evidence is never rewritten.
