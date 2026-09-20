# Creditcoin Card-7 Authoritative Pre-Seed — Read-Only Evidence (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: provision inputs + read-only
pre-seed inspection only. No `cards`/`intents` seed, no Supabase row
insert/update/delete, no Function deploy, no OpenAI call, no H1/H2/H3 run, no
private key/signer use, no broadcast, no Arc metadata use, no synthetic CTC
values, no H1/H2 VERIFIED marking, no Phase 04 close, no commit/push. No
historical file rewritten. RPC URL and any secret-adjacent value: presence
and shape only, never printed, logged, or persisted.

## 1. Executive summary

Partial success. The Creditcoin RPC input provisioned in this shell is live
and chain-verified read-only (`eth_chainId 0x18e8f = 102031`, HTTP 200, valid
JSON-RPC shapes). But there is no Creditcoin/Advance deployment manifest in
the repo and no controller address in the environment, so card 7 cannot be
read from any authority and no address was fabricated. The pre-seed therefore
stops at BLOCKED exactly where the task prescribes: missing controller
manifest/address. No intent hash was computed over placeholder values.

```text
Card 7 authoritative pre-seed: BLOCKED
Seed approval: NOT READY
H1/H2: BLOCKED
Phase 04: COMPLETE_WITH_GAPS
```

## 2. Governance status

Prior decisions consumed as authority (not re-litigated): H1/H2 =
Creditcoin/Advance lane (`102031`, `native-testnet-ctc`) per
`docs/phase-04-h1-h2-supabase-chain-asset-compatibility-audit.md` (Case A);
Supabase schema compatible and frozen; Arc `5042002` out of scope; Phase 04
`COMPLETE_WITH_GAPS` with H1/H2 BLOCKED, H3 PARTIAL, G22 DRIFT. This task
ran under the hard safety rules in its own brief (read-only after input
provision; stop at BLOCKED on missing manifest/RPC).

## 3. Input provenance

Environment presence checks (names only, values never accessed for output):

- `CREDITCOIN_RPC_URL`: present, non-placeholder shape (HTTPS/WSS scheme,
  not `example.invalid`), length consistent with a bare endpoint (no token
  segment indicated; `RPC_TOKEN`-style companion names absent).
- `CREDITCOIN_CONTROLLER_ADDRESS`: absent.
- `PACT_CARD_CONTROLLER_ADDRESS` / `PACT_CREDIT_POOL_ADDRESS` /
  `MERCHANT_SIMULATOR_ADDRESS`: all absent.
- `AGENT_SIGNER_PRIVATE_KEY`: absent (required; holds before and after).
- Operator-provisioned shell input is the sole provenance for the RPC URL;
  nothing about it was written to repo, logs, or evidence beyond the
  presence/shape facts above.

## 4. RPC/chain identity

Exactly two read-only JSON-RPC methods used, via a short-timeout script;
no other method, no transaction-shaped payload, no subscription:

- `eth_chainId` → `"0x18e8f"`, HTTP 200, valid result shape → decimal
  **102031**, `match102031=true`. No Arc RPC and no Arc address touched.
- `eth_blockNumber` twice, 2.5s apart → `5516873`, `5516873`
  (`progressing=true` by `>=`, honestly: same height in-window, so continued
  progression is not proven by this sample — recorded as reachable with valid
  shapes, not as liveness proof).

Classification: `Creditcoin RPC: VERIFIED` (identity only: correct chain,
reachable, well-formed). Latency/throughput/finality claims: none.

## 5. Deployment manifest provenance

Searched `config/deployments/`, `config/networks/`, `packages/pact-sdk/`,
and env names for any Creditcoin/Advance (102031) deployment record:

- `config/deployments/local-payment.json`: Anvil-local, chain 31337 —
  wrong chain, excluded.
- `config/deployments/asc-evidence-rehearsal.json`: ASC rehearsal lane
  (source chain key 1); its embedded `controller` value equals the Arc-track
  controller address, so it is doubly excluded — wrong lane and wrong chain.
  Not used, not quoted as authority.
- `config/deployments/arc-testnet.json`: Arc 5042002 — out of scope,
  excluded.
- `packages/pact-sdk/src/addresses.ts`: Anvil-local addresses — excluded.
- No `*-102031*` manifest, broadcast artifact, or deployment receipt exists
  in the repo; no controller address exists in the environment.

Classification: `Deployment manifest: BLOCKED` (missing). Per the task's
stop rule, no address was invented and no Anvil/Arc/ASC address was
repurposed. Card 7 has no readable authority without it.

## 6. Card 7 read-only snapshot

Not obtained — blocked on §5. Requested fields (`card_id "7"`, controller,
owner, agent, status, cap, per-tx limit, verified credit + expiry, spent,
card expiry, eligibility, asset, allowlist, policy version, source
block/tx) remain UNKNOWN. The read path is known and ready
(`eth_call` static card read `from=agent` via the existing read-only
transport against the manifest controller), but executing it against a
guessed or wrong-chain address would produce worse-than-useless evidence,
so zero calls were made beyond §4 identity checks.

## 7. Intent-req-1 pre-seed manifest

NOT READY — deliberately unfilled. Required shape (from the intent-store
contract and lane fixtures) for the future seed lane:

```text
intent_id: intent-req-1
card_id: 7
chain_id: 102031
asset: native-testnet-ctc
merchant: coffee-demo (catalog allowlist member)
owner scope: <card 7 owner, UNKNOWN>
agent scope: <card 7 agent, UNKNOWN>
amount: <fixture/lane amount, to confirm at seed time>
purpose: <fixture purpose, to confirm at seed time>
policy_version: <must equal seeded card policy_version, UNKNOWN>
created/expiry: <seed-time UTC, unexpired>
idempotency_key: <lane-assigned, unique>
intent_hash: <recomputed via Phase 01 canonical hash at seed time — NOT precomputed here>
```

No canonical hash was calculated: hashing placeholder/UNKNOWN inputs would
create a fake-but-valid-looking value, exactly what §9 forbids.

## 8. Canonical hash calculation

Not performed (inputs UNKNOWN). At seed time it must use the current
implementation (`canonicalIntentHash` over the versioned 8-field tuple
including `policyVersion`), recomputed from the seeded card row — never
copied from fixtures or prior evidence.

## 9. Field-by-field validation

Format rules verified against code (not data): addresses lowercase
`0x`+40hex (migration CHECK + store asserts), tx `0x`+64hex, block
non-negative integer, `expires_at > created_at`, agent/owner consistency
via FK + scoped reads, status in ISSUED/ACTIVE/SUSPENDED/CLOSED with H1
needing ISSUED/ACTIVE, asset literal CTC, chain `102031`, controller equal
to manifest. Data validation: NOT APPLICABLE — no data obtained.

## 10. CONFIRMED/INFERRED/UNKNOWN/BLOCKER table

| Item | Class |
| ---- | ----- |
| RPC URL present, non-placeholder, no token companion | CONFIRMED |
| Chain identity `102031` via `eth_chainId`, HTTP 200, valid shape | CONFIRMED |
| RPC continued liveness/progression | INFERRED-weak (same height in-window; not claimed) |
| H1/H2 lane = Creditcoin/Advance, asset CTC, card 7 / intent-req-1 targets | CONFIRMED (prior audit) |
| Deployment manifest (Creditcoin) | BLOCKER (missing) |
| Controller/pool/merchant addresses | BLOCKER (absent everywhere lawful) |
| Card 7 all fields (§6) | UNKNOWN → BLOCKER |
| Intent-req-1 all derived fields | UNKNOWN → BLOCKER |
| Seed approval readiness | NOT READY |

## 11. Security/no-secret review

No secret or token value printed, logged, persisted, or committed (RPC URL
handled presence/shape-only; secret scan at report time: 1107 scanned,
0 findings; `git diff --check` clean). No private key existed in scope; no signer constructed;
no Arc metadata admitted; no synthetic CTC value created; no Supabase
credential held or sought, hence no remote database inspection was possible
or attempted.

## 12. Explicitly not performed

Seeding `cards`/`intents`; any Supabase row mutation; Function deploy;
OpenAI calls; H1/H2/H3 runs; broadcasts; `eth_call` card reads against any
non-manifest address; Arc RPC/address use; placeholder hashing; VERIFIED
markings; Phase 04 close; commits/pushes.

## 13. Seed approval boundary

Seed approval is NOT READY and must not be requested yet. Two prior
prerequisites, in order: (1) a Creditcoin/Advance deployment manifest (or
operator-provisioned, provenance-documented controller address) for chain
`102031`; (2) a successful read-only card-7 snapshot satisfying §9, recorded
in a follow-up pre-seed artifact. Only then may the bounded two-row seed
approval (`card 7` + `intent-req-1`) be sought, followed by G13 redeploy and
fresh H1–H3 approval.

## 14. H1/H2/H3/G22 status

Unchanged: H1 BLOCKED, H2 BLOCKED, H3 PARTIAL, G22 DRIFT, Phase 04
COMPLETE_WITH_GAPS. This task adds an input-provenance fact (RPC verified)
and a manifest-absence fact; it changes no lane disposition.

## 15. Exactly one recommended next action

Obtain the missing Creditcoin/Advance deployment provenance — the manifest
(or operator-provisioned controller address with documented provenance) for
chain `102031` — then re-run this exact read-only pre-seed to capture the
card-7 snapshot; do not request seed approval or run any H-lane before that
artifact exists.
