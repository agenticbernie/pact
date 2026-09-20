# Pact v1 Arc Credit Live Preflight

Status: **Preflight checklist only. Stops before every mutation.**

Date: 2026-09-19 · Scope: read-only checklist. No authority provisioning, card
creation, credit application, payment, broadcast, key use, funding, Neon,
OpenAI, commit, or push is authorized by this document.

## How to use

Work top to bottom. Each section must be GREEN before the next approval is
requested. Any UNKNOWN, RED, or BLOCKED item stops the lane. Record evidence
without secret values.

## 1. Wallet separation

- [ ] Owner address observed read-only.
- [ ] Authority address is a fresh disposable burner EOA, `PENDING LIVE SETUP`
  until its own approval.
- [ ] Agent address is a separate disposable burner EOA, `PENDING LIVE SETUP`
  until its own approval.
- [ ] Merchant recipient matches deployment evidence.
- [ ] No two roles share one address.
- [ ] Authority and agent are disposable, single-test wallets.
- [ ] No private key, seed, or secret value in repo, log, chat, or evidence.

## 2. Arc state

- [ ] Chain ID `5042002` via read-only RPC.
- [ ] Non-empty bytecode at all three contract addresses.
- [ ] Source verification links recorded.
- [ ] Controller owner matches deployment evidence.
- [ ] `ascAuthority` read and recorded; must be zero before provisioning.
- [ ] Pool `availableBalance` read; must exceed `10000000000000000`.
- [ ] Merchant record active with expected recipient and `totalReceived`
  baseline recorded.
- [ ] Controller/pool/merchant wiring matches the deployment triangle.

## 3. Credit parameters

- [ ] Credit amount exactly `100000000000000000`.
- [ ] Payment amount exactly `10000000000000000` for the first-test policy.
- [ ] Credit expiry duration exactly 20 minutes from grant time.
- [ ] Fresh non-zero evidence ID, never used before.
- [ ] Target agent/card binding known; no conflicting active card.
- [ ] No existing authority already set.
- [ ] Pure policy checks green via `arc-credit-policy` validators.

## 4. Approval boundaries

1. P0 read-only preflight — this checklist, no mutation.
2. Separate approval for `setAscAuthority`.
3. Read-only verify authority equals the approved address.
4. Separate approval for card creation/activation.
5. Read-only verify card, allowlist, status, expiry, limits, nonce.
6. Separate approval for one bounded credit application.
7. Read-only verify `availableCredit`, evidence ID, amount, expiry.
8. Separate approval for one allowed payment.
9. Separate approval for one expected-revert payment.

If any item is UNKNOWN/RED/BLOCKED, do not proceed to the next mutation.
