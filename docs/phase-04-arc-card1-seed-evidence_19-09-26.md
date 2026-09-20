# Bounded Arc Seed Evidence — 2 Rows on Staging (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Project `myotkovmgzdabuirkqlx`.
Scope: EXACTLY two rows — `cards.card_id "1"` + `intents.intent_id
"intent-req-1"` (`card_id "1"`) — under the standalone two-row approval.
No other row, deploy, OpenAI call, H-lane run, G13, card/credit/payment,
commit, or push. No credential or secret value printed, logged, or
persisted. Credential: the machine's prior CLI link session for the
approved ref; signer absent throughout.

## 1. Pre-write state (verified)

- Tables empty: cards `0`, intents `0` (direct counts).
- Lane schema in force: `cards_asset_lane_check` +
  `intents_asset_lane_check` present; `chain_id` NOT NULL on both.
- On-chain card-1 snapshot re-read (read-only `cast call`):
  owner/agent/cap `1e17`/limit `1e16`/spent `1e16`/status Active/policy
  `1`/expiry future/credit `1e17` expired, allowlist single merchant
  `0x0205…77a70` (full bytes32 recovered from creation-tx input decode +
  `cardAllowlist` membership `true`).

## 2. Merchant decision (no synthetic preimage)

The on-chain merchant bytes32 has no discoverable logical preimage
(opaque `bytes32` registry; deploy script takes raw bytes32; dictionary
probe over repo-known names found no match). Per the established seed
design (lane-catalog merchant, as in the Phase 04 seed scope), the seed
uses lane merchant `arc-demo-merchant` (keccak `0x50ac…0c93152`),
disclosed here. Static preflight evaluates allowlist on-chain at H2 time
(decline on mismatch remains valid H2 evidence either way).

## 3. Rows inserted (idempotent `ON CONFLICT DO NOTHING`, both RETURNED)

**cards `1`**: controller `0x7a47…fc423`, owner `0xb8bd…0c14d52`,
agent `0xdc26…d631682`, asset `arc-testnet-usdc`, chain `5042002`,
status `ACTIVE`, cap `1e17`, limit `1e16`, verifiedCredit `1e17`
(exp `1789839979`, expired as on-chain), spent `1e16`,
expires `1789924696`, policy `1`, allowlist
`0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70`,
source block `62948913`, source tx `0x5bb8…79fb`. Every identity field
equals the §1 on-chain read.

**intents `intent-req-1`**: card `1`, agent = cards.agent ✓, merchant
`arc-demo-merchant`, amount `1e16`, asset/chain lane pair ✓, purpose
`arc lane readiness probe` (lane-operational, ≤160), confidence `0.9`
(lane-operational), provider `openai` / model `gpt-5.6-luna`,
policy `1` (= card row ✓), hash `0xec1e…28400` (see §4), status `ready`,
request `req-seed-intent-req-1`, idempotency `intent-req-1`,
expires `2026-09-19T22:20:41.184Z` (+2h bounded window).

## 4. Canonical intent hash (two implementations agree)

- Primary: repo implementation (`canonicalIntentHash` + `parseAgentIntent`
  green) → `0xec1e7978491defd8aa117d9887bd0f46b4429674f19a8de52252f3e4f3a28400`.
- Independent: `cast keccak(cast abi-encode(...))` over the stored fields →
  identical value. Stored hash == recomputation over stored row ✓.

## 5. Read-back verification (full rows match §3 verbatim)

Both rows re-selected in full after insert: every column equals the
inserted/approved values (controller/owner/agent lowercase 0x, lane pair,
cap/limit/spent numerics, policy `1`, source block/tx, FK
`intents.card_id → cards.card_id` satisfied, `intent_hash` unique).
Counts after: cards `1`, intents `1`, sessions `4`, challenges `16`,
attempts `0` — exactly the two approved rows added, all else unchanged.

## 6. Mutations performed (exhaustive)

Two `INSERT … ON CONFLICT DO NOTHING` statements (one per approved row)
plus read-only `SELECT`s and the pre-existing `cast` view calls. No
UPDATE/DELETE, no other INSERT, no DDL, no deploy, no provider/RPC
mutation, no broadcast.

## 7. Next approvals (unchanged order)

G13 redeploy → fresh H1–H3 (note: seeded credit is expired on-chain, so a
live H2 static call is expected to record a fail-closed decline — valid
H2 evidence either way). None granted here. No commit/push performed.
