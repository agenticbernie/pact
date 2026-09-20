# Neon H2 / provider follow-up evidence

Date: 2026-09-20 UTC · Project `polished-dream-04296130` · branch `main`.

Status: **STOPPED BEFORE DEPLOYMENT AND LIVE H2**. The source correction is
present, but the mandatory full Vitest gate reported three unhandled local
PostgreSQL connection-termination errors during the Docker smoke suite
teardown. Per the lane boundary, no Neon deployment or H2 attempt was made.

## 1. Source and deployed identity

- Source `createArcCard1OwnerRegistry()` currently authorizes exactly:
  `intent-req-1`, card `1`, chain `5042002`, Arc asset
  `arc-testnet-usdc`, the seeded owner/agent/controller/policy/provenance
  values.
- Source `neon/functions/agentexecutor/index.ts` imports and passes
  `createArcCard1OwnerRegistry()` to `startExecutorServer()`.
- The existing deployed Neon function is `agentexecutor` at the expected
  project/branch identity, runtime `nodejs24`, status `completed`, current
  deployment ID `1`, created `2026-09-20T11:06:14.051279Z`.
- The previous fresh H2 response is the deployed-artifact evidence: it
  declined `intent-req-1` before chain work while the prior deployed source
  had the stale `intent-arc-1` registry entry. The Neon CLI exposes no source
  hash or bundle digest in the read-only function details, so artifact/source
  equality cannot be claimed without a new deployment.
- No deployment was performed in this follow-up. The live artifact remains
  uncorrected pending a passing gate.

## 2. Registry correction and regression coverage

- No production registry change was necessary: source already contained
  `intent-req-1`; no `intent-arc-1` production entry remains.
- Added one focused regression assertion in
  `supabase/functions/_shared/test/h2-owner-scoping.vitest.test.ts`:
  `intent-req-1` resolves with card/chain binding and `intent-arc-1` resolves
  to null. Existing owner/agent/chain fail-closed tests remain unchanged.

## 3. Gates

- Focused H2/Arc composition tests: **PASS**, 2 files / 20 tests.
- Full Vitest: **FAIL gate**. 57 files / 340 tests passed, but 3 unhandled
  `Connection terminated unexpectedly` errors were emitted by
  `neon/test/neon-runtime-smoke.test.ts` around local Docker PostgreSQL
  teardown. This is a local test-lifecycle failure, not Neon evidence; the
  command exited non-zero.
- Typecheck: **PASS**.
- Lint: **PASS**.
- AICD: **PASS**, no failures.
- Secret scan: **PASS**, 1,143 scanned / 0 findings.
- `git diff --check`: **PASS**.

The failing full gate blocks deployment under the requested protocol. No
deployment was attempted after the failure.

## 4. Neon secrets names-only audit

No secret values were read or printed. The source/deployment dependency names
are:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `SESSION_HMAC_SECRET`
- `ARC_RPC_URL`
- `DATABASE_URL`
- `PERSISTENCE_BACKEND`

The available Neon CLI does not expose a names-only function-environment
inventory (`neon env` only supports pulling values), so deployed presence and
values are **UNKNOWN**. No env pull was run. No function secret was changed.

## 5. Neon logs and H1 diagnosis

- Neon function log query for `agentexecutor`, last 7 days: **no logs found**.
- No provider-specific logs/status, HTTP status from the upstream provider,
  model-permission response, or network trace is available.
- Prior H1 evidence remains one owner request returning HTTP 400
  `PROVIDER_UNAVAILABLE`; no retry was made.
- Health `modelAvailable:false` is not treated as provider failure evidence.
- Honest classification: **H1 `PROVIDER_ACCESS_UNRESOLVED` / BLOCKED**. The
  evidence does not distinguish missing/empty key, 401/403, model-not-found,
  rate limit, or transport failure.

## 6. Live actions and counts

- Neon deployment: **not performed**.
- Neon H2: **not run** in this follow-up; therefore the one post-alignment
  attempt remains unused.
- H1: **not rerun**.
- Card, intent, payment, credit, seed, migration, contract, signer, gas, RPC
  payment, and Supabase fallback actions: **not performed**.
- Neon DB counts: **not queried in this stopped phase**; no Neon DB mutation
  occurred.
- Local Docker smoke tests only used an ephemeral local PostgreSQL container;
  no Neon rows were changed.

## 7. Current status

- H1: **BLOCKED — PROVIDER_ACCESS_UNRESOLVED**.
- H2: **BLOCKED — deployed artifact stale; alignment not deployed**.
- H3: **PARTIAL** (previous health evidence; `modelAvailable:false` remains
  non-diagnostic).
- G22: **DRIFT**, unchanged and untouched.
- Phase 04: **COMPLETE_WITH_GAPS**, unchanged.
- No VERIFIED claim is made; no live acceptance artifact exists for this
  follow-up.

## 8. Explicit non-actions

No secret/model/region change, H1 retry, H2 retry, H2 preflight, Neon
`agentexecutor` deployment, session/aigateway deployment, DB row mutation,
seed, schema change, contract redeploy, payment, broadcast, Supabase change,
Arc evidence rewrite, CTC legacy change, commit, or push was performed.

## Recommended next action

Fix the local Neon Docker smoke-suite connection teardown so full Vitest exits
cleanly, then rerun the required gates before considering the single approved
`agentexecutor` deployment and one fresh H2 attempt.

## 9. Lifecycle teardown correction (2026-09-20 continuation)

The local smoke suite's three Neon function entrypoints construct real `pg`
pool instances inside module-level cached handlers. The test directly closed
only the two pools it created itself; those handler-owned pools remained open
when `afterAll` executed `docker rm -f`. PostgreSQL then emitted three
unhandled `Connection terminated unexpectedly` errors while the container was
being forcibly removed.

Minimal test-only correction in `neon/test/neon-runtime-smoke.test.ts`:

- Wrap the real `pg.Pool` class with a test-only subclass that registers every
  instantiated pool; database traffic still uses the real PG17 driver and
  container.
- Await `pool.end()` for every registered pool in `afterAll` before removing
  the container.
- Remove the two per-test closes so teardown owns all pool shutdowns.
- Remove the teardown catch that could suppress shutdown errors.
- Preserve all five tests, assertions, PG17 image, schema, runtime entries,
  and production code unchanged.

No production runtime, Neon adapter behavior, schema, seed, registry, or
H1/H2 logic was modified.

## 10. Lifecycle verification gates

- Focused Docker smoke: **PASS**, 5/5 real PG17 tests, no unhandled errors.
- Full Vitest: **PASS**, 57 files / 340 tests.
- Typecheck: **PASS**.
- Lint: **PASS**.
- AICD: **PASS**, 0 failures.
- Secret scan: **PASS**, 1,144 scanned / 0 findings.
- `git diff --check`: **PASS**.
- Docker smoke container: removed after awaited pool shutdown.

Deployment readiness is restored for the previously blocked next lane. No
Neon deployment, H2 attempt, H1 attempt, DB mutation, seed, payment, RPC
transaction, Supabase change, commit, or push was performed.

## 11. Updated status

The local lifecycle gate is **GREEN**. The live status remains unchanged:
H1 **BLOCKED / PROVIDER_ACCESS_UNRESOLVED**, H2 **BLOCKED / stale deployed
artifact**, H3 **PARTIAL**, G22 **DRIFT**, Phase 04
**COMPLETE_WITH_GAPS**. No VERIFIED claim is made.

## Recommended next action

After explicit approval, deploy only Neon `agentexecutor`, verify its active
version and registry alignment read-only, then run exactly one fresh H2
preflight; do not run H1.

## 12. Alignment deployment and controlled H2 rerun (2026-09-20 continuation)

### Preflight

- Neon project: `polished-dream-04296130`.
- Branch: `main`.
- Function URL and project/branch identity remained unchanged.
- Source registry contains the Arc card-1 entry for `intent-req-1`, card `1`,
  chain `5042002`; no production `intent-arc-1` entry remains.
- Prior live deployment was ID `1`, created
  `2026-09-20T11:06:14.051279Z`, and prior H2 evidence identified its stale
  `intent-arc-1` behavior.
- No secret values, token, signature, private key, keystore password, or
  database URL was printed or recorded.

### Deployment

- Exactly one function deployed: Neon `agentexecutor` only.
- `session` and `aigateway` were not deployed.
- No env/secret flags were supplied; no secret was changed.
- New deployment: ID `2`, status `completed` / current active deployment,
  runtime `nodejs24`, created `2026-09-20T18:03:01.059537Z`.
- Function list remained limited to the existing `session`, `aigateway`, and
  `agentexecutor` functions; no schema, seed, card, credit, contract, or
  payment operation occurred.
- The Neon CLI exposes no remote bundle digest or source inspection endpoint.
  The exact current `agentexecutor` source directory was submitted and the
  deployment ID advanced, but an independent remote-content hash is not
  available. Runtime H2 evidence below is therefore reported conservatively.

### One fresh H2 attempt

- Agent challenge/verify completed once using the existing `pact-agent`
  keystore. All session artifacts were temporary mode-600 files and were
  shredded after the lane.
- Exactly one POST was sent to `/v1/payments/preflight` with
  `intent-req-1`; no retry or resubmit.
- Redacted response: HTTP `200`; keys
  `[chainId,checkedAt,decision,intentId,reasonCode,requestId]`; decision
  `declined`; reason `PREFLIGHT_DECLINED`; chain `5042002`; `checkedAt`
  present; request ID present; validation/PVL keys absent.
- Response was not `CARD_NOT_ELIGIBLE`, but it also did not contain a chain
  decision or validation record. The public envelope and empty Neon function
  logs cannot distinguish the stale-registry pre-chain path from the seeded
  intent's pre-chain expiry path. The expired seed intent is checked before
  `readCard`/static preflight in the current source.
- Therefore this is **not usable static-call evidence**, and no
  `would_settle`, verified-credit-expired chain result, or VERIFIED status is
  claimed. No second attempt was made.

### Counts and mutation delta

Immediately before the H2 POST (after the agent session bootstrap):

```text
cards=1 intents=1 sessions=3 challenges=4 payment_attempts=0
```

Immediately after the H2 POST:

```text
cards=1 intents=1 sessions=3 challenges=4 payment_attempts=0
```

H2 POST delta: `cards 0`, `intents 0`, `sessions 0`, `challenges 0`,
`payment_attempts 0`. The agent challenge/session rows were created by the
required session bootstrap before the H2 count baseline; the H2 request itself
created no rows.

### Closeout status

- H1: **BLOCKED — PROVIDER_ACCESS_UNRESOLVED**; H1 was not run.
- H2: **BLOCKED — PREFLIGHT_DECLINED with no usable static-call/PVL
  evidence**.
- H3: **PARTIAL**, unchanged.
- G22: **DRIFT**, unchanged.
- Phase 04: **COMPLETE_WITH_GAPS**, unchanged.
- No VERIFIED claim is made.
- No H1/H2 retry, payment, signer, gas, transaction, schema, seed, card,
  credit, contract, Supabase, commit, or push operation was performed.

## Recommended next action

Make the seeded `intent-req-1` non-expired through an explicitly approved,
bounded data-preparation lane, then obtain a new approval for one H2 attempt;
do not retry this lane and do not run H1.

## 13. H2 forensic preflight audit (2026-09-21)

### Classification

**`INTENT_EXPIRED`** — this is a data-preparation blocker, not an H2 runtime
code defect. H2 remains **not VERIFIED** because this investigation made no
live H2 call and therefore produced no usable static-call evidence.

### Read-only Neon evidence

One Node + `pg` transaction used `BEGIN READ ONLY` and parameterized `SELECT`
statements only. It neither printed a connection value nor performed any DML.

| Row | Read-only facts |
| --- | --- |
| `intents.intent_id = intent-req-1` | Present; `card_id=1`; `agent_id=0xdc26…31682`; `asset=arc-testnet-usdc`; `chain_id=5042002`; `policy_version=1`; `expires_at=2026-09-20T13:08:53.827Z` |
| `cards.card_id = 1` | Present; `owner_address=0xb8bd…14d52`; `agent_id=0xdc26…31682`; `status=ACTIVE`; `asset=arc-testnet-usdc`; `chain_id=5042002`; `policy_version=1`; `expires_at=2026-09-20T17:18:16.000Z` |

At audit time (2026-09-21), the intent had already expired. The intent and
card agree on the requested card, agent, Arc asset, chain, and policy fields;
this rules out an observed row-level intent/card binding miss as the immediate
blocker. The card expiry is a separate future data-preparation concern, but
the intent expiry is evaluated first.

### Exact early-return trace

1. The request authenticates as the card agent. The initial single-wallet
   scoped intent read is expected to miss because the card owner differs from
   the agent.
2. The Arc owner registry has the exact `intent-req-1` / card `1` /
   agent / chain `5042002` authorization entry.
3. The split-role owner+agent re-read uses the Neon adapter's parameterized
   predicate `intent_id + agent_id + cards.owner_address` and resolves the
   intent.
4. `handleReadOnlyPreflight` evaluates `expiresAt <= Date.now()` and returns
   HTTP 200 `declined` / `PREFLIGHT_DECLINED` before `cards.getById`.
5. Consequently neither `readCard` nor the static `preflightPay` call can run.

The relevant source order is `supabase/functions/agent-executor/index.ts`
lines 411–413 (intent expiry), 415 (card read), 504 (chain card read), and
512 (static preflight). The Arc registry is
`supabase/functions/_shared/owner-authorization.ts` lines 261–278; the Neon
intent read predicate is in `neon/adapter/neon-persistence.ts` lines 373–391.

### Local regression evidence

Focused local tests passed: **24/24** across the H2 owner-scoping and Neon
persistence suites. They cover the deployed `intent-req-1` split-role Arc
registry entry reaching four expected static RPC operations when future-dated,
the same intent declining with zero card/RPC reads when expired, and the exact
parameterized Neon intent/agent/owner query shape. API envelope, server-side
PVL, fail-closed behavior, and owner-agent authorization remain unchanged.

### Artifact boundary and next approval

Deployment ID `2` is recorded as active, but Neon CLI exposes no independent
remote bundle/source digest. This limitation does not authorize speculation
about deployed content; a deployment-content hash remains unproven. It also
does not change the directly observed data blocker above.

Do not retry H2, run H1/provider, deploy, or mutate the current rows under
this audit. The bounded next action requires separate approval to refresh the
expired `intent-req-1` preparation row (and assess/refresh the expired card
row if the approved H2 scenario requires it), followed by a separately
approved single H2 attempt. That later lane should verify the active deployment
through the available Neon deployment metadata and capture fresh static-call
evidence; it must not mark H2 VERIFIED beforehand.

## 14. Read-only H2 refresh feasibility audit (2026-09-21)

### Classification

**`CARD_REFRESH_REQUIRED`**. Intent refresh alone cannot unblock an eligible
H2 preflight. This audit made one Arc `eth_call` only; it did not call H1 or
H2, broadcast, deploy, or mutate Neon.

### Live Arc card read

The read-only `cards(1)` call against the deployed Arc controller returned:

| Field | Observed value | Feasibility impact |
| --- | --- | --- |
| Card status | `Active` (`1`) | Does not compensate for expiry. |
| Card policy version | `1` | Continues to match the seeded intent/registry. |
| Card expiry | `2026-09-20T17:18:16.000Z` | Expired at observation time. |
| Verified-credit expiry | `2026-09-19T17:46:19.000Z` | Expired at observation time. |

The card owner and agent still match the Arc seed facts. No URL, token,
private key, database connection value, or other secret was printed.

### Contract and ABI feasibility

Card expiry is **not immutable**. The owner-only
`updatePolicy(cardId, ownerConfiguredCap, perTransactionLimit, expiresAt,
allowlistedMerchants)` function in `PactCardController` validates a future
expiry, writes `cards[cardId].expiresAt`, and emits `PolicyUpdated`.
The same nonpayable function is present in the generated SDK ABI. This rules
out `NEW_CARD_REQUIRED` unless the existing card owner cannot supply the
separate authorization.

However, `preflightPay` rejects an expired card before the asset, merchant,
or credit checks. `availableCredit` also becomes zero after either card expiry
or verified-credit expiry. A newly dated intent would pass the current server
expiry early return but can only reach a static chain decline while card 1
remains expired; it cannot produce the desired eligible/would-settle result.

### Bounded future approval surface (not requested or executed)

1. **Card-owner Arc approval:** one owner-signed `updatePolicy` for existing
   card `1`, with a future `expiresAt`, the explicitly preserved or changed
   cap and per-transaction limit, and the exact raw bytes32 allowlist. This
   setter rewrites all of those policy fields, so it is not operationally an
   expiry-only update.
2. **ASC-authority approval:** one separately authorized
   `applyVerifiedCreditForAgent` using a fresh unused evidence ID, nonzero
   amount, and future credit expiry. The effective credit must cover the
   stored spend plus the proposed H2 amount.
3. **Only after both receipts:** a bounded Neon preparation may refresh
   off-chain facts to exact on-chain state; it is not authorized by this
   audit.

### Data and provenance dependencies for a later bounded preparation

| Surface | Required future treatment |
| --- | --- |
| `cards` row | Refresh `expires_at`, verified-credit value/expiry, and every policy field actually changed on-chain. Preserve card ID, owner, agent, controller, asset, chain, status, and policy version unless a signed on-chain action changes them. |
| `intents` row | Set a fresh `expires_at` no later than the refreshed card expiry; preserve card/agent/merchant/amount/asset/purpose/policy unless separately approved. Recompute and persist `intent_hash`, because canonical hashing includes `expiresAt`. |
| Owner registry | No change is required for an otherwise unchanged card-1 owner/agent/controller/chain/policy binding; its authorization expiry is already in 2027. Update only if one of those bound facts changes. |
| Provenance | Retain the card-creation `source_block` and `source_tx_hash` in both the cache row and registry. The schema has no separate policy-update provenance field, and the H2 authorization validator requires those two stored creation facts to remain equal. |
| Allowlist anchor | Preserve the registry-bound cache `allowlist_hash`; the raw allowlist supplied to `updatePolicy` remains on-chain authority and must be explicitly approved. |

The local seed validator independently rejects the current pair as
`card-expired`, requires an unexpired intent, and requires intent expiry not
to exceed card expiry. No live approval is requested by this record and H2
remains **not VERIFIED** pending a separately approved policy/credit refresh
and a separately approved single H2 attempt.

## 15. Controlled Arc refresh — Gate A prepared, awaiting approval (2026-09-21)

Risk class: payment / credit-accounting mutation. This record is preparation
and read-only verification only; it is not an approval to broadcast.

### Gate A — read-only preflight

The controller ABI and source agree on the exact owner-only mutator:

```solidity
updatePolicy(
  uint256 cardId,
  uint256 ownerConfiguredCap,
  uint256 perTransactionLimit,
  uint64 expiresAt,
  bytes32[] allowlistedMerchants
)
```

One read-only Arc preflight observed latest block `63129851` at timestamp
`1789928922`, then derived the proposed expiry as `1789928922 + 86400`:
`1790015322` / `2026-09-21T18:28:42.000Z`.

| Check | Expected | Observed | Result |
| --- | --- | --- | --- |
| Chain ID | `5042002` | `5042002` | GREEN |
| Controller owner | supplied owner | `0xB8Bd…14D52` | GREEN |
| ASC authority | supplied credit authority | `0x6E90…7313` | GREEN |
| Card 1 owner / agent | supplied role pair | matching on-chain pair | GREEN |
| Agent active card | `1` | `1` | GREEN |
| Card status | Active | `1` / Active | GREEN |
| Current cap | `100000000000000000` | matching | GREEN |
| Current per-tx limit | `10000000000000000` | matching | GREEN |
| Raw merchant allowlist | supplied bytes32 | `true` | GREEN |
| Policy version | `1` | `1` | GREEN |
| Simulated owner `updatePolicy` | no revert | pass | GREEN |

The prompt's mixed-case agent display was normalized to the same canonical
20-byte address already present in the on-chain card and registry; it is not a
role mismatch. Current verified credit is `100000000000000000`, current spent
is `10000000000000000`, and both card and verified-credit expiries remain in
the past until later approved mutations occur.

`updatePolicy` rewrites cap, per-transaction limit, expiry, and the whole
allowlist, but it does **not** write `policyVersion`; source constant
`POLICY_VERSION` remains `1`. Therefore this proposed refresh does not require
a registry or intent policy-version change. Any actual receipt that contradicts
this source-level conclusion stops the lane before Gate B.

### Prepared Gate A calldata

The following calldata contains no credential or secret and was simulated with
`from` equal to the verified owner. It preserves the requested cap, limit, and
single raw allowlist item:

```text
0x31e02c050000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000002386f26fc10000000000000000000000000000000000000000000000000000000000006ab1775a00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70
```

Decoded parameters:

```text
cardId: 1
ownerConfiguredCap: 100000000000000000
perTransactionLimit: 10000000000000000
expiresAt: 1790015322 (2026-09-21T18:28:42.000Z)
allowlistedMerchants: [0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70]
```

### Approval and mutation matrix

| Gate | Operation | Signer | Maximum transactions | State |
| --- | --- | --- | ---: | --- |
| A | `updatePolicy` with the exact calldata above | card owner only | 1 | **AWAITING EXPLICIT APPROVAL** |
| B | `applyVerifiedCreditForAgent` | credit authority only; never owner | 1 | BLOCKED until A receipt is GREEN |
| C | Neon card/intent preparation | separately approved Neon authority | 0 in this lane | BLOCKED until A+B receipts are GREEN and separate Neon approval exists |
| H2 | preflight endpoint | none | 0 | Explicitly excluded |

## 20. Deployment-2 `CARD_NOT_ELIGIBLE` source audit (2026-09-21)

### Classification

**`H2_CODE_BUG`**. The Arc card-1 registry bound `allowlistHash` to the
merchant-derived value `0x50ac913d8071d2c6532044666a6fdf27b3548ceb0856c45289610034a0c93152`,
while the authoritative on-chain card and Neon cache use the opaque raw
allowlist bytes32
`0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70`.
The split-role owner-authorization validator compares those fields exactly,
so the mismatch returns `CARD_NOT_ELIGIBLE` before either static chain call.

This corrects the earlier wording in §14: the registry-bound cache value for
this card must be the raw on-chain bytes32, not a merchant-derived stand-in.
The raw bytes32 has no established logical preimage; merchant membership stays
authoritative in on-chain `preflightPay`.

### Read-only source trace

The audited source comprises `agent-executor/index.ts`,
`agent-executor/chain-client.ts`, `neon/adapter/neon-persistence.ts`, and
`_shared/owner-authorization.ts`.

1. The initial single-wallet intent read scopes owner and agent to the agent
   session, so it intentionally misses for the split owner/agent roles.
2. The Arc registry finds `intent-req-1`, then the Neon adapter repeats the
   intent read with the registry owner plus the agent. That is the authorized
   split-role query shape.
3. The card lookup is owner-and-agent scoped. Lane/controller, asset, chain,
   agent, and policy bindings all pass for card `1`.
4. `validateOwnerAuthorization` compares registry/card provenance, policy,
   owner/agent, and allowlist. The values above fail here.
5. Consequently `client.readCard(cardId, agent)` and
   `client.preflight({...})` are not reached on the faulty configuration.

The HTTP entrypoint intentionally strips the server-side PVL validation record
from its public envelope. Therefore the absence of `validation` in the live
HTTP response is expected source behavior, not alone artifact-drift evidence.
This corrects the narrower inference in §19.

### Neon read-only binding receipt

A Node + `pg` `BEGIN READ ONLY` transaction read only `cards.card_id = '1'`
and `intents.intent_id = 'intent-req-1'`. It returned one row of each and no
mutation was issued.

| Binding | Observed value |
| --- | --- |
| Controller / owner / agent | `0x7a47…fc423` / `0xb8bd…14d52` / `0xdc26…31682` |
| Card / intent chain and asset | `5042002` / `arc-testnet-usdc` |
| Card / intent policy version | `1` / `1` |
| Card raw allowlist | `0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70` |
| Creation provenance | block `62948913`; tx `0x5bb8…79fb` |
| Card expiry / status | `2026-09-21T18:28:42.000Z` / `ACTIVE` |
| Intent expiry / status | `2026-09-20T19:08:13.000Z` / `ready` |
| Intent hash | `0x26bfb6302429cfe411cae8da1333a642799cc14c36dc9d1895d84af4b95d270f` |

The recorded credit and intent windows are historical at this audit time; no
H2 request was made or retried. They do not change the binding root cause at
the prior `2026-09-20T18:57:06.182Z` response time.

### Deterministic regression evidence and repair

The focused Vitest test injects a spy-only `ReadOnlyRpcPaymentClient` using
the deployment-2 intent/card IDs, chain `5042002`, controller, owner/agent
split, raw allowlist, and the H2-time card, credit, and intent expiries.

- With the old merchant-derived registry anchor: HTTP `200`,
  `declined/CARD_NOT_ELIGIBLE`; `readCard` calls `0`; `preflight` calls `0`.
- With the repaired raw on-chain registry anchor: HTTP `200`,
  `would_settle`; `readCard("1", canonicalAgent)` calls `1`; static
  `preflight` calls `1` with card `1`, canonical agent, asset
  `arc-testnet-usdc`, merchant `arc-demo-merchant`, amount
  `10000000000000000`, nonce `1:1`, policy `1`, and deadline `1789931293`.

The minimal source repair changes only the card-1 registry allowlist anchor
and its documentation comment. It preserves the public envelope, PVL
server-side behavior, fail-closed authorization, owner/agent split-role
checks, provenance checks, and on-chain static preflight as merchant-membership
authority. No Neon row was changed.

### Deployment/static-evidence boundary

Deployment `2` was not redeployed in this audit. The live
`CARD_NOT_ELIGIBLE` response is consistent with the pre-repair source path,
but function metadata does not provide an immutable source commit or bundle
digest; the exact deployed artifact remains **unproven**. No live lane request
was made here, and there is still no usable live `readCard` or static-preflight
evidence.

Before any separately approved fresh H2 cycle, require either immutable
deployment provenance (commit plus bundle digest associated with deployment
ID) or a redacted operator-only execution-stage record that names the
pre-chain/`readCard`/`preflight` stages and arguments without secrets. Neither
mechanism requires changing the public HTTP envelope.

### No-side-effect matrix

| Surface | Operation | Result |
| --- | --- | --- |
| Neon | one transaction, `READ ONLY`, two selected rows | GREEN; no write |
| Chain / H2 | no request, static call, payment, broadcast, or retry | none |
| Function deployment | no deploy | none |
| Source | registry anchor + deterministic regression test only | repaired locally |
| Git | no commit or push | none |

H2 remains **not VERIFIED**. This audit supplies local static-call-path proof
only; it does not supply live static-call evidence.

### Gate B preparation — read-only (2026-09-21)

`CREDIT_EVIDENCE_ID` was accepted only as an in-memory `bytes32` input. It is
redacted below and was not written to this evidence record. The check loaded no
signer, made view calls only, and did not simulate or invoke the credit
mutator.

| Check | Observed | Result |
| --- | --- | --- |
| Chain | `5042002` | GREEN |
| Latest block / timestamp | `63130666` / `1789929330` | GREEN |
| ASC authority | matches `0x6E9070dDA153C7bbb975DdAa696F292a10907313` | GREEN |
| Card binding | active-card ID `1`; card status Active; canonical agent matches | GREEN |
| Evidence | `usedEvidence(0x4029fdf0…8111f911)` is `false` | GREEN |
| Credit amount | `100000000000000000` | GREEN |
| Proposed credit expiry | `1789930530` / `2026-09-20T18:55:30.000Z` | GREEN |
| Card expiry bound | proposed expiry is earlier than `1790015322` / `2026-09-21T18:28:42.000Z` | GREEN |
| Role separation | credit authority differs from the card owner; no owner signer was loaded | GREEN |

The one-transaction approval candidate is deliberately redacted:

```text
applyVerifiedCreditForAgent(
  agent = 0xdc26A45c3166c28A3a3A6e02fC8A3BA88d631682,
  evidenceId = 0x4029fdf0…8111f911,
  amount = 100000000000000000,
  expiresAt = 1789930530
)
required signer: 0x6E9070dDA153C7bbb975DdAa696F292a10907313
maximum broadcasts: 1
```

This is preparation only, not approval. No `applyVerifiedCreditForAgent`
transaction, retry, Neon mutation, H1/H2 request, payment, deployment,
commit, or push occurred. A new explicit approval for exactly this transaction
is required before any Gate B broadcast.

### Gate B execution stop — signer unavailable (2026-09-21)

The separate Gate B approval was received. Before any broadcast, the local
account inventory was checked without reading key material: it contains only
the card owner and agent accounts. The local keystore inventory likewise
contains only `pact-owner` and `pact-agent`; no credit-authority account is
available. A names-only environment-variable check found no provisioned Arc /
Pact / credit-authority credential reference.

This is a signer-unavailable stop condition. The required authority
`0x6E9070dDA153C7bbb975DdAa696F292a10907313` must not be substituted with the
owner or agent. Accordingly, **zero** Gate B transactions were broadcast; no
retry, Neon mutation, H1/H2 request, payment, deployment, commit, or push was
performed. A securely provisioned credential for the exact authority is needed
before a new, freshly preflighted one-transaction approval can be acted upon.

### Gate B final preflight — new evidence ID (2026-09-21)

This supersedes the earlier, unused approval candidate. A new CSPRNG-generated
`bytes32` evidence ID was checked by `usedEvidence` before any signing or
broadcast. The preflight loaded no signer and used only RPC reads plus
`eth_estimateGas` from the authority address; neither operation changes chain
state.

| Check | Observed | Result |
| --- | --- | --- |
| Chain | `5042002` | GREEN |
| Latest block / timestamp | `63131178` / `1789929586` | GREEN |
| ASC authority | matches `0x6E9070dDA153C7bbb975DdAa696F292a10907313` | GREEN |
| Card binding | active-card ID `1`; card status Active; canonical agent matches | GREEN |
| New evidence ID | `0x29416ed5f9733588af93b83fae13c4b949039cf8ed0cee30b462b718b2936217`; unused | GREEN |
| Amount | `100000000000000000` | GREEN |
| Proposed credit expiry | `1789930786` / `2026-09-20T18:59:46.000Z` | GREEN |
| Card expiry bound | proposed expiry is earlier than `1790015322` / `2026-09-21T18:28:42.000Z` | GREEN |
| Authority gas | estimate `62379`; 20% headroom cost `3368475000000000` wei; balance `19997536200000000000` wei | GREEN |
| Role separation | authority is distinct from owner; owner and agent keys were not used | GREEN |

The exact one-transaction approval candidate is:

```text
applyVerifiedCreditForAgent(
  agent = 0xdc26A45c3166c28A3a3A6e02fC8A3BA88d631682,
  evidenceId = 0x29416ed5f9733588af93b83fae13c4b949039cf8ed0cee30b462b718b2936217,
  amount = 100000000000000000,
  expiresAt = 1789930786
)
required signer: 0x6E9070dDA153C7bbb975DdAa696F292a10907313
maximum broadcasts: 1
```

No key material was read or printed. No broadcast, retry, Neon mutation,
H1/H2 request, payment, deployment, commit, or push occurred. A separate
explicit approval for exactly this candidate is required before Gate B can
broadcast.

### Gate B execution and verification (2026-09-21)

After the separate Gate B approval, exactly one
`applyVerifiedCreditForAgent` transaction was broadcast using the verified
credit-authority signer. No owner or agent key was used and no retry was made.

| Evidence | Verified value | Result |
| --- | --- | --- |
| Transaction | `0x7dd80886fa0dc973dfe3440049d725ec2e4ca8303bd4863caa1a513311a5e028` | GREEN |
| Receipt | status `1`, block `63131272` | GREEN |
| Caller / destination | credit authority `0x6E9070dDA153C7bbb975DdAa696F292a10907313` / specified controller | GREEN |
| Mined function input | canonical agent, the approved evidence ID, amount `100000000000000000`, expiry `1789930786` | GREEN |
| `CreditVerified` event | card `1`, canonical agent, same evidence ID, amount, and expiry | GREEN |
| Evidence replay guard | `usedEvidence(evidenceId)` is now `true` | GREEN |
| Card credit state | verified credit `100000000000000000`; expiry `1789930786` / `2026-09-20T18:59:46.000Z` | GREEN |
| Available credit | `90000000000000000` after stored spend `10000000000000000` | GREEN |
| Card policy facts | Active, cap/limit/allowlist and policy version `1` unchanged | GREEN |

### Gate C on-chain handoff facts — read-only (2026-09-21)

After both on-chain receipts were GREEN, a final read-only controller snapshot
at block `63131321` / timestamp `1789929658` confirmed:

| Field | Value |
| --- | --- |
| Chain / controller | `5042002` / specified controller |
| Owner / agent / active card | preserved owner, canonical agent, card `1` |
| ASC authority | `0x6E9070dDA153C7bbb975DdAa696F292a10907313` |
| Card status / policy version | Active (`1`) / `1` |
| Cap / per-transaction limit | `100000000000000000` / `10000000000000000` |
| Raw merchant allowlist | supplied merchant ID is `true` |
| Card expiry | `1790015322` / `2026-09-21T18:28:42.000Z` |
| Verified credit / credit expiry | `100000000000000000` / `1789930786` (`2026-09-20T18:59:46.000Z`) |
| Spent / available credit | `10000000000000000` / `90000000000000000` |

**Gate C remains blocked pending a separate Neon approval.** That bounded
mutation must update only on-chain-aligned card facts and refresh
`intent-req-1` inside the short verified-credit window, recomputing the
canonical intent hash. It must preserve the registry-bound policy version and
creation provenance. No Neon mutation, H1/H2 call, payment, deployment,
commit, or push has occurred.

## 16. Gate C bounded Neon refresh — executed (2026-09-20)

The separately approved bounded preparation was executed after a fresh Arc
read-only preflight. Chain ID `5042002`, the card's Active status, policy
version `1`, owner/agent/controller, cap/limit, raw allowlist, verified credit,
and credit expiry were all GREEN. Credit expiry was future under both latest
chain time and the executor clock, so the approved fail-closed stop condition
did not apply.

### Scope and SQL mutation matrix

One serializable Neon transaction (database transaction ID `6146`) locked and
read exactly `cards.card_id = '1'` and `intents.intent_id = 'intent-req-1'`.
All identity, lane, policy, status, allowlist, and creation-provenance
conditions were included as static parameterized predicates on the updates.
Any mismatch would have rolled back.

| Statement class | Target | Effect | Row count |
| --- | --- | --- | ---: |
| `SELECT … FOR UPDATE` | card `1` | pre-write binding validation only | 1 |
| `SELECT … FOR UPDATE` | intent `intent-req-1` | pre-write binding validation only | 1 |
| `UPDATE cards` | card `1` only | set chain-aligned expiry, verified-credit amount/expiry, spent, status, and audit timestamp | 1 |
| `UPDATE intents` | intent `intent-req-1` only | set bounded expiry and recomputed canonical hash | 1 |
| `INSERT` / `DELETE` | any table | none | 0 / 0 |
| Sessions, challenges, payment attempts, registry | any row | none | 0 |

No SQL text or parameters carried a secret. The Neon binding was consumed only
by Node + `pg`; its URL was never printed.

### Before / after

| Field | Before | After |
| --- | --- | --- |
| Card expiry | `2026-09-20T17:18:16.000Z` | `2026-09-21T18:28:42.000Z` |
| Verified credit | `100000000000000000` | `100000000000000000` |
| Verified-credit expiry | `2026-09-19T17:46:19.000Z` | `2026-09-20T18:59:46.000Z` |
| Spent / status | `10000000000000000` / Active | unchanged |
| Intent expiry | `2026-09-20T13:08:53.827Z` | `2026-09-20T18:54:46.000Z` |
| Intent hash | `0x96733916cf3f767a24d7f6069c34b3a7f614b4b13fefda4411c20e33b72b413a` | `0x3b68e7859caca09ccb7018f50d314251cf743d8eb6485d1812e923a7e8bfa5b6` |

The intent expiry uses a bounded `300`-second safety margin before the
verified-credit expiry. It remains before both the credit expiry and the card
expiry.

These card facts were preserved verbatim: controller
`0x7a474c005433def5fc496d2016f6ae794edfc423`, owner
`0xb8bdcc633cd8e67250358d807918f99dc0c14d52`, agent
`0xdc26a45c3166c28a3a3a6e02fc8a3ba88d631682`, asset
`arc-testnet-usdc`, chain `5042002`, policy version `1`, cap
`100000000000000000`, limit `10000000000000000`, raw allowlist hash,
creation block `62948913`, and creation transaction
`0x5bb8ce7b9c67dfc934730be8e6c4bbfc293e7d3273d2656b6609c7904e1e79fb`.
The intent preserves its card/agent/asset/chain/policy/status, merchant,
amount, purpose, provider/model, request ID, and idempotency key.

### Canonical hash and independent read-back

The new hash was recomputed with the current source implementation
`packages/domain/src/canonical-hash.ts`, using the persisted intent fields and
new ISO expiry. A separate `READ ONLY` Neon transaction read both rows back
verbatim; a separate Arc view read confirmed the cache matches the controller:
Active status, policy version `1`, cap/limit, credit/credit expiry, spent, card
expiry, agent, and raw merchant allowlist. The recomputed hash exactly matches
the persisted value above, and all cross-field bindings are GREEN.

This is a data-preparation receipt, not H2 evidence. H1/H2 were not called;
no contract mutation, deployment, payment, commit, or push occurred. H2
remains **not VERIFIED** until a separately approved, usable static-call
attempt is captured within the short credit window.

## 17. Fresh H2 Neon Arc approval — fail-closed deployment stop (2026-09-20)

### Classification

**`DEPLOYMENT_ARTIFACT_UNPROVEN`**. The approved H2 attempt was not made.
No session challenge/verify and no `POST /v1/payments/preflight` occurred,
because the exact Neon `agentexecutor` deployment-2 endpoint and its runtime
configuration could not be proven without targeting a different deployment.

### Fresh data preflight

At Arc block `63132044`, timestamp `1789930019`
(`2026-09-20T18:46:59.000Z`), all state prerequisites were GREEN:

| Check | Result |
| --- | --- |
| Chain | `5042002` |
| Intent window | current chain time earlier than `2026-09-20T18:54:46.000Z` |
| Card | card 1 Active; expiry still future |
| Credit | verified credit still valid through `2026-09-20T18:59:46.000Z` |
| On-chain binding | canonical burner is active-card agent; raw merchant remains allowed |
| Neon card/intent | exact two target rows exist with the Gate C expiry/hash and Arc lane bindings |
| Neon persistence | `NEON_DATABASE_URL` binding was present and a Node + `pg` `READ ONLY` transaction succeeded |

### Deployment-readiness stop

The local runtime binding check found `NEON_DATABASE_URL`, `SESSION_URL`, and
the prepared H2 session-token variable present by name, but **no
`ARC_RPC_URL` binding**. `SESSION_URL` resolves to the existing Supabase
project function path (`/functions/v1/session`), not to the approved Neon
project/function. It therefore cannot lawfully be substituted for Neon
`agentexecutor` deployment 2.

`neonctl functions list --project-id polished-dream-04296130` was attempted
read-only solely to discover the deployment URL. The Neon CLI rejected the
stored profile session as unauthenticated before returning any function
metadata. No deployment, CLI write, or fallback endpoint was used.

### No-side-effect evidence

A final Node + `pg` `READ ONLY` count snapshot recorded: agent sessions `2`,
agent challenges `3`, payment attempts for `intent-req-1` `0`, target card
rows `1`, and target intent rows `1`. Because the flow stopped before session
or H2 invocation, these are both the pre/post counts for this aborted attempt.
No payment, signer, gas operation, transaction, broadcast, Neon mutation,
H1 call, commit, or push occurred.

There is no HTTP status, decision/reason code, request ID, checkedAt field, or
chain static-call evidence to report: manufacturing any of those without the
proven endpoint would be misleading. H2 remains **not VERIFIED**. A renewed
Neon CLI/API authentication or an explicitly supplied verified deployment-2
URL plus proof that its `ARC_RPC_URL` and Neon persistence bindings are GREEN
is required before a new one-attempt H2 approval can be used.

## 18. Fresh H2 recovery cycle — Arc + Neon (2026-09-20)

The operator authorized the bounded recovery gates in advance. Each gate still
used a fresh fail-closed preflight; no fallback signer, retry, H1 call, payment,
or H2 endpoint substitution was used.

### Phase 1/2 — read-only decision

At block `63132750` / `2026-09-20T18:52:54.000Z`, card 1 was Active, policy
version `1`, and unexpired through `2026-09-21T18:28:42.000Z`. Cap
`100000000000000000`, per-transaction limit `10000000000000000`, canonical
agent binding, raw merchant allowlist, and Neon card/intent lane bindings were
all GREEN. Therefore **Gate A was skipped**: no `updatePolicy` was prepared or
broadcast.

The old verified-credit window was still technically live during the read but
the recovery proceeded with a newly bounded credit record. No owner or agent
key was used.

### Phase 3 — Gate B credit recovery

Fresh evidence ID
`0x4332fe9b6ebe874c7bc31561e8c62e7b31c9cc8ff386da2cedbb0a64e9872a27`
was CSPRNG-generated and read as unused. The preflight checked chain `5042002`,
ASC authority, active card/agent, amount `100000000000000000`, expiry before
card expiry, and gas headroom (estimate `62379`). All were GREEN.

Exactly one authority-signed transaction was broadcast, with no retry:

| Evidence | Value |
| --- | --- |
| Transaction | `0xe991edf76f653783f4c0201f787aefb098f1b6016824c11e4f43fd09766615b0` |
| Receipt | status `1`, block `63132812` |
| Caller | `0x6E9070dDA153C7bbb975DdAa696F292a10907313` (credit authority) |
| Event | `CreditVerified` card `1`, canonical agent, same evidence ID, amount `100000000000000000`, expiry `1789931593` / `2026-09-20T19:13:13.000Z` |
| Replay guard | evidence is now used |
| Available credit | `90000000000000000` |

### Phase 4 — Gate C bounded Neon refresh

After receipt GREEN, a single serializable Neon transaction (`6160`) locked,
validated, and updated only the two authorized rows. It updated no session,
challenge, payment-attempt, registry, or other row; inserts/deletes were zero.

| Target | Before | After |
| --- | --- | --- |
| `cards/1` credit expiry | `2026-09-20T18:59:46.000Z` | `2026-09-20T19:13:13.000Z` |
| `cards/1` credit / spent / status | preserved values | `100000000000000000` / `10000000000000000` / Active |
| `intents/intent-req-1` expiry | `2026-09-20T18:54:46.000Z` | `2026-09-20T19:08:13.000Z` |
| `intents/intent-req-1` hash | `0x3b68e7859caca09ccb7018f50d314251cf743d8eb6485d1812e923a7e8bfa5b6` | `0x26bfb6302429cfe411cae8da1333a642799cc14c36dc9d1895d84af4b95d270f` |

The new intent expiry is exactly 300 seconds before the refreshed credit
expiry. `packages/domain/src/canonical-hash.ts` recomputed the persisted hash;
a separate Neon read-back verified owner/agent/controller, Arc asset/chain,
policy `1`, cap/limit, raw allowlist, creation provenance, and all cross-row
bindings.

### Phase 5 — fresh H2 gate

At block `63132885` / `2026-09-20T18:54:02.000Z`, card, credit, and new intent
windows were all future, and the Neon hash/binding read-back was GREEN.
However, the previous deployment blocker remains: local Neon runtime readiness
cannot prove an `ARC_RPC_URL` binding, and the available `SESSION_URL` is a
Supabase function endpoint rather than the approved Neon `agentexecutor`
deployment. Neon CLI function discovery remains unavailable because its stored
profile session is rejected as unauthenticated.

Accordingly, no agent session was created and no H2 POST was sent. The cycle
ends **`DEPLOYMENT_ARTIFACT_UNPROVEN`**; it does not mark H2 VERIFIED and has
no usable static-call evidence. H1 remains BLOCKED. No deployment, commit, or
push occurred.

## 19. Fresh H2 Neon Arc attempt — static evidence still unproven (2026-09-20)

Neon CLI authentication was renewed and read-only function metadata confirmed
the exact target: `agentexecutor`, active/current deployment `2`, status
`completed`, Node.js 24 runtime. Its deployment metadata lists both
`ARC_RPC_URL` and `PERSISTENCE_BACKEND`. The Neon `session` function deployment
was likewise confirmed before session creation; the Supabase `SESSION_URL` was
not used.

### Fresh preflight and one-attempt execution

Immediately before session/H2, Arc block `63133095` / timestamp `1789930547`
and a Neon `READ ONLY` transaction confirmed card/credit/intent windows,
policy, agent, raw allowlist, lane, and canonical hash all GREEN. Pre-attempt
counts were sessions `2`, challenges `3`, and payment attempts for
`intent-req-1` `0`.

Exactly one Neon session challenge and one verify completed with HTTP `200`.
The session message/signature, nonce, and issued token are intentionally not
recorded. The final in-process read-only chain + Neon freshness gate remained
GREEN, then exactly one `POST /v1/payments/preflight` was sent to the confirmed
Neon `agentexecutor` deployment URL:

| Field | Observed value |
| --- | --- |
| HTTP status | `200` |
| Decision | `declined` |
| Reason code | `CARD_NOT_ELIGIBLE` |
| Chain ID | `5042002` |
| Checked at | `2026-09-20T18:57:06.182Z` |
| Request ID | `h2-neon-recovery-1789930613864` |
| Payment attempts after | `0` |
| Sessions / challenges after | `3` / `4` |

No payment, gas, EVM signer, transaction, broadcast, H1 call, Neon data
update, deployment, commit, or push occurred. The only cryptographic operation
was the required local agent message signature for the explicitly authorized
session verify; it did not sign an EVM transaction.

### Static-call evidence decision

**`DEPLOYMENT_ARTIFACT_UNPROVEN`; H2 is not VERIFIED.** The source path can
emit `CARD_NOT_ELIGIBLE` both before the chain `readCard` and after it. In the
current source either such branch carries a `validation` record, but the live
response exposed only the six basic fields above and no validation/static-call
record. Read-only Neon log queries by request ID and by `agentexecutor` service
over the attempt window returned no records. Those facts do not prove whether
the required chain read/static preflight occurred.

Therefore this is a fresh, correctly scoped H2 response receipt but **not**
usable chain static-call evidence. There was no retry. The next investigation
must reconcile the deployment-2 response envelope/log instrumentation with
the source before any newly approved H2 attempt; it must not mark H2 VERIFIED
from this receipt.

No `cast send`, wallet/key construction, deployment, payment, H1/H2 request,
or Neon mutation occurred. No receipt, block, post-state, or event can be
claimed yet. On a later Gate A approval, a signer/caller mismatch, stale
calldata expiry, reverted simulation, failed receipt, or any unexpected
post-state is a stop condition with no retry.

### Gate B and Gate C status

Gate B has not started. It remains conditional on a successful Gate A receipt,
then must prove the same authority, active card/agent binding, a fresh unused
evidence ID, amount `100000000000000000`, a credit expiry of current time plus
`1200` seconds, and that the credit expiry is earlier than the refreshed card
expiry before requesting its own one-transaction approval.

Gate C has not started. It requires both on-chain receipts first, then a
separate Neon approval before changing the card cache or `intent-req-1`.
That later preparation must recompute the canonical intent hash after setting
an intent expiry inside the credit and card windows; H2 remains out of scope.

### Gate A execution and verification (2026-09-21)

After the separate Gate A approval, exactly one owner-signed
`updatePolicy` transaction was broadcast. No retry was made.

| Evidence | Verified value | Result |
| --- | --- | --- |
| Transaction | `0x928bdf6838c4ccd76021e2dd9aa52dd8ed255d49d06569a0d97aa43289ebe986` | GREEN |
| Receipt | status `1`, block `63130027` | GREEN |
| Caller / destination | owner `0xB8Bdcc633cd8e67250358D807918f99dc0c14D52` / specified controller | GREEN |
| Mined function input | `updatePolicy` selector and all decoded prepared arguments | GREEN |
| `PolicyUpdated` event | card `1`, cap `100000000000000000`, limit `10000000000000000`, expiry `1790015322` | GREEN |
| Post-state owner / agent / status | unchanged owner, canonical agent, Active (`1`) | GREEN |
| Post-state policy | cap and limit unchanged; raw merchant remains allowlisted | GREEN |
| Post-state expiry | `1790015322` / `2026-09-21T18:28:42.000Z` | GREEN |
| Post-state policy version | `1` (unchanged) | GREEN |

The mined calldata was the prepared bounded input: card `1`, the supplied
cap and per-transaction limit, the one supplied raw merchant ID, and expiry
`1790015322`. Therefore neither the registry nor the intent needs a
policy-version update. This verification output deliberately excludes RPC URLs,
passwords, tokens, and private-key material.

Verified credit has **not** been refreshed: it remains
`100000000000000000` with expiry `1789839979` /
`2026-09-19T17:46:19.000Z`, which is already expired. No Gate B transaction,
Neon mutation, H1/H2 request, payment, or deployment was performed.

### Updated mutation matrix

| Gate | Operation | Signer | Maximum transactions | State |
| --- | --- | --- | ---: | --- |
| A | `updatePolicy` | card owner only | 1 | **GREEN — one successful transaction; no retry** |
| B | `applyVerifiedCreditForAgent` | credit authority only; never owner | 1 | **NOT STARTED** — requires a concrete fresh, unused `bytes32` evidence ID, read-only preflight, and a new explicit approval |
| C | Neon card/intent preparation | separately approved Neon authority | 0 in this lane | BLOCKED until Gate B is GREEN and a separate Neon approval exists |
| H2 | preflight endpoint | none | 0 | Explicitly excluded |

## 22. H2 `CARD_NOT_ELIGIBLE` audit completion addendum (2026-09-21)

The read-only audit in §20 is the final result for this task:
**`H2_CODE_BUG`**, caused by the registry's merchant-derived allowlist anchor
not matching the raw on-chain card allowlist. The local repair and spy-based
regression coverage are complete; the exact deployment-2 artifact and live
static-call receipt remain unproven. No live lane was run, H2 is not VERIFIED,
and no commit or push was performed.

## 23. Neon agentexecutor allowlist-anchor redeploy and fresh-cycle stop (2026-09-21)

### Preflight before deployment

The source registry was read-only verified to use the raw Arc card allowlist
bytes32, not the merchant-derived hash. The focused H2 suite passed `15/15`
and the full Vitest suite passed `57` files / `344` tests. No secret value was
read or recorded.

At Arc block `63134576`, chain timestamp `1789931288`, the read-only preflight
returned chain `5042002`, card `1` Active with policy version `1`, card expiry
`1790015322`, verified-credit expiry `1789931593`, available credit
`90000000000000000`, and `isCardExpired=false`. The Neon `READ ONLY` read
returned exactly one target card row and one `intent-req-1` row. Controller,
owner, canonical agent, card/intent lane, policy, raw allowlist, creation
provenance, card expiry, credit expiry, intent hash, and intent bindings
matched. At that instant the intent expiry `1789931293` was still ahead of the
chain timestamp.

### Deployment receipt

Read-only metadata captured deployment `2` as the baseline. The first deploy
invocation stopped in the CLI argument parser before creating a deployment.
The corrected invocation supplied the explicit `index.ts` source entry and
deployed only slug `agentexecutor` to project `polished-dream-04296130`,
branch `main`, runtime `nodejs24`, without any `--env` arguments.

| Check | Result |
| --- | --- |
| New deployment | ID `3`, status `completed`, runtime `nodejs24` |
| Active/current | deployment `3`, status `completed` |
| Previous version | deployment `2` before deploy |
| Other functions | `session` remains deployment `2`; `aigateway` remains deployment `2` |
| Secrets/schema/seed/Neon rows | no change requested or performed |
| Remote bundle digest | not supplied by Neon function metadata; artifact digest remains unproven |

No session, aigateway, H1, H2, payment, signer, gas, broadcast, Neon row
mutation, commit, or push occurred during deployment.

### Post-deploy expiry gate and stop

At Arc block `63134822`, chain timestamp `1789931413`, the card remained Active
and unexpired, and verified credit remained future until `1789931593`. The
intent expiry was `1789931293`, so it was expired by approximately `120` chain
seconds. The post-deploy decision is **`INTENT_EXPIRED`**.

Per the bounded-cycle rule, the lane stopped immediately. No agent session was
created, no `POST /v1/payments/preflight` was sent, and no live `readCard` or
static-preflight evidence is claimed. The next cycle requires a fresh Gate B
verified-credit refresh (new unused evidence ID and authority receipt), then a
separate Gate C Neon update of the intent expiry and canonical hash, followed
by a separately gated one-attempt H2 preflight. No old intent, credit window,
session, token, or request may be reused.

H2 remains **not VERIFIED**. The successful deployment is recorded, but Neon
still provides no remote bundle digest and no usable live static-call evidence
exists.

## 24. Fresh H2 recovery after deployment 3 (2026-09-21)

### Gate B — one authority transaction

Read-only preflight at block `63135203`, chain timestamp `1789931605`,
confirmed chain `5042002`, ASC authority and derived signer both
`0x6E90…7313`, card `1` Active, canonical agent, active-card binding, unused
fresh evidence, sufficient authority balance, and credit expiry before card
expiry. The candidate amount was `100000000000000000`; proposed expiry was
`1789932805` (latest chain timestamp plus 1200 seconds).

The operator's standing auto-approval authorized exactly one mutator. The
single authority-signed transaction was:

| Evidence | Value |
| --- | --- |
| Transaction | `0x0f45450b31541f2d98e62dd83029e70723244935b4b48c534b05bfd9baeefdd8` |
| Receipt | status `1`, block `63135233` |
| Caller | credit authority `0x6E90…7313` |
| Event | `CreditVerified`, card `1`, canonical agent, fresh evidence ID, amount `100000000000000000`, expiry `1789932805` |
| Replay guard | `usedEvidence=true` |
| Post-state | verified credit `100000000000000000`; available credit `90000000000000000` |

No owner or agent key was used; no retry or second broadcast occurred.

### Gate C — two-row Neon refresh

After the GREEN receipt, one serializable Neon transaction (`6192`) read and
locked only `cards.card_id = '1'` and `intents.intent_id = 'intent-req-1'`.
It refreshed the card credit facts and set the intent expiry exactly 300
seconds before credit expiry. The current implementation recomputed the
canonical hash as:

`0x7b69d523faca29671c083abff9f2588d69b550504c32fc2d282b337c208e90e8`

| Target | Before | After |
| --- | --- | --- |
| Card verified-credit expiry | `2026-09-20T19:13:13Z` | `2026-09-20T19:33:25Z` |
| Card credit / spent / status | `100000000000000000` / `10000000000000000` / `ACTIVE` | unchanged values, on-chain aligned |
| Intent expiry | `2026-09-20T19:08:13Z` | `2026-09-20T19:28:25Z` |
| Intent hash | `0x26bf…d270f` | `0x7b69…90e8` |

Read-back and Arc cross-check were GREEN: controller/owner/agent, chain/asset,
policy, raw allowlist, creation provenance, card status/expiry, credit expiry,
intent binding, and hash all matched. Mutation matrix: card updates `1`, intent
updates `1`, inserts `0`, deletes `0`, other rows `0`.

### Fresh H2 — one session and one POST

The final pre-request read-only gate passed at Arc blocks `63135513` and
`63135530`; intent hash remained the new canonical value and all card, credit,
intent, lane, status, allowlist, and expiry checks were still GREEN.

Exactly one new agent challenge and one verify completed with HTTP `200`, using
the approved agent burner. The session artifacts are not recorded. Exactly one
`POST /v1/payments/preflight` was then sent with request ID
`h2-neon-recovery-1789931754761`.

| Field | Result |
| --- | --- |
| HTTP status | `503` |
| Decision / reason | no decision envelope; `PREFLIGHT_DECLINED` service response |
| Chain ID / checkedAt | not returned |
| Session counts | `4→5`; challenges `5→6` |
| Payment attempts | `0→0` |
| Neon logs | no logs found for this request ID in the 15-minute read-only window |

This response supplies no usable `readCard` or static-preflight evidence. The
public envelope intentionally omits PVL internals, and the empty logs do not
prove whether the deployed function reached its chain client. The exact remote
bundle digest is also unavailable from Neon metadata. Therefore the result is
**`DEPLOYMENT_ARTIFACT_UNPROVEN`**, H2 is **not VERIFIED**, and no retry was
made.

No H1, payment, signer transaction, gas operation, broadcast beyond the single
Gate B credit transaction, Neon mutation beyond Gate C's two rows, commit, or
push occurred. A future H2 cycle requires deployment provenance or redacted
operator-only stage evidence before another one-attempt preflight is approved.
