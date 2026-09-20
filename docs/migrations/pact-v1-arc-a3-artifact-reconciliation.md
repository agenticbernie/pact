# A3 Artifact Reconciliation — Pact v1 Arc Deployment

Date: 2026-09-19 · Scope: read-only reconciliation of the Foundry broadcast
artifact, live Arc receipts, Foundry compilation artifacts, deployment manifest,
runtime state, and Arc Explorer source verification.

No deployment, broadcast, mutation, payment, card creation, funding, faucet
claim, secret access, Neon operation, OpenAI call, commit, or push was performed.

## Executive Summary

**A3 DEPLOYMENT EVIDENCE CLOSED.** Live receipts, runtime state, source
verification, Foundry runtime artifacts, and the deployment manifest are
consistent. The historical broadcast artifact has an additive
`ARTIFACT_LABELING_MISMATCH`: its `transactions` rows do not preserve the same
hash-to-contract mapping represented by live receipts. The historical artifact
is preserved unchanged; live receipt `contractAddress` and `to` fields are the
authoritative reconciliation source.

The canonical network config remains `verified: false` and
`deploymentStatus: not-deployed` because that config controls the broader
live-lane authorization boundary, not because the deployed addresses failed
verification.

## Sources

- Broadcast artifact: `contracts/broadcast/DeployPaymentSystem.s.sol/5042002/run-latest.json`
- Live RPC: `https://rpc.testnet.arc.io`, chain `5042002`
- Foundry artifacts: `contracts/out-arc/{MerchantSimulator,PactCreditPool,PactCardController}.sol/*.json`
- Deployment manifest: `config/deployments/arc-testnet.json`
- Verifier: `scripts/verify-arc-deployment.mjs`
- Explorer API: `https://explorer.testnet.arc.io/api?module=contract&action=getsourcecode&address=...`

## Transaction Reconciliation

All ten artifact hashes returned receipt status `1` at block `62906924`. `null`
in `Live created address` means the transaction was a call, not a creation.

| Index | Artifact type | Artifact contract name | Artifact address | Hash | Live receipt status | Live receipt `to` | Live created address | Block |
|---:|---|---|---|---|---:|---|---|---:|
| 0 | CREATE | MerchantSimulator | `0xac030d...4174f` | `0xd3b477...8d9` | 1 | `null` | `0x5e1771...7528B` | 62906924 |
| 1 | CREATE | PactCreditPool | `0x5e1771...7528b` | `0x0c243c...6ed5f` | 1 | `null` | `0xaC030d...4174F` | 62906924 |
| 2 | CREATE | PactCardController | `0x7a474c...fc423` | `0xab064c...e2e8b` | 1 | `0x5e1771...7528B` | `null` | 62906924 |
| 3 | CALL | MerchantSimulator | `0xac030d...4174f` | `0xa7d2f3...ca54f` | 1 | `0x5e1771...7528B` | `null` | 62906924 |
| 4 | CALL | PactCreditPool | `0x5e1771...7528b` | `0xa3d0aa...1a4fe` | 1 | `0x7A474c...fc423` | `null` | 62906924 |
| 5 | CALL | MerchantSimulator | `0xac030d...4174f` | `0xa9ac1a...913b76` | 1 | `0x5e1771...7528B` | `null` | 62906924 |
| 6 | CALL | MerchantSimulator | `0xac030d...4174f` | `0xd47d13...43575` | 1 | `0xaC030d...4174F` | `null` | 62906924 |
| 7 | CALL | PactCreditPool | `0x5e1771...7528b` | `0x869c2d...ba574` | 1 | `0xaC030d...4174F` | `null` | 62906924 |
| 8 | CALL | PactCardController | `0x7a474c...fc423` | `0x53a0fc...1bedd0` | 1 | `0xaC030d...4174F` | `null` | 62906924 |
| 9 | CALL | PactCreditPool | `0x5e1771...7528b` | `0x51f92d...af025` | 1 | `null` | `0x7A474c...fc423` | 62906924 |

The full unabridged values are emitted by the verifier JSON output. Creation
transactions are assigned by live receipt `contractAddress`:

| Contract | Creation TX |
|---|---|
| MerchantSimulator | `0x0c243c630708c55154b480edeea72f66ecb1d03eb4f2213f680aed03c0e6ed5f` |
| PactCreditPool | `0xd3b477ce6d7a75f6e05e1bacefc46d905be9444299751e93328f8c5a638fe8d9` |
| PactCardController | `0x51f92d8b48d8288df8d5ffebf0b5e3c762bcbe5284720a239b2801abb86af025` |

## Contract and Runtime Evidence

| Contract | Final address | Runtime bytecode | ABI/selector evidence | Source verified |
|---|---|---|---|---|
| MerchantSimulator | `0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F` | exact hash match | 10 functions | yes, Explorer API status `1` |
| PactCreditPool | `0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B` | exact after immutable masking | 10 functions | yes, Explorer API status `1` |
| PactCardController | `0x7A474c005433DEf5fC496D2016F6Ae794EDFC423` | exact after immutable masking | 26 functions | yes, Explorer API status `1` |

Immutable masking is required for the pool/controller comparison because their
compiled runtime artifact contains constructor-dependent immutable slots while
live runtime code contains the resolved addresses. Constructor arguments in
Explorer verification match the deployment triangle.

Runtime reads are GREEN:

- all three addresses contain non-empty bytecode;
- all three owners equal `0xb8bdcc633cd8e67250358d807918f99dc0c14d52`;
- `MerchantSimulator.pool()` points to the pool;
- `PactCreditPool.controller()` points to the controller;
- pool and controller merchant/pool references match the triangle;
- merchant recipient is `0xCb051F15436C352c6498Ec8702246FeaEdD35bB4`;
- merchant is active and total received is `0`;
- pool balance is `1000000000000000000`.

## Root-Cause Classification

**`ARTIFACT_LABELING_MISMATCH`**

Evidence: the artifact’s CREATE rows label hash `d3b477...` as
`MerchantSimulator`, while its live receipt creates `PactCreditPool`; hash
`0c243c...` is the inverse; the artifact’s labeled controller CREATE hash
`ab064c...` is a live call, while hash `51f92d...` creates the controller.
All receipts succeed at the same block, and live bytecode/state/source
verification identify one consistent deployment. This is not a runtime or
manifest address mismatch.

## Security Review

- Only `eth_chainId`, transaction, receipt, code, and view calls were used.
- No signer, private key, mutator, faucet, payment, card, or fund operation was
  accessed.
- Historical artifact and prior reports were not rewritten.
- No sensitive environment values are present in this note.
- First payment remains outside this closeout and is not authorized by it.

## Remaining Unknowns

- The exact Foundry serialization/order cause of the historical transaction-row
  mismatch is not proven from the artifact alone.
- Arc finality beyond the configured one-confirmation policy remains outside
  this read-only reconciliation.
- This closeout does not verify any payment, card, indexer, Neon, AI, or ASC
  flow.

## Closeout Decision

A3 deployment evidence is **CLOSED** for deployment identity and runtime
verification. The historical artifact discrepancy is explained and classified,
not erased. First payment testing remains a separate approval boundary.
