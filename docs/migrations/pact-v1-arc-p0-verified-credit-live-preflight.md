# Pact v1 Arc P0 Verified-Credit Live Preflight

Date: 2026-09-19T16:07Z · Branch: `main` @ `f8d76d05f1d97ab2ef2898d39ca076af680c637d`
Scope: P0 read-only live preflight for verified-credit/card setup. No
authority provisioning, card creation/activation, credit application, payment,
settlement call, broadcast, key use, wallet funding, redeploy, faucet, Neon,
OpenAI, commit, or push was performed.

## Result

```text
P0 READ-ONLY PREFLIGHT — CONDITIONAL/BLOCKED
```

On-chain identity, contracts, owner, authority-zero, card-counter, pool,
merchant, and wiring are all GREEN. The single blocker is the expected one:
disposable authority and agent addresses have not been provisioned
(`PACT_CREDIT_AUTHORITY_ADDRESS=absent`, `PACT_AGENT_ADDRESS=absent`), so role
separation cannot be verified and `setAscAuthority` must not proceed.

## 1. Arc network and contract checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| Chain ID | 5042002 | `cast chain-id` → 5042002 | GREEN |
| Merchant bytecode | non-empty | `cast code` → 3207 chars | GREEN |
| Pool bytecode | non-empty | `cast code` → 2823 chars | GREEN |
| Controller bytecode | non-empty | `cast code` → 12495 chars | GREEN |
| Latest block | readable, advancing | 62940293 → 62940297 | GREEN |

No zero or duplicated contract address. Manifest mapping matches.

## 2. Authority and card state

| Check | Expected | Actual | Result |
|---|---|---|---|
| Owner | deployer `0xB8Bd…14D52` | `owner()` → `0xB8Bdcc633cd8e67250358D807918f99dc0c14D52` | GREEN |
| ascAuthority | zero | `ascAuthority()` → `0x0000…0000` | GREEN |
| nextCardId | 1 | `nextCardId()` → 1 | GREEN |
| Pool balance | > `10000000000000000` | `availableBalance()` → `1000000000000000000` | GREEN |

`setAscAuthority` has not been called; the one-time slot remains available.
No card exists yet.

## 3. Merchant and wiring state

- `MerchantSimulator.pool()` → pool address: GREEN.
- `PactCreditPool.controller()` → controller address: GREEN.
- `PactCreditPool.merchant()` → merchant address: GREEN.
- `PactCardController.pool()` / `.merchant()` → expected addresses: GREEN.
- `merchants(merchantId)` → recipient `0xCb051F15436C352c6498Ec8702246FeaEdD35bB4`,
  active `true`, totalReceived `0`: GREEN.
- `isMerchantActive(merchantId)` → `true`: GREEN.
- Merchant ID `0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70`.
- Owner native balance `18922217772888795304` (gas available, read-only).
- Merchant recipient native balance `0` (expected: no settlement yet).

Deployment verifier re-run: bytecode, ownership, wiring, merchant, and pool
balance checks all true (10 receipts reconciled, 3 known historical artifact
labeling discrepancies, unchanged classification).

## 4. Role separation

| Role | Address/status | EOA | Balance status | Result |
|---|---|---|---|---|
| Owner | `0xB8Bd…14D52` (existing deployer) | n/a (known EOA) | gas present | GREEN |
| Authority | PENDING LIVE SETUP (env absent) | unverifiable yet | n/a | BLOCKED |
| Agent | PENDING LIVE SETUP (env absent) | unverifiable yet | n/a | BLOCKED |
| Merchant recipient | `0xCb05…bB4` (existing) | n/a | 0, as expected | GREEN |

Separation result: `BLOCKED / PENDING LIVE SETUP`. This is the expected
blocker, not a preflight defect. No address was invented; no wallet was
created or funded; no private key was accessed (presence/absence only).

## 5. Operating policy validation

Pure local validators green (`arc-credit-policy`, 8/8):

- Credit `100000000000000000` within 0.1 USDC cap.
- Payment `10000000000000000` within first-test policy.
- Expiry `1200` seconds within bound.
- Fresh non-zero evidence shape accepted; zero/malformed/reused rejected.
- Role overlap/missing-identity cases rejected (logic proven; live identities
  still pending).
- Pool `1000000000000000000` exceeds payment amount; uncertain reads fail
  closed.

Policy caps remain procedural, not on-chain enforcement.

## 6. Exact read-only commands

```bash
cast chain-id --rpc-url "$ARC_RPC_URL"
cast code <merchant|pool|controller> --rpc-url "$ARC_RPC_URL"
cast block-number --rpc-url "$ARC_RPC_URL"
cast call "$PACT_CARD_CONTROLLER" "owner()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_CARD_CONTROLLER" "ascAuthority()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_CARD_CONTROLLER" "nextCardId()(uint256)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_POOL" "availableBalance()(uint256)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_MERCHANT" "pool()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_POOL" "controller()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_POOL" "merchant()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_CARD_CONTROLLER" "pool()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_CARD_CONTROLLER" "merchant()(address)" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_MERCHANT" "merchants(bytes32)(address,bool,uint256)" "$MID" --rpc-url "$ARC_RPC_URL"
cast call "$PACT_MERCHANT" "isMerchantActive(bytes32)(bool)" "$MID" --rpc-url "$ARC_RPC_URL"
cast balance <owner|merchant-recipient> --rpc-url "$ARC_RPC_URL"
node scripts/verify-arc-deployment.mjs --config config/networks/arc-testnet.json
corepack yarn vitest run packages/domain/test/arc-credit-policy.test.ts
```

`$ARC_RPC_URL` carried the configured public endpoint; its value is never
printed. Env checked by presence/absence only.

## 7. No-mutation proof

- No `cast send`, no `eth_send*`, no `startBroadcast`, no signer/Wallet
  construction in any executed path.
- No `setAscAuthority`, `applyVerifiedCreditForAgent`, `createCard`,
  `activateCard`, `pay`, `settleNative`, or any mutator invoked.
- No wallet created or funded; no faucet called; no contract deployed.
- No Neon/OpenAI interaction; no secret value printed, read, or stored.

## 8. Blockers and unknowns

1. B-P0-1 (expected, highest priority): disposable authority and agent
   addresses absent. Provisioning decision and separate `setAscAuthority`
   approval required before any mutation.
2. No other UNKNOWN/RED items. Finality beyond the 1-confirmation policy
   remains an assumption, unchanged from A2.

## 9. Next approval boundary

Do not provision authority or touch any mutator on this report's authority.
The single next step is a separate approval for one `setAscAuthority`
transaction with the provisioned disposable authority address fixed before
signing, followed by read-only authority verification.

---

## Addendum — P0 rerun with provisioned burner addresses

Date: 2026-09-19T16:31Z · Branch: `main` @ `f8d76d05f1d97ab2ef2898d39ca076af680c637d`
Scope: read-only rerun only. No `setAscAuthority`, credit, card, payment,
broadcast, key use, funding, faucet, redeploy, Neon, OpenAI, commit, or push.

### Rerun result

```text
P0 CONDITIONAL — role separation verified, gas readiness pending
```

### Burner address validation

Public wallet addresses only; no private key, seed, or secret value recorded.

| Check | Expected | Actual | Result |
|---|---|---|---|
| Authority present | yes | yes | GREEN |
| Agent present | yes | yes | GREEN |
| Authority valid | 0x-hex, non-zero | valid, non-zero | GREEN |
| Agent valid | 0x-hex, non-zero | valid, non-zero | GREEN |
| Authority != agent | yes | yes | GREEN |
| Owner separation | distinct | authority/agent both differ from owner | GREEN |
| Merchant separation | distinct | both differ from merchant recipient | GREEN |

- Authority: `0x6E9070dDA153C7bbb975DdAa696F292a10907313`
- Agent: `0xdc26A45c3166c28A3A6e02fC8A3BA88d631682`

### EOA and balance checks

| Role | Address | EOA | Balance | Result |
|---|---|---|---|---|
| Owner | `0xB8Bd…14D52` | known EOA | gas present | GREEN |
| Credit authority | `0x6E90…7313` | `cast code` → `0x` | `0` | EOA GREEN / gas PENDING |
| Agent | `0xdc26…1682` | `cast code` → `0x` | `0` | EOA GREEN / gas PENDING |
| Merchant recipient | `0xCb05…bB4` | n/a | `0`, as expected | GREEN |

Both burners are EOAs with zero balance. Role separation is GREEN; gas
readiness is PENDING. No funding or faucet was used in this task.

### Rerun on-chain checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| Chain ID | 5042002 | 5042002 | GREEN |
| Bytecode x3 | non-empty | 3207 / 2823 / 12495 chars | GREEN |
| Owner | deployer | `0xB8Bd…14D52` | GREEN |
| ascAuthority | zero | `0x0000…0000` | GREEN |
| nextCardId | 1 | 1 | GREEN |
| Pool balance | > payment amount | `1000000000000000000` | GREEN |
| Merchant/wiring | correct | triangle + active merchant, total `0` | GREEN |
| Latest block | advancing | 62943258 → 62943263 | GREEN |

Deployment verifier rerun: all 5 runtime checks true (10 receipts, 3 known
historical discrepancies). Pure validators with live identities: roles,
credit, payment, expiry, readiness all ok.

### No-mutation proof (rerun)

Same read-only command set as §6 plus `cast code`/`cast balance` on the two
burner addresses. No `cast send`, no mutator, no signing, no funding.

### Final classification

`P0 CONDITIONAL — role separation verified, gas readiness pending`.
`setAscAuthority` remains NOT EXECUTED. The next step is gas provisioning
followed by a separate approval for exactly one `setAscAuthority` transaction;
no mutator is authorized by this addendum.

---

## Addendum — P0 rerun after burner gas funding

Date: 2026-09-19T16:53Z · Branch: `main` @ `f8d76d05f1d97ab2ef2898d39ca076af680c637d`
Scope: read-only rerun only. No `setAscAuthority`, credit, card, payment,
broadcast, key use, additional funding, faucet, redeploy, Neon, OpenAI,
commit, or push. Funding was performed outside this task; this rerun only
reads the resulting balances.

### Rerun result

```text
P0 GREEN — role separation and on-chain preflight verified
```

Prior addenda are preserved above; nothing was rewritten.

### Burner balance checks

Public addresses and public balances only; no private key, seed, or secret
value recorded.

| Role | Address | Balance | EOA | Result |
|---|---|---:|---|---|
| Credit authority | `0x6E9070dDA153C7bbb975DdAa696F292a10907313` | `20000000000000000` | `cast code` → `0x` | GREEN |
| Agent | `0xdc26A45c3166c28A3A6e02fC8A3BA88d631682` | `20000000000000000` | `cast code` → `0x` | GREEN |

Both balances are greater than zero. Gas readiness is GREEN. No additional
funding was performed in this task.

### Role separation (rerun)

Authority/agent format valid and non-zero; authority != agent; both differ
from owner `0xB8Bd…14D52` and merchant recipient `0xCb05…bB4`: all GREEN.
Pure `checkRoleSeparation` with live identities returns ok.

### Arc contract checks (rerun)

| Check | Expected | Actual | Result |
|---|---|---|---|
| Chain ID | 5042002 | 5042002 | GREEN |
| Bytecode x3 | non-empty | 3207 / 2823 / 12495 chars | GREEN |
| Owner | deployer | `0xB8Bd…14D52` | GREEN |
| ascAuthority | zero | `0x0000…0000` | GREEN |
| nextCardId | 1 | 1 | GREEN |
| Pool balance | > payment amount | `1000000000000000000` | GREEN |
| Merchant/wiring | correct | triangle + active merchant, total `0` | GREEN |
| Latest block | advancing | 62945812 → 62945817 | GREEN |

Deployment verifier rerun: all 5 runtime checks true (10 receipts, 3 known
historical discrepancies). Policy validators with live identities: roles,
credit, payment, expiry, readiness all ok.

### No-mutation proof (rerun)

Same read-only command set: `cast chain-id/code/balance/call`, deployment
verifier, local Vitest. No `cast send`, no mutator, no signing, no funding.

### Final classification

```text
P0 GREEN — role separation and on-chain preflight verified
```

Recorded explicitly:

```text
setAscAuthority: NOT EXECUTED
live credit application: NOT EXECUTED
card setup: NOT EXECUTED
payment: NOT EXECUTED
```

P0 GREEN is preflight readiness only. It is not approval to call
`setAscAuthority`.
