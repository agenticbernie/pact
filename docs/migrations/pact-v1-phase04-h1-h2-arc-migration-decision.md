# H1/H2 Arc Migration Decision (2026-09-19) — PLAN ONLY

Date: 2026-09-19 (UTC) · Branch: `main`.
Status: DECISION ONLY. Authorizes no implementation, migration execution,
seed, deployment, OpenAI/RPC call, transaction, signer use, commit, or push
until the TDD lane (Steps 4–6 of the task) runs under this decision.
Product decision consumed as given: Pact v1 executes H1/H2 on Arc Testnet;
CTC/Creditcoin leaves the execution lane. Prior audits (Creditcoin Case A,
card-7 metadata BLOCKED) remain historical and are not rewritten — this
document supersedes only the lane target, explicitly, from this date.

## 1. Governance

AGENTS.md / CLAUDE.md / protocol routers / Phase 04 plan + V1–V7 contract /
hybrid-gate-pack / H1–H3 appendices / backend-tests were fully read in the
preceding audit passes on this worktree; none changed since (`git status`
shows only the known Arc/Neon-track worktree deltas). H1/H2 acceptance is
still pack §7 (redacted live artifacts, separate approval). H3 and G22 are
out of scope and untouched. Vibecode Pro Max Kit governs; `obra/superpowers`
absent = recorded GAP.

## 2. CTC dependency audit (classified)

H1/H2 execution dependencies (migrate):
- `supabase/functions/agent-executor/index.ts` — `102031` literals (7
  response/assert/client sites), `CREDITCOIN_RPC_URL`, CTC asset check.
- `supabase/functions/agent-executor/chain-client.ts` — `PayInput.asset`
  CTC literal (transport itself is chain-parameterized: no change needed).
- `supabase/functions/ai-gateway/index.ts` — emitted-asset CTC literals
  (hash + intent); health default chain `TARGET_CHAIN_ID`.
- `supabase/functions/_shared/chain-config.ts` — `TARGET_CHAIN_ID 102031`.
- `supabase/functions/_shared/card-store.ts`, `intent-store.ts`,
  `persistence-ports.ts` — CTC-only row asserts, `CardRecord.asset` literal.
- `packages/domain/src/types.ts`, `schemas.ts`, `canonical-hash.ts` —
  `AgentIntent.asset` / `z.literal CTC` / hash CTC-only guard.
- Migrations `202609080001` (intents asset default) + `202609120001`
  (cards asset CHECK) — read-only history; change only via new additive file.
- H1/H2 lane fixtures using card 7 / `intent-req-1` / 102031 (supabase +
  domain tests) — migrate per §5.

Phase 03 / legacy / preserved (do not touch):
- `contracts/` (all Solidity, incl. ASC), `services/asc-proof-worker/`,
  `scripts/asc/*`, `scripts/preflight-testnet.mjs` (Phase 01-owned),
  `CREDITCOIN_CHAIN_IDS` + `assertDeploymentReady` semantics in
  `schemas.ts`, `config/networks/advance-testnet.json`,
  `packages/pact-sdk` (Anvil-local), `scripts/smoke-edge-gateway.mjs`
  (legacy local smoke), `apps/edge` (chain-agnostic forwarder),
  `config/ai/merchant-catalog.json` (non-authoritative), all
  `process/` history, `docs/superpowers/*`, Arc evidence docs.

Test-only fixtures: domain vectors + supabase fake-backed suites stay as
legacy-lane regression (see §5); nothing is deleted.

## 3. Arc target contract

| Item | Value | Provenance |
| ---- | ----- | ---------- |
| Chain ID | `5042002` | live reconfirmed (closeout index §4) |
| RPC | `https://rpc.testnet.arc.io` | official docs + A2 live preflight |
| Asset literal | `arc-testnet-usdc` | A1 `config/networks/arc-testnet.json` convention (18 decimals, native interface) |
| Controller | `0x7a474c005433def5fc496d2016f6ae794edfc423` | deployment manifest (source-verified) |
| Pool | `0x5e1771de29bd1a084900d032fd4db2ac7c7528b` | deployment manifest |
| MerchantSim | `0xac030ddaa1fc29c1738332c3b9524ecfd0b4174f` | deployment manifest |
| Card (lane) | card `1` (ACTIVE; cap `1e17`; limit `1e16`) | allowed-payment evidence + closeout §8 |
| Card agent | `0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682` | payment `from` (approved agent) |
| Card owner | `0xb8bdcc633cd8e67250358d807918f99dc0c14d52` | deployer/owner |
| Card source | block `62948913`, tx `0x5bb8ce7b…` (createCard) | closeout §8 |
| Fee/finality | 20 Gwei floor, 1 confirmation | A1/A2 live |

Canonical EVM asset representation for hashing stays `address(0)`
(native interface); the 8-field hash tuple is UNCHANGED — cross-chain
replay protection comes from lane binding (chain-gated stores + controller
binding), never from a tuple change.

## 4. Schema incompatibilities

1. `cards.asset` CHECK admits CTC only → Arc rows rejected at DB.
2. No `chain_id` anywhere → lane unrepresentable; CTC/Arc rows
   indistinguishable at rest.
3. Store asserts + `CardRecord.asset` literal reject Arc rows in code.
4. Domain `AgentIntent.asset` / schema / hash reject Arc intents.
5. Executor/gateway hard-code 102031/CTC/RPC name.
Root fix: explicit `(chain_id, asset)` lane pairs —
`(102031,'native-testnet-ctc')` legacy, `(5042002,'arc-testnet-usdc')` Arc —
enforced at DB (new additive migration), stores (pair + optional strict
lane), and compositions (Arc lane selected by the production roots).

## 5. Card identity decision (hard stop resolved)

**Migrate H1/H2 test identity to Arc `card 1`; keep `card 7` fixtures as
legacy-lane regression; live seed targets card 1 under a separate approval.**
Rationale: fixtures are test-only data — pointing new Arc-lane fixtures at
the existing, fully-provenanced on-chain card 1 provisions nothing and
creates nothing. No card is changed, activated, or created by this
migration. Card-7 fixtures are retained (not deleted) as CTC-lane proof.
Real `policy_version` for card 1 is unconfirmed in evidence → fixture value
`1`, clearly marked; the seed lane must read the true value on-chain.
Allowlist source for fixtures: `merchantIdToBytes32("arc-demo-merchant")`
(deterministic, re-derivable; not chain truth).

## 6. Metadata provenance requirements (seed lane, later)

Card-1 seed row must carry §3 values verbatim (lowercase 0x), status ACTIVE,
`spent`/`verified_credit` read fresh at seed time (post-payment state has
moved since evidence), expiry future-dated, `policy_version` read on-chain
(not the fixture `1`), `source_block`/`source_tx_hash` = §3 creation event.
`intent-req-1` derives from that row (matching card/agent/policy/native
asset, catalog merchant, recomputed canonical hash, unique idempotency key).
No synthetic values; no CTC disguise (schema now rejects it twice).

## 7. Additive design (no old-file rewrites)

- Domain: `asset` widens to `"native-testnet-ctc" | "arc-testnet-usdc"`
  (types, Zod, hash guard); new pure `arc-lane.ts` (lane consts, pair check,
  `laneForChainId`, Arc binding assert); hash tuple untouched.
- Functions: new `_shared/lane-config.ts` re-exporting domain lane; stores
  gain optional strict `lane` (default: accept either valid pair — history
  green); executor/gateway compositions gain `lane` (injectable seam
  defaults legacy; production `Deno.serve` roots pass Arc explicitly);
  gateway emits the server-bound card asset instead of a CTC literal;
  executor read-only path binds lane chain + asset + controller.
- DB: new `202609190001_arc_lane.sql` — `chain_id` on cards/intents,
  backfill `102031`, lane-pair CHECKs (old CHECK dropped-and-replaced
  inside the new file only), fail-closed validation, forward-only rollback
  notes. Old migration files byte-identical; old static test untouched; new
  static test for the new file.
- Env: `ARC_RPC_URL` is the Arc-lane RPC name (production). The rename from
  `CREDITCOIN_RPC_URL` is a deployment prerequisite recorded here, not a
  silent swap: no deploy occurs in the migration task.

## 8. Rollback strategy

Code: lane params are optional with legacy defaults — rollback is reverting
the additive commits; legacy tests prove the pre-migration behavior
unchanged. DB: forward-only compensating migration (per 202609120001 §
convention); rows preserved for forensics; never `DROP TABLE/COLUMN`.
Lane misfire (CTC row in Arc lane or vice versa) fails closed at store +
composition with `INVALID_ROW` / `CARD_NOT_ELIGIBLE` — proven by the new
TDD tests, not by inspection.

## 9. Acceptance criteria (local, this migration)

New RED→GREEN suites: Arc accept / CTC-in-Arc reject / Arc-in-legacy reject
/ pair-mismatch reject / controller binding + mismatch decline / Arc
canonical hash valid + deterministic / FK + scoped ownership on Arc rows /
fail-closed on missing metadata. Full Vitest, typecheck, lint, AICD, secret
scan, `git diff --check` green; pre-existing suites green unmodified
(legacy default); no contract change → no Forge gate (recorded rationale).
No hosted H-lane, no seed, no deploy.

## 10. Files expected to change / preserved

Change (additive-first): `packages/domain/src/arc-lane.ts` (new),
`types.ts`, `schemas.ts`, `canonical-hash.ts`, `index.ts` (export),
`supabase/functions/_shared/lane-config.ts` (new),
`persistence-ports.ts` (`chain_id`), `card-store.ts`, `intent-store.ts`,
`chain-config.ts`, `agent-executor/index.ts` (+ Deno block),
`agent-executor/chain-client.ts` (asset union),
`ai-gateway/index.ts` (server-bound asset, health chainId passthrough,
Deno lane), `supabase/migrations/202609190001_arc_lane.sql` (new),
`supabase/test/arc-lane-schema-static.test.ts` (new),
`packages/domain/test/arc-lane.test.ts` (new),
`supabase/functions/_shared/test/arc-lane-composition.vitest.test.ts`
(new). Preserved: everything in §2-legacy plus H3/G22 surfaces, contracts,
Arc evidence, and all existing tests (edited only if a genuine lane
assertion forces it — none expected under optional-lane design; any such
edit is recorded as a deviation).

## 11. Staging note (no action this task)

At the future redeploy: set `ARC_RPC_URL` (Arc lane), keep
`PACT_EXPECTED_REGION`/`SB_REGION` semantics, `allowFallback:false`,
server-only OpenAI, read-only executor path — all unchanged by this
migration. Production roots select Arc; legacy lane remains available in
code for the preserved CTC history only.

## 12. Addendum — owner-scoped H2 finding (implementation-time, 2026-09-19)

Proven by `arc-lane-composition.vitest.test.ts` ("owner-mismatch semantic"):
the H2 read-only lookup passes `ownerAddress = sessionWallet` AND
`agentId = sessionWallet`, and the card lookup additionally requires
`card.owner == sessionWallet`. Combined, H2 reaches `would_settle` only
when owner == agent == session wallet (single-operator disposable lane).
The real Arc card 1 has owner (`0xb8bd…`) != agent (`0xdc26…`), so even a
perfect card-1 seed yields `PREFLIGHT_DECLINED` (fail-closed, correct per
current contract) — seed alone does NOT unblock H2 on card 1. Resolving
this needs a separate decision BEFORE the seed lane: either a scoping
relaxation via a new supplement + PVL (G32 contract is explicit), or an
owner==agent Arc card via live provisioning approval. This migration
implements no scoping change; lane tests encode both the single-wallet
would_settle path and the real-shape declined path.
