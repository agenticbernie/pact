# Pact v1 — Arc Network Facts (official sources only)

Date: 2026-09-19 · Sources: `https://docs.arc.io/*` (official Arc docs, fetched 2026-09-19).
No blogs, community posts, or secondary sources used for network parameters.
Nothing in this file is hard-coded into source; values enter code only via
`config/networks/arc-testnet.json` after live preflight (BƯỚC 4 creates the boundary, not the values).

## CONFIRMED (official docs)

| Fact | Value | Source |
|---|---|---|
| Network name | Arc Testnet | docs.arc.io/arc/references/connect-to-arc |
| Chain ID | `5042002` (`0x4CEF52`) | connect-to-arc, rpc-endpoints, integrate/infrastructure |
| Primary RPC (HTTPS) | `https://rpc.testnet.arc.io` | rpc-endpoints |
| Primary RPC (WS) | `wss://rpc.testnet.arc.io` | rpc-endpoints |
| Alt RPCs | `https://rpc.blockdaemon.testnet.arc.io`, `https://rpc.drpc.testnet.arc.io`, `https://rpc.quicknode.testnet.arc.io` | rpc-endpoints |
| Explorer | `https://testnet.arcscan.app` | connect-to-arc |
| Gas tracker | `testnet.arcscan.app/gas-tracker` | rpc-endpoints |
| Faucet | `faucet.circle.com` | rpc-endpoints |
| Native gas token | USDC (NOT ETH) | integrate/wallets/add-arc-to-a-wallet |
| Native decimals | 18 (native interface) / 6 (ERC-20 interface `0x3600…0000`), one shared balance | evm-differences, bridges |
| EVM compatibility | EVM-compatible L1; Solidity/Foundry/Hardhat/viem/ethers work; deploy unchanged in most cases | evm-differences |
| EVM target | Osaka hard fork baseline (incl. EIP-7702); select Amsterdam features (EIP-7708 native Transfer logs) | evm-differences |
| Finality | Deterministic, instant; 1 confirmation sufficient for offchain systems | evm-differences, bridges |
| Block time | Sub-second (~500ms); timestamps non-decreasing (may repeat, 1s granularity) | bridges, evm-differences |
| Min base fee | 20 Gwei; txs below are silently dropped (no receipt, never in block) | evm-differences |
| Base fee destination | Paid to block beneficiary, not burned | evm-differences |
| `address(0)` value transfers | REVERT with "Zero address not allowed" (zero-value calls to 0x0 succeed; mint/burn via precompile only) | evm-differences |
| `PREVRANDAO` | Always `0` (no onchain randomness; use oracle/VRF) | evm-differences |
| Blob txs (EIP-4844) | NOT supported; mempool rejects type-3; `BLOBHASH=0`, `BLOBBASEFEE=1` | evm-differences |
| `SELFDESTRUCT` | EIP-6780 + native rules; non-zero call to destructed account REVERTS; success emits Transfer log | evm-differences |
| EIP-4788 beacon roots | Omitted (reads return empty); EIP-2935 history contract functional | evm-differences |
| Blocklist | Enforced at runtime; transfers to/from blocklisted revert (gas still consumed) | add-arc-to-a-wallet, evm-differences |
| CCTP domain | `26` (canonical USDC bridge) | infrastructure, on-off-ramps |
| Local simulation | `anvil` CANNOT reproduce Arc behavior; use Arc Foundry `arc-anvil --network arc` | evm-differences |
| viem support | Arc Testnet is a built-in viem chain | connect-to-arc |
| Account abstraction | ERC-4337 supported (Biconomy, Pimlico, ZeroDev, Circle Wallets) | add-arc-to-a-wallet |

## INFERRED (technical reasoning — needs live verify before use)

- I1: Pact payment contracts (controller/pool/merchant, no SELFDESTRUCT, no PREVRANDAO,
  no blobs, `address(0)` as compare-only sentinel) are deploy-compatible candidates.
  Verify by: Foundry build with Osaka EVM target + deploy dry-run on Arc Testnet.
- I2: `PactCreditASC` (needs `0xFD2` precompile + ASCBase) has NO Arc counterpart in
  official docs → presumed not portable. Verify by: explicit "no" from Arc contract
  addresses reference (`/arc/references/contract-addresses`) or deploy-revert evidence.
- I3: Receipt + `PaymentSettled` event two-signal rule transfers unchanged; confirmation
  threshold can drop to 1 given deterministic finality. Verify by: live receipt test.
- I4: Executor gas logic must set `maxFeePerGas ≥ 20 Gwei` and treat "no receipt"
  (silently dropped) as uncertain — consistent with existing reconciler. Verify live.

## UNKNOWN (never hard-code)

- U1: Arc mainnet parameters (out of scope; testnet only).
- U2: Faucet rate limits / exact claim flow (see faucet.circle.com at lane time).
- U3: Third-party RPC rate limits for Blockdaemon/dRPC/QuickNode endpoints.
- U4: Exact `eth_getLogs`/indexer behavior for ArcScan links in receipts.
- U5: Whether Arc Testnet resets state periodically (affects deployment manifests).

## BLOCKER (need Bernie confirmation / access before any live lane)

- B1: Funded deployer wallet with testnet USDC (faucet claim) — required before deploy.
- B2: Explicit approval for the Arc live lane (deploy + tx), same bar as Phase 07 live lane.
- B3: Decision on verified-credit source on Arc (no ASC): owner-funded path vs new
  attestor vs remove-from-MVP (see migration plan Track A).
- B4: Confirmation that `arc-anvil` (Arc Foundry) is the accepted local sim, or scope
  local tests to standard Anvil + documented Arc deltas.

## Compatibility decision (initial; migration plan owns final)

| Item | Decision |
|---|---|
| PactCardController core / pool / merchant / types / errors | Có thể giữ nguyên (redeploy candidate, I1 to verify) |
| `NATIVE_ASSET = address(0)` sentinel (comparisons) | Có thể giữ nguyên; value-transfers to 0x0 forbidden — adapter review of forwards |
| Asset descriptor `native-testnet-ctc` | Cần adapter → `arc-testnet-usdc` (18 native / 6 ERC-20 display) |
| Network config (`chainId`, RPC, explorer, `CREDITCOIN_CHAIN_IDS`) | Cần adapter → Arc registry (5042002, rpc.testnet.arc.io, testnet.arcscan.app) |
| `assertDeploymentReady` verifier gate (0xFD2) | Cần adapter → drop/conditionalize for Arc |
| `PactCreditASC` + `PactCreditSource` + proof worker | Cần loại khỏi MVP Arc-lane (legacy, keep files) unless B3 decides attestor |
| `ascAuthority` hook on controller | Cần adapter (rebind) or Cần loại khỏi MVP |
| Foundry config (`shanghai`) | Cần port → Osaka EVM target for Arc builds |
| Explorer/receipt links | Cần adapter → ArcScan URL shape |
| Preflight chain-id check | Cần adapter → 5042002 |

## A2 live-observation addendum (2026-09-19T11:05Z, read-only, additive)

Earlier sections preserved verbatim. New observations from A2
(`pact-v1-arc-a2-read-only-preflight.md`):

- Chain ID 5042002 CONFIRMED live (`eth_chainId` + `net_version`).
- RPC reachable, valid JSON-RPC shapes; blocks advancing sub-second
  (62904157 → 62904187); latest header #62904187 @ 11:05:07Z, 9 txs, baseFee 20 Gwei.
- Fee floor holds live: baseFee exactly 20 Gwei, gasPrice 25 Gwei — policy compatible.
- Explorer canonical host is `explorer.testnet.arc.io` (official docs index +
  live 301 from `testnet.arcscan.app` → 200). Config updated accordingly.
- Faucet reachable (HTTP 200, Next.js `/en/faucet`); flow/limits UNKNOWN.
- New CONFIRMED detail (official llms.txt): EIP-7708 USDC Transfer system emitter
  `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` — record for receipt/indexer work.
- `verified` stays `false` (observation, not deployment-grade evidence).
