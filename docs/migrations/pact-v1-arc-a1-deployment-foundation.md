# A1 — Arc deployment foundation (CONFIGURATION ONLY)

Date: 2026-09-19 · Branch: `main` · Scope: task A1 from
`pact-v1-arc-neon-migration-plan.md`. No live deploy, broadcast, faucet claim,
payment, Neon work, or commit/push in this task.

## 1. Task scope

Create the Arc Testnet configuration, the Osaka EVM profile, and a deploy
dry-run boundary with USDC faucet preparation (manual claim info only).
Foundation/configuration — the Arc grant MVP critical path stays:
settlement → policy → Neon backend → OpenAI intent → execution → demo.

## 2. Approved decision A (locked)

Verified-credit is NOT in the Arc MVP. ASC/Creditcoin stay as legacy
implementation + compatibility surface + future extension, off the critical
path. No Creditcoin/ASC code deleted, Phase 03 untouched, no new
credit-evidence contract on Arc, verified-credit excluded from the Arc payment flow.

## 3. Arc config decisions

- New `config/networks/arc-testnet.json` beside (never overwriting)
  `advance-testnet.json`. Values transcribed from official docs.arc.io
  (connect-to-arc, rpc-endpoints, 2026-09-19) with per-field `source`.
- Extended `ChainNetworkConfig` (`packages/domain/src/networks.ts`) with the
  required groups: `evmProfile` (shanghai|osaka), `feePolicy`
  ({minBaseFeeGwei, confirmations}, nullable when unknown),
  `rejectsZeroAddressValue`, `deploymentStatus`, `deployedContracts` (empty —
  never faked), `supportedFeatures`/`unsupportedFeatures`
  (Arc lists `verified-credit` + `erc20-settlement` as unsupported),
  `faucetUrl`+`faucetSource` (official faucet.circle.com, flow unverified),
  `verified` (false), `source`.
- `verified-credit`/ASC is not a field of the Arc config at all — it cannot
  become required. Creditcoin registry entry unchanged (shanghai, feePolicy
  null = unknown, faucet null = unknown).
- Loaders: `loadArcTestnetConfig`/`parseArcTestnetConfig` (file-or-object,
  strict, rejects non-Arc input). `assertArcChainIdentity` is a pure
  read-only assertion (caller-supplied observation; never touches network).
  `requireVerifiedNetwork` still rejects the Arc entry (`verified:false`).

## 4. Osaka profile decisions

- `[profile.arc]` in `contracts/foundry.toml`: explicit standalone profile
  (all keys repeated), `solc 0.8.30`, `evm_version = "osaka"`, `out = "out-arc"`.
  Default profile byte-identical behavior (shanghai).
- Compatibility: solc 0.8.30 ACCEPTS `osaka` — `FOUNDRY_PROFILE=arc forge build`
  exit 0, full suite 101/101 green under Osaka. No toolchain blocker.
- `contracts/out-arc/` added to `.gitignore` (mirrors `out/`, `cache/`, `broadcast/`).

## 5. Dry-run behavior (`scripts/dry-run-arc-deploy.mjs`, `yarn dry-run:arc`)

Validates config structurally → prints network/live status → prints deploy set
(MerchantSimulator → PactCreditPool → PactCardController, in order) → prints
exclusions (PactCreditASC: no 0xFD2 on Arc; PactCreditSource: out of lane) →
prints fee/0x0/faucet policy → checks env presence by NAME only
(`ARC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`) → exit 3 MISSING_PREREQUISITES fail-closed.
`--verify-rpc` exists but was NOT run (needs live/read-only approval); without it
no network use at all. Never broadcasts/deploys/funds/claims (asserted by test,
both static source scan and runtime output).

## 6. Prerequisites (all still missing — by design)

`ARC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, funded faucet USDC (manual claim at the
documented faucet), live chain-identity observation, Phase-04 freeze decision,
B3 credit-source decision (locked: none for Arc MVP), Arc lane approval.

## 7. No-go conditions

Deploy/broadcast/faucet-claim/fund/card/payment/Neon apply/Neon deploy/OpenAI
change/AI Gateway/verified-credit-on-Arc/deletions/invariant changes/commit-push —
none performed, none authorized by this task.

## 8. Known blockers

- B-LIVE-1: Arc read-only preflight approval (chain-id liveness, faucet flow,
  ArcScan link shape). Needed before any `--verify-rpc` or deploy lane.
- B-LIVE-2: deployer wallet + manual faucet USDC funding.
- B-PHASE-4: Creditcoin Phase 04 still NOT CLOSED — no parallel live lanes.
- Non-blocker: solc/Osaka compatibility PROVEN (build + 101 tests green).

## 9. Next task

Request approval for the Arc read-only live preflight (no mutation): run
`--verify-rpc` + record chain identity, faucet flow, and explorer link shape.
Do NOT proceed to deployment on this task's authority.
