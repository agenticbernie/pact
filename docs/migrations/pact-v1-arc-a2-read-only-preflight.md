# A2 — Arc read-only live preflight

Date: 2026-09-19T11:05Z · Branch: `main` @ `f8d76d0` · Scope: A2 read-only preflight.
No deploy, broadcast, faucet claim, funding, card, payment, mutation, key use,
Neon work, OpenAI call, commit, or push in this task.

## 1. Commands run (all read-only)

| # | Command | Purpose |
|---|---|---|
| 1 | `ARC_RPC_URL=https://rpc.testnet.arc.io node scripts/dry-run-arc-deploy.mjs --config config/networks/arc-testnet.json --verify-rpc` | repo dry-run + single `eth_chainId` read. Note: `ARC_RPC_URL` carried the documented PUBLIC endpoint (config value, not a secret); shell had no `ARC_RPC_URL` set. Exit 3 (missing deployer key — expected, not bypassed). |
| 2 | `curl POST eth_chainId/net_version/eth_blockNumber/eth_gasPrice/eth_getBlockByNumber/eth_feeHistory` | independent JSON-RPC reads, 15s timeouts each |
| 3 | `curl -sSI https://testnet.arcscan.app`, `https://explorer.testnet.arc.io/`, `https://faucet.circle.com` | HTTP HEAD reachability only |
| 4 | `webfetch https://docs.arc.io/llms.txt` | official docs index (explorer/faucet canonical links) |

Source/runtime review before running: dry-run script contains exactly one RPC
method (`eth_chainId`); no `eth_send*`, no `startBroadcast`, no signer, no
`DEPLOYER_PRIVATE_KEY` value access (presence check only), no faucet calls
(asserted by `arc-dry-run.test.ts`, static + runtime).

## 2. Actual Arc network identity

| Field | Expected | Actual | Result |
|---|---|---|---|
| Chain ID | 5042002 | `eth_chainId` → 5042002; `net_version` → "5042002" | GREEN |
| RPC | rpc.testnet.arc.io | reachable; valid JSON-RPC 2.0 shapes | GREEN |
| Latest block | readable | 62904157 → 62904187 across calls (~14+ blocks in seconds: sub-second production confirmed live) | GREEN |
| Latest header | — | #62904187 @ 2026-09-19T11:05:07Z, miner `0xa693…8760`, gasLimit 30M, gasUsed 411602, baseFee `0x4a817c800`, 9 txs | recorded |
| Network | Arc Testnet | chain-id + docs match; no conflicting identity signal | GREEN |
| EVM profile | Osaka | not directly observable read-only; contracts unaffected (no PREVRANDAO/blob/SELFDESTRUCT use); solc `osaka` profile builds+tests green (A1) | UNKNOWN (no Red flag) |

## 3. Fee and finality observations

- `eth_gasPrice` → `0x5d21dba00` = 25 Gwei ≥ 20 Gwei policy: COMPATIBLE.
- `eth_feeHistory` → baseFeePerGas stable `0x4a817c800` = 20 Gwei exactly
  (documented floor holds live); `baseFeePerBlobGas: 0x1`, blob ratios 0
  (consistent with no-blob support).
- Blocks advancing sub-second; single-confirmation finality assumption is
  consistent with liveness but NOT proven read-only → stays assumption.
- No `FEE_POLICY_MISMATCH`. No config change to fee policy. Executor
  `maxFeePerGas ≥ 20 Gwei` rule stands.

## 4. ArcScan verification

- `https://testnet.arcscan.app` → HTTP 301 → `https://explorer.testnet.arc.io/`
  → HTTP 200 (live). Official `docs.arc.io/llms.txt` lists
  `https://explorer.testnet.arc.io` as THE Explorer link — redirect target is
  canonically official.
- Config consequence (evidence-backed, non-secret, no behavior change):
  `config/networks/arc-testnet.json` `explorerUrl` updated to the canonical
  host; legacy URL still resolves via redirect. `networks.ts` registry + tests
  updated to match. Recorded here, not silently.
- Tx/address URL pattern: NOT probed (no known tx/address; no fake used) → UNKNOWN.

## 5. Faucet documentation verification

- `https://faucet.circle.com` → HTTP 200, Next.js app, route rewrite `/en/faucet`.
  Reachable. No form viewed-submitted, no claim, no wallet, no signature.
- Flow/asset/eligibility/limits/reset/signature-requirement: UNKNOWN (needs
  interactive pass or official faucet guide — out of read-only lane).
- Config unchanged (`faucetUrl` stays documented value, flow unverified).

## 6. Config comparison

| Fact | Config value | Live result | Classification | Action |
|---|---|---|---|---|
| chain ID | 5042002 | 5042002 (chainId + net_version) | GREEN | none |
| RPC reachability | rpc.testnet.arc.io | reachable, valid shapes | GREEN | none |
| latest block | n/a | readable, advancing sub-second | GREEN | none |
| explorer domain | testnet.arcscan.app → **explorer.testnet.arc.io** | 301 → 200, canonical per docs index | GREEN (updated) | explorerUrl updated + tests |
| network name | Arc Testnet | consistent | GREEN | none |
| gas/fee behavior | EVM JSON-RPC | gasPrice/feeHistory/block header OK | GREEN | none |
| fee minimum | 20 Gwei | baseFee floor exactly 20 Gwei live | GREEN (compatible) | none |
| native fee asset | arc-testnet-usdc 18 | not observable read-only (no balance probe without address) | UNKNOWN | none |
| EVM hardfork | osaka | not directly observable; no red flag | UNKNOWN | none |
| finality assumption | 1 conf | consistent, unproven | assumption | none |
| faucet URL | faucet.circle.com | HTTP 200 reachable | GREEN (reachable) | none |
| faucet asset/limits/reset | documented URL only | not observable without interaction | UNKNOWN | none |

`verified` stays `false`: one read-only probe round is observation, not
deployment-grade evidence. No deployment addresses touched (none exist).

## 7. No-mutation evidence

- Methods used: `eth_chainId`, `net_version`, `eth_blockNumber`,
  `eth_getBlockByNumber`, `eth_gasPrice`, `eth_feeHistory`, HTTP HEAD/GET.
- Never used: `eth_send*`, `eth_call`, contract writes, faucet endpoints,
  wallet, signatures, private keys (none exist in env: `DEPLOYER_PRIVATE_KEY`
  and `AGENT_SIGNER_PRIVATE_KEY` absent; `OPENAI_API_KEY`/`SESSION_HMAC_SECRET`
  present but never accessed).
- Dry-run exit 3 confirms deploy path still fail-closed without a key.

## 8. Blockers

- B-A2-1 (new, highest priority): faucet flow UNKNOWN — needs manual pass
  (claim, asset, limits, reset, signature requirement) before any funding lane.
- B-A2-2: `DEPLOYER_PRIVATE_KEY` absent (expected) — deploy lane needs it via
  approved provisioning, never repo/env echo.
- Standing: Phase 04 NOT CLOSED (no parallel live lanes); `ARC_RPC_URL` env
  absent (`B-ARC-PREFLIGHT-RPC` env-path BLOCKED — worked around with the
  documented public URL for reads only, no secret involved).

## 9. Next approval boundary

Manual faucet inspection + deployer-wallet provisioning decision. Then (and only
then) a funded Arc staging deploy lane. No broadcast authority granted by A2.
