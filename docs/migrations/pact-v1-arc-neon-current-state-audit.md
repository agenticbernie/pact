# Pact v1 — Current-State Audit (Creditcoin/Supabase baseline)

Date: 2026-09-19 · Branch: `main` @ `f8d76d0` · Scope: BƯỚC 1, read-only audit
Governance: Vibecode Pro Max Kit (process-compatible artifact, not a phase report).
No implementation source changed in this step. Phase 01–04 reports are preserved
verbatim; conflicts with current code are recorded as findings, history is not rewritten.

## 1. Current architecture

```
Browser (apps/web — NOT BUILT, Phase 06)
  │  session/intent/preflight/execute (HMAC wallet token)
  ▼
Cloudflare Worker (apps/edge: pact-edge, SUPABASE_REGIONAL_FUNCTION_URL, 30/min limiter)
  │  single regional base URL
  ▼
Supabase Edge Functions, Deno (supabase/functions: session / ai-gateway / agent-executor)
  │  ai-gateway ──raw fetch──▶ OpenAI Responses API (gpt-5.6-luna, store:false, strict json_schema)
  │  agent-executor ──eth_chainId/eth_call──▶ Creditcoin Advance Testnet RPC
  │  all three ──PostgREST fetch──▶ Supabase Postgres (sessions, intents, cards, payment_attempts)
  ▼
Creditcoin Advance Testnet (chain 102031): PactCardController (policy authority)
  + PactCreditPool (native tCTC) + MerchantSimulator + PactCreditASC (0xFD2 precompile)
  ▲ Sepolia (11155111): PactCreditSource emits CreditGranted ──ASC proof──▶ PactCreditASC.execute
```

Settlement truth (unchanged): `settled` only when successful receipt AND matching
indexed `PaymentSettled` event are both present. One-send, store-txHash-before-wait,
receipt reconciliation, no second-submit, AI never edits policy, strict intent schema,
fail closed.

## 2. Implemented capabilities (code exists)

- Domain package (`packages/domain/src`): strict intent schema, canonical hash
  (3 golden vectors, vector 1 cast-verified), network/asset/merchant config loaders,
  15-code API envelope, HMAC session tokens, receipt classifier, evidence records,
  pinned model config. Vitest suite green.
- Contracts (`contracts/src`, Foundry solc 0.8.30, evm `shanghai`): PactTypes,
  PactErrors, PactCardController (lifecycle + 12-case pay/preflight matrix),
  PactCreditPool (real-balance, controller-only settle), MerchantSimulator,
  PactCreditSource (Sepolia emitter), PactCreditASC (ASCBase + inlined EvmV1Decoder).
  101 Forge tests green; Anvil deploy triangle asserted; SDK ABIs generated.
- ASC proof worker (`services/asc-proof-worker`): source-scanner, proof-client,
  idempotent worker, evidence records. 18 worker tests green.
- Backend (`supabase/functions`): session (challenge/verify/revoke), ai-gateway
  (OpenAI relay, retry-once on 502/503/429, merchantId-only output), agent-executor
  (preflight/execute, read-only + signing paths, reconciler). Vitest mirrors +
  Deno CI refs; prefix-aware routing; region gate. Local gates green.
- Persistence: migrations `202609080001` (sessions/intents/payment_attempts) +
  `202609120001` (cards + RLS deny matrix); PostgREST adapters for
  session/intent/card; `payment_attempts` adapter declared but in-mem only in executor.
- Edge (`apps/edge`): 7-route allowlist, 64KB/method/path/auth/rate-limit/correlation
  gates, single-base forwarder. Tests green.
- Scripts: preflight-testnet (fail-closed exit 2 `unverified`), check-no-secrets,
  validate-aicd, print-config, export-contract-artifacts, ASC rehearsal gates.

## 3. Verified capabilities (evidence-backed)

- Phase 01: foundation green (56 domain tests, typecheck/lint/AICD/secret-scan,
  preflight fail-closed). Status CODE DONE, VERIFIED confirmation outstanding.
- Phase 02: ✅ VERIFIED 2026-09-09 (64 Forge tests + 3 invariants ~128k calls,
  Anvil triangle, cast readback incl. `UnauthorizedCaller` revert).
- Phase 03: local 101/101 + worker 18/18 green; Task 5B single-proof live lane
  EXECUTED + EVL PASS (Sepolia recordTx …5248f8 → Advance executeTx …42b91e0752,
  `CreditVerified` card 1 + 1e18, manifest `asc-evidence-rehearsal.json`).
- Phase 04: local EVL GREEN incl. G14–G17 runtime wiring, G31–G33 corrections
  (35 files / 198 tests), G13 staging redeploys SUCCEEDED (session v11,
  ai-gateway v11, agent-executor v12–v13 ACTIVE). See §4 for blockers.

## 4. Unverified / live-gated capabilities (NOT VERIFIED — do not claim)

- Phase 04 H1 BLOCKED (503 REGION_MISMATCH / 401 / CARD_NOT_ELIGIBLE, 0 provider calls).
- Phase 04 H2 BLOCKED (503 PREFLIGHT_DECLINED, no usable eth_call evidence, 0 tx).
- Phase 04 H3 PARTIAL (health 200 but `configuredRegion=ap-southeast-1` vs
  `us-east-1`, `modelAvailable:false`).
- G22 UNKNOWN/DRIFT (linked diff non-empty: payment_attempts RLS + rls_auto_enable trigger).
- Advance Testnet canonical config still `verified:false`; `config/networks/advance-testnet.json`
  holds `.invalid` placeholders (chainId 0). Real RPC/explorer live only in process docs.
- Phase 05–07: PLANNED, not started (no indexer, no web app, no e2e/CI, no deployment manifests).
- Phase 04 overall: NOT VERIFIED / NOT CLOSED. No Phase 05 entry until Phase 04 closes.

## 5. Creditcoin / ASC coupling inventory (must classify, not delete)

| # | Location | Coupling | Class (proposed, BƯỚC 3 decides) |
|---|---|---|---|
| C1 | `contracts/src/PactCreditASC.sol` (whole file, ASCBase + `0xFD2` + EvmV1Decoder) | Creditcoin-native precompile; no Arc equivalent | legacy (retire on Arc; keep file) |
| C2 | `contracts/src/PactCreditSource.sol` | Sepolia-side emitter for ASC lane | legacy (retire unless Arc bridge needs it) |
| C3 | `contracts/src/PactCardController.sol:29,148–184` (`ascAuthority`, `applyVerifiedCreditForAgent`) | ASC-only credit path + dedupe | adapter (rebind to new attestor or owner-only) |
| C4 | `packages/domain/src/schemas.ts:19,22,260–280` (`VERIFIER_PRECOMPILE_ADDRESS`, `CREDITCOIN_CHAIN_IDS`, assertDeploymentReady) | chain allowlist + 0xFD2 gates | adapter (new chain registry) |
| C5 | `packages/domain/src/types.ts:37–55`, `schemas.ts:178–185` (`creditcoin-evm`, `advance-testnet`, `native-testnet-ctc`) | protocol literals | adapter (rename/generalize) |
| C6 | `supabase/functions/_shared/chain-config.ts` (`TARGET_CHAIN_ID=102031`), agent-executor `CREDITCOIN_RPC_URL` | chain pin + env name | adapter |
| C7 | `config/networks/advance-testnet.json`, `config/asc/*`, `config/deployments/asc-evidence-rehearsal.json` | network + ASC manifests | legacy (new per-chain config alongside) |
| C8 | `services/asc-proof-worker/` (7 src + proof-builder URL `prover.cc3-testnet…`) | ASC relay | legacy (keep, no new calls) |
| C9 | Core card/pay/preflight/pool/merchant logic, `NATIVE_ASSET=address(0)` sentinel | generic EVM | keep (redeploy unchanged candidate) |

Portable as-is (redeploy + regen addresses only): PactTypes, PactErrors, pool,
merchant, controller core, DeployPaymentSystem script (takes explicit `--rpc-url`),
SDK ABI shape, domain payment/api/session/model modules.

## 6. Supabase / Cloudflare coupling inventory

- Zero `supabase-js` usage anywhere (grep-verified): persistence is raw PostgREST
  `fetch` (`session-challenge-store.ts:133–154`, `intent-store.ts:141–160`,
  `card-store.ts:123–142`; headers via `buildPostgrestHeaders`, service-role key).
  PostgREST-path DSL (`eq./is.null/gt./select=`) is the coupling surface, not an SDK.
- Env names: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SB_REGION`,
  `SUPABASE_FUNCTION_REGION`/`PACT_EXPECTED_REGION`, `SUPABASE_REGIONAL_FUNCTION_URL`.
- `supabase/config.toml` (`verify_jwt=false` ×3), per-function `deno.json` import maps,
  `Deno.serve` blocks in all three entrypoints, `path-prefix.ts`
  (`/functions/v1/<slug>` normalizer), `region-config.ts`.
- Migrations are portable Postgres core + Supabase idioms (RLS deny matrix,
  `to_regclass`/`pg_constraint` guards); retarget to Neon tooling, keep table contracts.
- Edge: `wrangler.toml` (`SUPABASE_REGIONAL_FUNCTION_URL`, `ALLOWED_ORIGIN`),
  `upstream.ts` single-base forwarder, in-mem limiter (RATE_LIMITER commented out).
- Executor `payment_attempts` has NO PostgREST adapter (in-mem Map only) — gap the
  Neon migration must close, not regress.

## 7. OpenAI integration inventory (server-side only — invariant)

- Single truth: `config/ai/model-config.json` (`openai`/`gpt-5.6-luna`/`allowFallback:false`).
- Only I/O: `supabase/functions/ai-gateway/openai-provider.ts` (raw fetch to
  `/v1/responses`, `store:false`, `response_format json_schema pact_agent_intent`
  strict, merchantId-only; retry once on 502/503/429; no `openai` npm dep — S1).
- Guards: `assertModelConfigAllowsCall` + `resolveOpenAIModel` pre-call; gateway
  rejects `provider!=openai` / `model!=gpt-5.6-luna`; no fallback path exists.
- Env (names only): `OPENAI_API_KEY`, `OPENAI_MODEL` read only in ai-gateway
  composition + `schemas.ts` resolver. Never in browser/edge bundles (scanner-gated).
- No `NEON_AI_GATEWAY_*` reference anywhere in source (verified 2026-09-19).

## 8. Test and verification baseline (green locally, deps present)

Node v24.17.0, Corepack 0.35.0, Yarn 1.22.22, Foundry 1.7.1, Deno 2.9.6,
Supabase CLI 2.117.0 (all verified in prior phases).

| Command | Baseline |
|---|---|
| `corepack yarn typecheck` / `lint` | GREEN |
| `corepack yarn vitest run …` (35 files / ~198 tests) | GREEN |
| `forge test --root contracts` (101) + invariants | GREEN (historical) |
| `corepack yarn validate:aicd` (11 comp / 6 flows / 17 scen) | GREEN |
| `node scripts/check-no-secrets.mjs` (~1000 files) | 0 findings |
| `git diff --check` | GREEN |
| `node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json` | exit 2 `unverified` (correct) |
| H1/H2/H3, G22, G13-fresh | BLOCKED / DRIFT / PENDING (see §4) |

## 9. Risks of migration

1. **Asset-model break**: Arc native gas is USDC (18-dec native / 6-dec ERC-20,
   one balance). Pact's `native-testnet-ctc`/`address(0)` model needs an
   `arc-testnet-usdc` descriptor; 6-vs-18 decimal truncation must not leak into
   caps/accounting (divide by 1e12 for display only).
2. **`address(0)` semantics**: Arc reverts value-bearing transfers to `0x0`
   ("Zero address not allowed"). Pact uses `address(0)` as sentinel constant
   (comparisons only — safe) but any pool/merchant forward must never target it.
3. **ASC removal changes credit invariant**: `spent ≤ min(cap, verifiedCredit)`
   with no ASC issuer means verifiedCredit stays 0 unless an owner-funded or
   new-attestor path is designed — else all payments fail closed (correct but useless).
4. **Precompile absence**: no `0xFD2` on Arc; `PactCreditASC` cannot deploy there.
   Any `assertDeploymentReady` reuse must drop the verifier gate for Arc.
5. **Fee market**: min base fee 20 Gwei; txs below are silently dropped (no receipt).
   Executor timeout/reconcile logic must treat "no receipt" as uncertain, never settled.
6. **Sub-second deterministic finality** (1 confirmation sufficient) vs Creditcoin
   assumptions — receipt logic unchanged (still receipt+event), confirmation count TBD.
7. **Auth mismatch**: Neon Managed Better Auth has no Web3 wallet sign-in; Pact's
   HMAC wallet sessions must be kept, not replaced, in MVP.
8. **Parallel-track drift**: Creditcoin/Supabase lanes are mid-flight (Phase 04
   unclosed). Migration must not edit Phase 01–04 pins or history.

## 10. Recommended migration order

1. Foundation boundaries (BƯỚC 4, this program): network registry, provider-id guard,
   persistence-backend selector, Neon skeleton — additive only.
2. Close or freeze Phase 04 Creditcoin lane explicitly (user decision) before any
   Arc deploy work — do not interleave live lanes.
3. Arc Track A: config + deploy dry-run on Arc Testnet (faucet USDC) → policy matrix
   re-run → receipt/explorer handling.
4. Neon Track B: schema port → Data API (PostgREST-compatible, minimal adapter
   delta) → Functions port → session/auth keep → OpenAI relay unchanged.
5. Track C (frontend/SDK) only after A+B stable. Track D verification last.

## 11. Files likely to change (migration)

`config/networks/` (new `arc-testnet.json`), `packages/domain/src/schemas.ts`,
`types.ts`, `canonical-hash.ts` (asset id), `model-config.ts` (untouched values,
only if env surface changes), `supabase/functions/_shared/chain-config.ts`,
`persistence-ports.ts`, `persistence-composition.ts`, `*-store.ts` ×3,
`path-prefix.ts`, `region-config.ts`, three `index.ts` Deno.serve blocks,
`agent-executor/chain-client.ts` (RPC transport), `supabase/config.toml` +
`deno.json` ×4, `apps/edge/wrangler.toml` + `upstream.ts`, `packages/pact-sdk`
regen, `config/deployments/` (new Arc manifest), `.env.example` (NEON_* names),
`supabase/migrations` → Neon migration tooling, new `neon/` skeleton.

## 12. Files that must NOT be changed yet

- `contracts/src/PactCreditASC.sol`, `PactCreditSource.sol` (legacy, no edits).
- `contracts/src/PactCardController.sol`, `PactCreditPool.sol`, `MerchantSimulator.sol`,
  `PactTypes.sol`, `PactErrors.sol` (no behavior change "để cho compile").
- Phase 01 pins: intent schema, canonical hash, `policyVersion`, error vocabulary.
- Payment invariants: one-send, store-txHash-before-wait, reconciler, no second-submit.
- `config/ai/model-config.json` values; OpenAI provider request shape.
- `process/` phase reports/plans (append-only via Vibecode workflow; no rewrites).
- No secrets, no live lanes, no production/staging mutation in this program.
