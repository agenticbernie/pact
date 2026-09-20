# Bounded Staging Seed — Preflight Evidence: STOPPED at Schema Gate (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: the approved two-row
bounded seed on project `myotkovmgzdabuirkqlx` ONLY.
Result: **STOPPED before any write. Zero rows inserted, updated, or
deleted. Zero partial data.** No deploy, OpenAI call, H-lane run, card/
credit/payment/funding/broadcast, contract/source/config edit, commit, or
push was performed. No secret value was printed, logged, or persisted
(presence/shape only throughout).

## 1. Approval boundary respected

Scope granted: exactly one `cards` row (`card_id "1"`) + exactly one
`intents` row (`intent_id "intent-req-1"`, `card_id "1"`) from verified Arc
metadata, with immediate STOP on any schema/FK/lane/policy/provenance
mismatch. The stop condition below was evaluated read-only BEFORE any
write path was touched.

## 2. Preflight 1 — environment and tooling (names only)

- `SUPABASE_URL`: present, binds the approved ref
  (`myotkovmgzdabuirkqlx` substring match, value never printed).
- `SUPABASE_ANON_KEY`: present; JWT `ref` claim decodes to the approved
  project (public key by design; key itself never printed).
- Write credentials: `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_SERVICE_KEY`, `SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
  `SB_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` — ALL ABSENT.
- `AGENT_SIGNER_PRIVATE_KEY`: absent (required; holds).
- Tooling: `cast`/`forge` 1.7.1, `node`, `npx` present.

## 3. Preflight 2 — fresh on-chain card-1 snapshot (read-only)

`cast call`/`cast tx` against `https://rpc.testnet.arc.io` only. No
`cast send`, no signer, no broadcast.

- `eth_chainId`: `5042002` ✓
- `cards(1)`: owner `0xB8Bd…0c14d52` ✓ · agent `0xdc26…d631682` ✓ ·
  asset `address(0)` ✓ · cap `1e17` ✓ · verifiedCredit `1e17` ·
  verifiedCreditExpiry `1789839979` (expired vs now `1789848605`) ·
  spent `1e16` ✓ · perTxLimit `1e16` ✓ · expiresAt `1789924696`
  (future) · status `1` (Active) ✓ · policyVersion `1` ✓
- `availableCredit(1)`: `0` (expired credit, consistent) ·
  `isCardExpired(1)`: `false` ✓ · `nextCardId`: `2` ✓ ·
  `agentActiveCard(agent)`: `1` ✓ · `usedNonces(1,0)`: `true` ✓
- Creation tx `0x5bb8…79fb` (block `62948913`, from deployer-owner):
  input decodes to agent/cap `1e17`/limit `1e16`/expiresAt `1789924696`
  (matches on-chain row exactly) + exactly ONE allowlisted merchant:
  `0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70`
- `cardAllowlist(1, <full merchant>)`: `true` ✓ (matches the truncated
  `0x0205…77a70` in prior evidence)

Assembled (NOT inserted) seed facts: chain `5042002`, asset
`arc-testnet-usdc`, controller
`0x7a474c005433def5fc496d2016f6ae794edfc423`, owner/agent/status/caps/
spent/expiry/policy/allowlist/source block+tx exactly as above.
Intent hash NOT computed: the logical merchant ID has no on-chain
preimage (allowlist holds raw bytes32); hashing a guessed merchant would
be synthetic. Hash computation is deferred to the seed lane once the lane
merchant is fixed.

## 4. Preflight 3 — staging schema and rows (read-only anon GETs)

- `GET /cards?card_id=eq.1`: HTTP 200, **0 rows**.
- `GET /cards?...select=...chain_id`: HTTP 400 `42703`
  **column `cards.chain_id` does not exist**.
- `GET /intents?intent_id=eq.intent-req-1`: HTTP 200, **0 rows**.
- `GET /intents?...chain_id`: HTTP 400 `42703`
  **column `intents.chain_id` does not exist**.
- `GET /cards?select=card_id&limit=5` and intents equivalent: **0 rows**.

## 5. Stop decision (no writes)

Staging runs the pre-Arc schema: the additive Arc-lane migration
(`202609190001_arc_lane.sql`, local-only, never applied) is absent, so
`chain_id` is missing AND the `cards.asset = 'native-testnet-ctc'` CHECK
from the applied `202609120001` migration is in force. An Arc row
(`asset = 'arc-testnet-usdc'`) would violate the CHECK; a CTC-disguised
row is explicitly forbidden by the approval. Independently, no
service-role/CLI write credential exists in this shell while RLS
deny-policies require it. Either blocker alone compels STOP; both hold.

Per the approval's stop rule, the lane halted here: **no insert, no
upsert, no update, no delete, no partial data**. The two target rows
remain absent (verified by §4 reads).

## 6. Mutations performed

None. Read-only operations only: `eth_chainId`, `eth_call`-class `cast
call` views (7), one `cast tx` receipt/input read, six anon PostgREST
GETs. No `cast send`, no `eth_send*`, no POST/PATCH/DELETE anywhere.

## 7. Exactly one recommended next action

Approve, in order: (a) applying the additive Arc-lane migration
(`202609190001_arc_lane.sql`) to staging; (b) a credentialed rerun of
this exact bounded seed (same two rows, same Arc facts, hash computed
once the lane merchant is fixed). G13 redeploy and fresh H1–H3 remain
separately gated after that. No other lane is unblocked by this artifact.
