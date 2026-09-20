# Pact v1 — Arc + Neon Migration Plan (product identity unchanged)

Date: 2026-09-19 · Status: PLAN ONLY — no implementation beyond BƯỚC 4 foundation.
Inputs: `pact-v1-arc-neon-current-state-audit.md`, `pact-v1-arc-network-facts.md`,
`pact-v1-neon-backend-facts.md`. Pact remains Pact v1 (testnet-only programmable
virtual spending card, one agent). No Pact v2. No product-scope change.

## 0. Decisions locked by this plan

- Settlement target: Arc Testnet (chain 5042002, USDC gas). Creditcoin Advance
  Testnet becomes legacy/compatibility surface under evaluation.
- Backend target: Neon Lakebase Postgres + Neon Functions. Supabase/Cloudflare
  become legacy; Cloudflare Worker stays during migration, cutover decided later.
- AI provider now: pure OpenAI API server-side in Neon Functions. Neon AI Gateway:
  boundary only, no wiring.
- ASC/Creditcoin logic: never deleted hastily; classified legacy / adapter / port
  per audit §5; files untouched until their track opens.

## Track A — Arc settlement migration

A1. Network config: add `config/networks/arc-testnet.json` (chainId 5042002, RPC,
  ArcScan, `arc-testnet-usdc` asset) beside — never overwriting — advance-testnet.json.
  Generic `ChainNetworkConfig` registry with `verified:false` default (BƯỚC 4).
A2. Chain client: `agent-executor/chain-client.ts` gains Arc transport (RPC URL +
  chain-id assert 5042002, `maxFeePerGas ≥ 20 Gwei` policy, dropped-tx = uncertain).
A3. Foundry config: Osaka EVM target profile for Arc builds; keep shanghai profile
  for legacy; `arc-anvil` (Arc Foundry) evaluated for local sim (BLOCKER B4 facts).
A4. Deployment scripts: `DeployPaymentSystem.s.sol` reused with `--rpc-url` Arc +
  USDC funding (faucet.circle.com); new `config/deployments/arc-payment.json` manifest.
A5. Contract compatibility: redeploy controller/pool/merchant/types/errors unchanged
  (I1 verify: build + 12-case matrix + invariants on Arc lane); `PactCreditASC` +
  `PactCreditSource` EXCLUDED from Arc deploy (no 0xFD2).
A6. Native asset settlement: `arc-testnet-usdc` descriptor (18 native / 6 ERC-20
  display, ÷1e12 display-only); audit every `msg.value` forward for 0x0-target and
  USDC-vs-balanceOf mixing; pool accounting stays base-units.
A7. Explorer/receipt handling: ArcScan link shape; receipt+`PaymentSettled` two-signal
  rule unchanged; confirmations → 1 (deterministic finality, verify live).
A8. Test strategy: Forge suite re-run under Osaka profile → Arc dry-run (faucet USDC)
  → allowed payment → over-limit/unallowlisted/expired/replay rejections → receipt verify.

## Track B — Neon backend migration

B1. Database schema: port both Supabase migrations to Neon tooling; keep table
  contracts byte-identical where possible; RLS deny matrix reviewed per Neon Data API
  + RLS model (G22-equivalent branch diff must be reconciled, not assumed).
B2. SQL migrations: new `neon/migrations/` chain replaying Supabase history; preview
  branch per migration PR (copy-on-write with data — no seed scripts).
B3. Persistence ports: keep port types; swap transport config (Data API base URL +
  JWT/JWKS headers). PostgREST DSL unchanged (official compat). CLOSE the
  `payment_attempts` adapter gap (new code, first-class).
B4. Neon Postgres adapter: `DATABASE_URL` server-side; Data API for edge-reachable
  reads; direct driver where TCP allowed.
B5. Neon Functions structure: port 3 entrypoints to Node/Hono shape; pure handler
  logic unchanged; `Deno.serve`/`deno.json`/`config.toml` retired per-function.
B6. Auth/session: KEEP HMAC wallet challenge/session (`session-token.ts` + session
  functions). Managed Better Auth: out of MVP (no Web3 sign-in).
B7. Secrets: `OPENAI_API_KEY`, `SESSION_HMAC_SECRET` via Neon function env
  (Dashboard/CLI, never repo); `neon env pull` for local; decide region explicitly
  (`us-east-1` expected vs past `ap-southeast-1` observed).
B8. Object storage: out of MVP (no Pact file use-case); no code.
B9. OpenAI provider: move `openai-provider.ts` + port + pin unchanged; fail-closed,
  retry-once, `store:false`, strict schema preserved; server-side only.
B10. Future AI Gateway seam: `AiProviderId` union (`"openai"` only; `"neon-ai-gateway"`
  rejected fail-closed) + test asserting no `NEON_AI_GATEWAY_*` reference (BƯỚC 4).

## Track C — Frontend and SDK

C1. Wallet/network switching: Arc Testnet (5042002) as selectable testnet; EIP-3085
  params (`0x4CEF52`, USDC 18, rpc.testnet.arc.io, testnet.arcscan.app).
C2. Addresses/ABI: SDK regen from Arc deployment; Anvil/Creditcoin address books kept.
C3. Read model: consume Neon read endpoints; receipt truth still receipt+event.
C4. API base URLs: edge/Neon function URLs configurable; no secret in bundle.
C5. Testnet-only disclosures: Arc Testnet + testnet-USDC-no-value banner before
  setup/payment (same bar as current CTC disclosure).

## Track D — Verification and demo

D1. Local: typecheck, lint, Vitest (incl. new boundary tests), AICD, secret scan,
  Forge suite (both EVM profiles), `git diff --check`.
D2. Contract tests on Arc lane: policy matrix, invariants, atomicity (reverting
  recipient), nonce replay, expiry/caps/allowlist.
D3. Neon Function tests: session/intent/preflight/execute mirrors re-pointed to
  Data API transport; persistence contracts (G18–G21 equivalents).
D4. Integration: edge→Neon→OpenAI(mock)→preflight(mock-chain) smoke, zero live calls.
D5. Arc Testnet dry run (approved lane): deploy + fund (faucet USDC) + readback.
D6. Successful payment + policy rejection paths + receipt verification (ArcScan).

## Dependency graph & critical path

```
BƯỚC4 foundation ─▶ A1 ─▶ A2/A3 ─▶ A4/A5 (dry-run) ─▶ A6/A7 ─▶ A8 ─▶ D5/D6
                └▶ B1/B2 ─▶ B3/B4 ─▶ B5/B6/B7 ─▶ B9 ─▶ D3 ─▶ D4 ─▶ C1..C5 ─▶ D6
Phase-04 Creditcoin lane: FREEZE/CLOSE decision (user) before any Arc/Neon live lane.
Critical path: foundation → A1 → A5 → B1 → B5 → D4 → C → D6.
```

## Rollback strategy

- Every track is additive-first: new configs beside old; no Supabase/Creditcoin
  deletion until the Neon/Arc lane is USER-VERIFIED.
- Contract deploy on Arc is fresh state (no migration of chain state); rollback =
  keep Creditcoin deployment as fallback demo target, recorded in manifest.
- DB rollback = Neon branch restore (point-in-time) + previous function deployment;
  Supabase staging untouched until cutover approval.
- Any live-lane failure → bounded blocker artifact (same convention as Phase 03/04),
  local gates stay green, no fake green.

## Legacy compatibility strategy

- `contracts/src/PactCreditASC.sol`, `PactCreditSource.sol`, `services/asc-proof-worker/`,
  `config/asc/`, ASC manifests: frozen legacy; builds keep compiling (shanghai profile).
- `config/networks/advance-testnet.json`: frozen; preflight still fail-closes correctly.
- Supabase functions/migrations: frozen after Phase-04 decision; Neon ports live beside.
- Removal (if ever) requires: USER-VERIFIED Arc+Neon lane + explicit removal approval +
  archive commit. Not in this plan.

## Security boundaries (invariants, unchanged)

One-send; store-txHash-before-wait; receipt reconciliation; never second-submit;
AI never edits policy; strict intent schema; fail closed on AI/provider/chain doubt;
OpenAI key server-side only; no secrets in source/fixtures/bundles/logs/evidence;
disposable testnet wallets/funds only; no mainnet; no production/staging mutation
without explicit lane approval; min base-fee + dropped-tx-uncertain on Arc.

## Explicit no-go conditions (stop the lane)

- Arc chain-id/RPC/explorer not live-verified at lane time.
- No funded faucet USDC for deployer/agent wallets.
- `OPENAI_API_KEY` / `SESSION_HMAC_SECRET` not provisioned in Neon env.
- Neon region undecided or mismatched (`expected` vs `actual`).
- Verified-credit source on Arc undecided (B3) — payments would fail closed forever.
- Any secret-shaped value near repo; any production/staging mutation attempt.
- Phase-04 Creditcoin lane still live-mutating in parallel (interleave forbidden).

## Definition of done (migration MVP)

1. Arc Testnet deployment (controller/pool/merchant) from unchanged sources +
   manifest parity-checked against `arc-testnet.json` (`verified:true` after preflight).
2. One funded card + one agent payment settled (receipt + PaymentSettled + ArcScan link).
3. Blocked paths demonstrated (over-limit, unallowlisted, expired, replay) with zero
   unintended transfer.
4. Neon Functions serving session/intent/preflight/execute against Neon Postgres
   (Data API transport), OpenAI relay pinned, HMAC sessions intact.
5. Fresh H-lanes (model/preflight/health) green on Neon; G22-equivalent parity green.
6. All D1–D4 gates green from clean checkout; evidence packs redacted; no secrets.
7. User approval recorded; Creditcoin/Supabase lanes explicitly frozen or cut over.

## Recommended next implementation task (single, highest priority)

**Close-or-freeze decision for the Phase-04 Creditcoin lane + B3 verified-credit
decision.** Without these two user calls, Track A lane work (deploy) and Track B
live work (provision) cannot start; only additive Track A1/B-side scaffolding can
proceed. Exact next code task after approval: A1 `arc-testnet.json` + Osaka profile
+ deploy dry-run (faucet USDC), behind the BƯỚC-4 network boundary.
