# Pact v1 Arc Verified-Credit Operating Policy

Status: **Bounds DEFINED. Live authority provisioning NOT APPROVED.**

Date: 2026-09-19 · Scope: procedural operating policy only. No live credit
application, card creation, payment, redeployment, broadcast, key use, Neon
operation, OpenAI call, commit, or push was performed.

## 1. Approved bounds

| Parameter | Value | Base units / duration | Enforcement |
|---|---|---|---|
| Credit amount cap | 0.1 USDC | `100000000000000000` | Procedural |
| First-test payment amount | 0.01 USDC | `10000000000000000` | Procedural / test policy |
| Credit expiry duration | 20 minutes | `1200` seconds | Procedural + contract future-expiry check |
| Settlement asset | Native Arc USDC | `address(0)`, 18 decimals | Contract + shared descriptor |
| Pool precondition | Balance exceeds payment amount | Read-only check | Fail closed |
| Evidence ID | Fresh, non-zero, never reused | `bytes32` | Procedural + on-chain `usedEvidence` |

Base-unit math: `0.1 × 10^18 = 100000000000000000`;
`0.01 × 10^18 = 10000000000000000`. No ERC-20 path is used.

These bounds are testnet operating policy, not protocol-level on-chain caps.
The deployed controller enforces nonzero amount, future expiry, authority-only
caller, and unused evidence ID, but it does not know the 0.1 / 0.01 / 20-minute
bounds. The operator must fail closed on any bound breach.

## 2. Testnet-only disclosure

Testnet demo allowance only. Not real-world credit, underwriting,
creditworthiness, identity, production funds, fiat settlement, or reusable
credit history. Every UI/report must label provenance explicitly.

## 3. Role separation

| Role | Identity | Allowed action |
|---|---|---|
| Owner/deployer | Existing deployer | Set one-time authority, create/configure card |
| Credit authority | Fresh burner EOA | Apply one bounded verified credit |
| Agent | Separate burner EOA | Submit payment only |
| Merchant recipient | Existing recipient | Receive settlement |
| AI/backend | Server-side | Generate intent only, never grant credit |

Live burner addresses are `PENDING LIVE SETUP` and never appear in source,
fixtures, logs, or evidence except as redacted read-only observations.

Rules:

- Authority must not equal owner or agent.
- Agent must not equal owner or authority.
- AI has no grant/modify authority.
- Agent must never self-grant.
- Authority grants exactly one disposable test.
- Missing identity, overlapping roles, unknown pool balance, or uncertain
  reads all fail closed with no mutation.

## 4. Operator fail-closed rules

- Credit amount zero or above cap: reject, no grant.
- Payment amount above first-test policy: reject, no submission.
- Expiry above 20 minutes, zero, or already past: reject, no grant.
- Zero, malformed, or reused evidence ID: reject, no grant.
- Overlapping or missing identities: stop, no mutation.
- Unknown or insufficient pool balance: stop, no funding retry.
- Any receipt/event/decoder uncertainty: never settled, never retried by
  resubmission.

## 5. Local validation

Pure procedural checks live in `packages/domain/src/arc-credit-policy.ts` with
coverage in `packages/domain/test/arc-credit-policy.test.ts`. They prove the
operator policy only and do not pretend the caps are enforced on-chain.
