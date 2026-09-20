# H1/H2 Supabase Chain-Asset Compatibility Audit (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: audit + decision artifact only.
No staging insert/update/delete, no seed, no deployment, no OpenAI/RPC call,
no signer/private-key use, no contract change, no Arc evidence change, no
commit/push, no H1/H2 VERIFIED marking was performed. No remote query was
issued (no staging credentials held or sought); all evidence below is static
(source/config/plan/report inspection) plus local hermetic tests. No
historical file was rewritten.

## 1. Executive summary

**Decision: Case A — the H1/H2 staging lane is Creditcoin/Advance, not Arc.**
The current Supabase schema is compatible with that lane: the
`cards.asset = 'native-testnet-ctc'` constraint is correct and must stay.
`native-testnet-ctc` is not legacy-only; it is the live Phase 04 domain asset
literal enforced at five layers (DB CHECK, CardStore, IntentStore, Zod
schemas, canonical hash). Arc (`arc-testnet-usdc`, chain `5042002`) lives in
a separate migration track and is out of scope for H1/H2; seeding Arc
metadata disguised as CTC is explicitly forbidden and would be rejected by
the schema itself. Seed of `card 7` / `intent-req-1` is schema-compatible
but data-blocked: every authoritative field is UNKNOWN (no Creditcoin
deployment manifest, canonical network config still placeholder), so seed
remains PENDING a separate approval plus metadata availability.

```text
H1/H2 lane = Creditcoin/Advance
Schema compatible
Seed = PENDING APPROVAL
H1 BLOCKED / H2 BLOCKED / H3 PARTIAL / G22 DRIFT / COMPLETE_WITH_GAPS (unchanged)
```

## 2. Governance status

Read in full before concluding (no guessing, no fixture-as-truth):

- `supabase/migrations/202609080001_sessions_and_intents.sql` (C-SESSION /
  C-DDL pins, `intents.asset` default `'native-testnet-ctc'`).
- `supabase/migrations/202609120001_persistence_contracts.sql` (`cards`
  cache table with `asset = 'native-testnet-ctc'` CHECK, RLS deny-only,
  fail-closed backfill validation, forward-only rollback note).
- `supabase/functions/_shared/card-store.ts` (CTC literal assert, lifecycle,
  hash-only/owner-scoped reads).
- `supabase/functions/_shared/intent-store.ts` (CTC literal assert,
  owner/agent-scoped reads, FK to `cards`).
- `supabase/functions/_shared/persistence-ports.ts` (`CardRecord.asset:
  "native-testnet-ctc"` literal type).
- `supabase/functions/agent-executor/index.ts` + `chain-client.ts`
  (hard-coded `102031`, `CREDITCOIN_RPC_URL`, `PayInput.asset?:
  "native-testnet-ctc"`, read-only `eth_chainId`/`eth_call` transport).
- `supabase/functions/ai-gateway/index.ts` (CardStore/IntentStore composition,
  canonical model pin — lane wiring, no chain-identity change).
- Phase 04 authority: `phase-04-ai-gateway-executor_REPORT_08-09-26.md`
  (H1/H2 appendices, fixtures `{prompt:"buy coffee",cardId:"7"}` and
  `{intentId:"intent-req-1"}`), `phase-04-hybrid-gate-pack_10-09-26.md`
  (`CREDITCOIN_RPC_URL`, read-only static-call budget, mainnet abort rule),
  runtime-composition supplement (G24–G35 local halves).
- Network/config truth: `config/networks/advance-testnet.json`
  (canonical, `verified:false`, placeholder values), untracked
  `config/networks/arc-testnet.json` + `config/deployments/arc-testnet.json`
  (Arc track only), `packages/domain/src/schemas.ts`
  (`CREDITCOIN_CHAIN_IDS = [102030, 102031, 102032]`), canonical-hash CTC
  literal, `supabase/functions/_shared/chain-config.ts`
  (`TARGET_CHAIN_ID = 102031`).
- `rg` searches across `supabase/`, `packages/`, `config/`, `process/`
  for `intent-req-1`, card-7 fixtures, `102031`/`5042002`, `CREDITCOIN_RPC_URL`,
  and case-insensitive `arc` in all Phase 04 lane-defining docs and function
  sources.

## 3. H1/H2 intended lane

Creditcoin/Advance, confirmed by converging static evidence (no single
source trusted alone):

- Lane authority (hybrid gate pack): `CREDITCOIN_RPC_URL` as the H2 chain
  read input; H2 budget is read-only RPC with zero transactions/gas/signers;
  any mainnet chain ID aborts the lane.
- Executor source pins `102031` in six places: declined-response `chainId`
  (`index.ts:307,344,348,361,369,388`), card-chain assertion
  (`chainCard.chainId !== 102031`), and the read-only client
  (`expectedChainId: 102031`, `index.ts:416`).
- `chain-config.ts`: `TARGET_CHAIN_ID = 102031`; `PayInput.asset` is the
  literal `"native-testnet-ctc"`.
- Local lane fixtures (test-only, never live truth): `cardId "7"`,
  `chainId 102031`, `policyVersion 1`, prompt `"buy coffee"`,
  `intentId "intent-req-1"`, merchant `coffee-demo`, native asset —
  consistent across `executor.vitest.test.ts`, `prefix-routing.vitest.test.ts`,
  `intent-store.vitest.test.ts`, and `smoke-edge-gateway.mjs`.
- Staging observation (historical report, preserved): deployed health returned
  `chainId 102031`; H2 returned `chainId:102031`. The staging project
  `myotkovmgzdabuirkqlx` with functions
  `session`/`ai-gateway`/`agent-executor` is the H1/H2 lane; its database is
  the seeded-schema target.
- Arc exclusion: zero Arc mentions in the Phase 04 plan, hybrid pack,
  runtime-correction supplement, gateway/executor sources, or stores. Arc
  material (`docs/migrations/*`, untracked `arc-testnet.json` configs,
  Arc deployment manifest with live Arc contracts) belongs to the separate
  contract-migration track, which exercises payment contracts directly on Arc
  and never touches the Supabase H1/H2 path.

## 4. Schema audit

- `cards` (202609120001): `asset` CHECK `= 'native-testnet-ctc'`;
  `card_id` numeric-text PK; `controller/owner/agent` lowercase-0x checks;
  `status` in ISSUED/ACTIVE/SUSPENDED/CLOSED; non-negative 78-digit caps,
  limits, credit, spent; `policy_version >= 0`; `allowlist_hash` not null;
  `source_block >= 0`; `source_tx_hash` 0x-64hex; `expires_at > created_at`;
  FK `intents.card_id → cards.card_id`; RLS deny-public on all four tables.
- `intents` (202609080001 + additive columns): `asset` default CTC (no
  CHECK at DDL level — the application layer closes this: see below).
- Application pins (all fail-closed `INVALID_ROW` on mismatch):
  `card-store.ts:73`, `intent-store.ts:66`, `persistence-ports.ts:95`
  (`asset: "native-testnet-ctc"` type literal), domain `types.ts:7,31`,
  `schemas.ts:126,185` (`z.literal`), `canonical-hash.ts:54`.
- An Arc-USDC row would be rejected at four independent layers (DB CHECK,
  CardStore, IntentStore, domain schema/hash). Faking it as CTC would pass
  the checks but poison every downstream authority read — forbidden by §10.

## 5. Compatibility matrix

| Property | Current Supabase schema | H1/H2 expected lane | Arc value | Creditcoin value | Result |
| -------- | ----------------------- | ------------------- | --------- | ---------------- | ------ |
| Network/chain | No chain column; chain enforced in app (`102031` literals, `TARGET_CHAIN_ID`) | Creditcoin/Advance `102031` (pack, executor ×6, staging health) | `5042002` | `102031` (family 102030–102032) | CONFIRMED (lane = Creditcoin) |
| Asset | `cards.asset` CHECK CTC; `intents.asset` default CTC + app literal asserts | `native-testnet-ctc` (fixtures, `PayInput`, domain literals) | `arc-testnet-usdc` | `native-testnet-ctc` | CONFIRMED compatible; Arc value rejected at 4 layers |
| Controller | `controller_address` 0x required; no row seeded | Creditcoin PactCardController | Arc `0x7A47…FC423` (wrong chain — must not substitute) | UNKNOWN (no Creditcoin manifest) | BLOCKER |
| Agent | `agent_id` 0x required, wallet-bound | session wallet-bound agent | Arc agent burner (different lane) | UNKNOWN | BLOCKER |
| Card source | `cards` cache; controller is authority | on-chain Creditcoin card 7 read | Arc card 1 (different chain/card) | UNKNOWN | BLOCKER |
| Policy version | integer `>= 0` | card 7 on-chain policyVersion | n/a | UNKNOWN | BLOCKER |
| Allowlist hash | text not null | card 7 allowlist | n/a | UNKNOWN | BLOCKER |
| Source block/tx | `bigint >= 0` + 0x-64hex | card 7 creation tx on Creditcoin | Arc blocks (wrong chain) | UNKNOWN | BLOCKER |
| Limits/expiry | non-negative numerics; `expires_at > created_at` | card 7 current limits/expiry | n/a | UNKNOWN | BLOCKER |

Field classification: lane identity + asset expectation = CONFIRMED
(Creditcoin); every authoritative seed value = UNKNOWN → BLOCKER for seed.
`native-testnet-ctc` is INFERRED-then-CONFIRMED as the intended lane asset
(five-layer pin), not legacy-only. Arc-in-scope-for-H1/H2 = refuted
(CONFIRMED out of scope).

## 6. Authoritative metadata requirements

A lawful `card 7` seed row needs, exclusively from Creditcoin/Advance chain
reads (never fixtures, never Arc data, never synthetic values):

1. `controller_address` — deployed Creditcoin PactCardController (requires a
   Creditcoin deployment manifest; none exists in repo).
2. `owner_address`, `agent_id` — card 7 owner/agent from the controller.
3. `status` — ISSUED/ACTIVE/... from chain (must be ACTIVE or ISSUED for H1).
4. `owner_configured_cap`, `per_transaction_limit`, `spent`,
   `verified_credit (+expiry)` — current on-chain values.
5. `policy_version`, `allowlist_hash` — card 7 policy snapshot.
6. `source_block`, `source_tx_hash` — card 7 creation event identity.
7. `expires_at` — card expiry (must satisfy `expires_at > created_at`).
8. `asset` = `native-testnet-ctc` (constant, not read).

A lawful `intent-req-1` row additionally needs: matching
`card_id/agent_id`/native asset/`coffee-demo` merchant, amount, canonical
`intent_hash` (recomputed via Phase 01 hash, never copied blindly),
`policy_version` equal to the seeded card's, unexpired `expires_at`,
`status 'ready'`, `request_id`, and `idempotency_key` — all owner-scoped to
the seeded card's owner/agent.

## 7. Current blocker classification

- Lane ambiguity: RESOLVED (Case A, Creditcoin/Advance).
- Schema compatibility: COMPATIBLE (no migration needed for H1/H2).
- Card-7 metadata: BLOCKER (8/8 authoritative fields UNKNOWN).
- Intent-req-1 metadata: BLOCKER (derives from card 7 + provider/model run).
- Canonical Creditcoin network values: BLOCKER (`advance-testnet.json`
  `verified:false`, `chainId 0`, `rpcUrl ...example.invalid`; real
  `CREDITCOIN_RPC_URL` name absent from this shell by design).
- Approvals: BLOCKER (no seed approval, no fresh H1–H3 approval in this task;
  this task forbids OpenAI calls regardless).

## 8. Decision: Creditcoin/Advance (Case A)

Confirmed: asset `native-testnet-ctc` is correct; schema is compatible; seed
of `card 7` + `intent-req-1` is lawful only from Creditcoin/Advance
authoritative reads after a separate approval. Case B is rejected: the schema
needs no Arc accommodation, and no Arc-specific change (network identity
column, asset discriminator, constraint relaxation, backfill, store
validation change, gate expansion) is proposed or authorized. The old
migration stays untouched.

## 9. Seed readiness

`Seed = PENDING APPROVAL` (schemaREADY, data BLOCKED). Ready checklist for
the future seed lane: (1) real `CREDITCOIN_RPC_URL` + Creditcoin deployment
manifest available to the operator; (2) chain-read of card 7 populating §6
fields 1–8 with block/tx evidence; (3) explicit seed approval covering the
exact two rows; (4) post-seed read-back proving FK/owner/agent/hash
consistency; (5) G13 redeploy of current code first (deployed code predates
local corrections); (6) fresh H1–H3 approval before any lane call. Until
then, H1 returns `CARD_NOT_ELIGIBLE` and H2 returns `PREFLIGHT_DECLINED`
by design — both are correct fail-closed behavior, not defects.

## 10. Required approval boundary

Four separate approvals, in order, none granted here: (A) Creditcoin
RPC/deployment-input provisioning; (B) staging seed of exactly `card 7` +
`intent-req-1` from §6 metadata; (C) post-correction G13 staging redeploy;
(D) fresh H1–H3 hybrid lane. This audit grants none of them and authorizes
no EXECUTE, migration, hosted, provider, RPC, signer, transaction, or H-lane
action.

## 11. Files inspected

Migrations (2): `202609080001_sessions_and_intents.sql`,
`202609120001_persistence_contracts.sql`. Shared (3):
`card-store.ts`, `intent-store.ts`, `persistence-ports.ts`. Functions (3):
`agent-executor/index.ts`, `chain-client.ts` (read), `ai-gateway/index.ts`
(wiring reference). Chain/config (5): `chain-config.ts`,
`advance-testnet.json`, untracked `arc-testnet.json` (networks +
deployments), `schemas.ts`, `canonical-hash.ts`. Plans/reports (4):
Phase 04 report H1/H2 appendices, hybrid gate pack, runtime-correction
supplement, prior closure-evidence report. Tests (3 files, §12).

## 12. Tests/checks run

- `corepack yarn vitest run
  supabase/functions/_shared/test/card-store.vitest.test.ts
  supabase/functions/_shared/test/intent-store.vitest.test.ts
  supabase/functions/_shared/test/deploy-compat.vitest.test.ts`
  → 3 files / 20 tests GREEN (proves the CTC pin + scoped-read contracts
  hold on the current worktree; Arc-USDC-shaped rows are rejected).
- Static `rg` matrix probes: `intent-req-1` (fixtures + report only, never
  live truth), card-7/chain-102031 fixture set, `CREDITCOIN_RPC_URL` lane
  binding, `102031` vs `5042002` separation, zero Arc references in
  lane-defining docs/sources, five-layer CTC literal pin.
- No remote schema/data query issued (read-only inspection only, and only
  static). No RED→GREEN cycle: audit scope, nothing to implement.

## 13. Security/no-mutation review

Zero rows read from or written to staging; zero deployments; zero
provider/RPC/hosted calls; zero signer/key use (name-only references
unchanged); zero secret values printed, logged, or persisted; historical
Arc evidence and Phase 03 legacy boundary untouched; `git diff --check`
clean before and after (report file is new/untracked).

## 14. H3/G22 unchanged

H3 PARTIAL and G22 DRIFT are preserved as-is; neither was inspected beyond
confirming out-of-scope status, and neither is affected by this decision.

## 15. Exactly one recommended next action

Provision the authoritative Creditcoin/Advance inputs (real `CREDITCOIN_RPC_URL`
plus a deployment manifest carrying the PactCardController address), chain-read
card 7 to fill the §6 field set, then request the single bounded seed approval
for exactly `card 7` + `intent-req-1` — and run no H-lane before that approval
plus the post-correction G13 redeploy and fresh H1–H3 approval.
