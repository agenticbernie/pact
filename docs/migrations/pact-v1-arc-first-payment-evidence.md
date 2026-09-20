# Pact v1 Arc First Allowed Payment — Evidence

Date: 2026-09-19 · Branch: `main` @ `f8d76d05f1d97ab2ef2898d39ca076af680c637d`
Scope: READ-ONLY CLOSEOUT of the first allowed payment. No broadcast, signer
use, card mutation, credit mutation, funding, faucet, redeploy, Neon, OpenAI,
rejected payment, commit, or push was performed in this closeout. The payment
itself was broadcast earlier under a separate approval; this document only
verifies it.

## Result

**ALLOWED PAYMENT VERIFIED — all receipts, events, and state deltas match.**

## 1. Transaction evidence

| Field | Value |
|---|---|
| Hash | `0xd795f877780cb967d167cb2d6f6bc989d6bb159fb79a15df9dee7a7fefe8e9eb` |
| Chain | `5042002` (reconfirmed via `cast chain-id`) |
| Block | `62952008` (block hash `0x6852…9d537cf`) |
| From (caller) | `0xdc26A45c3166c28A3a3A6e02fC8A3BA88d631682` (approved agent) |
| To | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` (controller) |
| Status | `1` (success) |
| Gas used | `177218` @ `31862858940` wei |
| Value | `0` (no native value on the agent call) |
| Input selector | `0xadfb5eba` (`pay`) |
| Input decoded | cardId `1`, merchant `0x0205…77a70`, amount `10000000000000000`, asset `address(0)`, nonce `0`, deadline future, intentHash `0x13dd…fce f` |
| Explorer | `https://explorer.testnet.arc.io/tx/0xd795f877780cb967d167cb2d6f6bc989d6bb159fb79a15df9dee7a7fefe8e9eb` (HTTP 200) |

Payload matches the approved policy exactly: amount/card/merchant/nonce/deadline
consistent with the `(true, OK)` preflight. No native value forwarded to the
zero address; settlement path is controller → pool → merchant → recipient.

## 2. Event decoding

All four logs share the payment transaction hash and block `62952008`:

| # | Emitter | Event | Key fields |
|---|---|---|---|
| 1 | `0xffff…fffe` (native asset) | `Transfer` | pool → merchant, `10000000000000000` |
| 2 | `0xffff…fffe` (native asset) | `Transfer` | merchant → recipient `0xCb05…bB4`, `10000000000000000` |
| 3 | MerchantSimulator | `MerchantPaymentReceived` | merchant `0x0205…77a70`, amount `10000000000000000`, total `10000000000000000` |
| 4 | PactCardController | `PaymentSettled` | card `1`, merchant `0x0205…77a70`, amount `10000000000000000`, nonce `0`, intentHash `0x13dd…fce f` |

Native USDC moves as `Transfer` logs from the Arc native-asset precompile
(`0xffff…fffe`); there is no ERC-20 involved. Receipt + matching indexed
events are both present, satisfying the truthful-receipt rule.

## 3. Before/after state

| Item | Before | After | Delta | Result |
|---|---|---:|---|---|
| Pool balance | `1000000000000000000` | `990000000000000000` | `-10000000000000000` | GREEN |
| Merchant total | `0` | `10000000000000000` | `+10000000000000000` | GREEN |
| Card spent | `0` | `10000000000000000` | `+10000000000000000` | GREEN |
| verifiedCredit | `100000000000000000` | `100000000000000000` | unchanged (by design) | GREEN |
| Nonce 0 | unused | used | marked once | GREEN |
| Card status | Active | Active | unchanged | GREEN |
| Agent mapping | card 1 | card 1 | unchanged | GREEN |
| Merchant active | true | true | unchanged | GREEN |

Effective consumption is recorded via `spent`, not by decreasing
`verifiedCredit` — this is the contract's designed accounting. Exactly one
payment of exactly the approved amount occurred: spent, merchant total, pool
delta, and both `Transfer` logs agree to the wei. No duplicate/second submit.

Note on `availableCredit`: it reads `0` at closeout time because the 20-minute
verified-credit window (`1789839979`) has since lapsed (latest block
`1789840027`). This is correct contract behavior for expired credit, not a
payment defect: the payment executed at block timestamp `1789839846`, inside
the validity window.

## 4. Deployment verifier note

The existing `verify-arc-deployment.mjs` now reports `merchant: false` and
`poolBalance: false` because it pins the original deployment snapshots
(total `0`, balance `1e18`). Both deviations equal exactly the verified payment
deltas above. Bytecode, ownership, and wiring remain true. The verifier is
preserved unchanged; its static expectations are stale by design after a
successful payment, which this report supersedes for pool/merchant state.

## 5. Security review

Read-only RPC, receipt, log, code, and view calls only. No signer, key,
mutator, or broadcast in this closeout. Caller is the approved agent; owner
and authority keys were not used. One-send preserved (single tx, nonce marked,
no resubmit). No secret values in this report.

## 6. Unknowns

- None for the allowed-payment path. Rejected-payment behavior remains
  unexecuted and separately approval-gated.
- Finality beyond the 1-confirmation policy remains an assumption.

## 7. No-mutation proof

Executed commands were `cast chain-id/code/block/call/balance/tx/receipt`,
`curl` HEAD/GET on the explorer, the read-only deployment verifier, and local
test gates. No `cast send`, no `eth_send*`, no signer construction.
