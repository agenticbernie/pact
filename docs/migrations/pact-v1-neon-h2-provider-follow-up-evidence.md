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
