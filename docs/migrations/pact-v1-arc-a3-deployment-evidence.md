# A3 — Arc deployment evidence

Date: 2026-09-19 · Scope: read-only deployment verification. No broadcast,
funding, faucet claim, payment, card creation, key use, Neon work, OpenAI call,
commit, or push was performed.

## Result

**CONDITIONAL: runtime deployment verified; historical artifact requires reconciliation.**

### Reconciliation addendum (2026-09-19)

The follow-up read-only reconciliation is complete. See
`pact-v1-arc-a3-artifact-reconciliation.md`. The discrepancy is classified as
`ARTIFACT_LABELING_MISMATCH`; live receipts, runtime bytecode/state, Explorer
source verification, and the deployment manifest are consistent. A3 deployment
evidence is now **CLOSED** while this historical result section is preserved as
the original closeout state.

The approved Arc Testnet deployment is live at chain `5042002`, block
`62906924`. RPC reads confirmed bytecode, ownership, wiring, merchant state,
and pool balance. The canonical network config remains `verified: false` and
`deploymentStatus: not-deployed` because this evidence does not authorize the
broader live demo lane and the broadcast artifact has inconsistent transaction
metadata.

## Runtime Evidence

| Item | Value | Evidence |
|---|---|---|
| Chain | `5042002` | `eth_chainId` via `https://rpc.testnet.arc.io` |
| Deployment block | `62906924` | receipt reads for all three CREATE transactions |
| Deployer / owner | `0xb8bdcc633cd8e67250358d807918f99dc0c14d52` | `owner()` on all three contracts |
| MerchantSimulator | `0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F` | bytecode + CREATE receipt |
| PactCreditPool | `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B` | bytecode + CREATE receipt |
| PactCardController | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` | bytecode + CREATE receipt |
| Merchant recipient | `0xCb051F15436C352c6498Ec8702246FeaEdD35bB4` | `merchants(merchantId)` |
| Merchant active | `true` | `isMerchantActive(merchantId)` |
| Merchant total received | `0` | `merchants(merchantId)` |
| Pool balance | `1000000000000000000` | `availableBalance()` |

Wiring reads matched the deployment triangle: merchant.pool → pool, pool.controller
→ controller, pool.merchant → merchant, and controller.pool/controller.merchant
→ the expected contracts.

## Deployment Transactions

These hashes are matched to contracts by live receipt `contractAddress`:

| Contract | Transaction |
|---|---|
| MerchantSimulator | `0x0c243c630708c55154b480edeea72f66ecb1d03eb4f2213f680aed03c0e6ed5f` |
| PactCreditPool | `0xd3b477ce6d7a75f6e05e1bacefc46d905be9444299751e93328f8c5a638fe8d9` |
| PactCardController | `0x51f92d8b48d8288df8d5ffebf0b5e3c762bcbe5284720a239b2801abb86af025` |

All three receipts returned status `1` and block `62906924`.

## Artifact Reconciliation

The authoritative artifact is
`contracts/broadcast/DeployPaymentSystem.s.sol/5042002/run-latest.json`.
Its `receipts` section matches the live receipt mapping above. Its `transactions`
section, however, associates the first two deployment hashes and the controller
hash with different contract names/addresses. This report does not rewrite the
historical artifact. The verifier records the discrepancy in its JSON output;
receipt `contractAddress` plus live bytecode/state are used as the runtime
source of truth.

## Source Links

- MerchantSimulator: https://explorer.testnet.arc.io/address/0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F#code
- PactCreditPool: https://explorer.testnet.arc.io/address/0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B#code
- PactCardController: https://explorer.testnet.arc.io/address/0x7A474c005433DEf5fC496D2016F6Ae794EDFC423#code

These are canonical explorer code pages; source-verification status was not
mutated or inferred from the URL and remains an operator follow-up.

## Verification Command

```bash
node scripts/verify-arc-deployment.mjs --config config/networks/arc-testnet.json
```

The command is read-only. It exits successfully when runtime checks pass, while
reporting artifact transaction discrepancies for reconciliation.
