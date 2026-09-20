# Pact v1 Arc Rejected Payment — Evidence

Date: 2026-09-19 · Branch: `main` @ `f8d76d05f1d97ab2ef2898d39ca076af680c637d`
Scope: READ-ONLY CLOSEOUT of the rejected payment. No broadcast, signer use,
retry, card/credit mutation, funding, faucet, redeploy, Neon, OpenAI, further
payment, commit, or push was performed in this closeout. The rejected
transaction was broadcast earlier under a separate approval; this document only
verifies it.

## Result

**REJECTION VERIFIED — expected revert, zero state mutation.**

## 1. Rejected transaction evidence

| Field | Value |
|---|---|
| Hash | `0xde8ea691a8e87246fa100e5ba06356bffa57322667fce1f0305d23e40e53db35` |
| Chain | `5042002` |
| Block | `62954597` (hash `0x4ae7…7ba950`, timestamp `1789841142`) |
| From (caller) | `0xdc26A45c3166c28A3a3A6e02fC8A3BA88d631682` (approved agent) |
| To | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` (controller) |
| Status | `0` (failed) |
| Gas used | `49446` @ `25000000000` wei |
| Logs | `[]` — no `PaymentSettled`, no `MerchantPaymentReceived`, no transfers |
| Input decoded | `pay(card 1, merchant 0x0205…77a70, 10000000000000001, asset 0, nonce 1, deadline 1789841331, intentHash 0xc00e…5856)` |
| Account nonce | `1` (exactly one prior tx from agent: the allowed payment) |
| Explorer | `https://explorer.testnet.arc.io/tx/0xde8ea691a8e87246fa100e5ba06356bffa57322667fce1f0305d23e40e53db35` |

Amount is exactly `perTransactionLimit + 1`. Deadline (`1789841331`) was still
in the future at execution (`1789841142`), so the failure is purely the
over-limit policy path.

## 2. Revert/event verification

- Receipt `logs` is empty: no settlement or merchant event was emitted.
- Read-only replay of the exact calldata with `from=agent` at block `62954597`
  reverts with `0xd346dd71`, which equals the `CreditExceeded()` selector.
- `preflightPay` replay at the same block returns `(false, OVER_TX_LIMIT)`,
  matching the expected reason code.
- Atomicity holds: the nonce mark set before the external call was rolled back
  with the revert.

## 3. Before/after invariant table

Baselines are post-allowed-payment state.

| Item | Before rejected tx | After | Delta | Result |
|---|---|---:|---|---|
| Pool balance | `990000000000000000` | `990000000000000000` | `0` | GREEN |
| Merchant total | `10000000000000000` | `10000000000000000` | `0` | GREEN |
| Card spent | `10000000000000000` | `10000000000000000` | `0` | GREEN |
| verifiedCredit | `100000000000000000` | `100000000000000000` | `0` | GREEN |
| Nonce 1 | unused | unused | not consumed | GREEN |
| Nonce 0 | used | used | intact | GREEN |
| Card status | Active | Active | unchanged | GREEN |
| Agent mapping | card 1 | card 1 | unchanged | GREEN |
| Merchant active | true | true | unchanged | GREEN |
| `PaymentSettled` | — | none emitted | — | GREEN |
| `MerchantPaymentReceived` | — | none emitted | — | GREEN |

The rejected payment changed nothing: no spent increase, no merchant increase,
no pool decrease, no event, no nonce consumption.

## 4. Security review

Read-only RPC, receipt, transaction, log, code, and view calls only, plus one
local `eth_call` replay at a historical block (no state change possible). No
signer, key, mutator, broadcast, retry, or funding. No secret values in this
report.

## 5. No-mutation proof

Executed commands were `cast receipt/tx/block/call/chain-id` and `cast call`
replays with `--block`. No `cast send`, no `eth_send*`, no signer
construction.
