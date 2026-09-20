# Fresh H1–H3 Authenticated Arc Lane Evidence (2026-09-19, REDACTED)

Date: 2026-09-19 (UTC) · Branch: `main` · Project `myotkovmgzdabuirkqlx`.
Lane: EXACTLY one H1 + one H2 + one H3 call with the bootstrapped session
token, per approval. No retry (deterministic codes), no second live call,
no deploy, no seed/change, no OpenAI contact beyond the (unreached) server
path, no signer/key use, no broadcast, no commit/push. Session token used
only as an opaque `Authorization` value; NEVER printed, logged, or
persisted. No prompt, body, token, or raw response recorded — keys, codes,
and redacted metadata only.

## 1. Session (observed, not exposed)

Fresh disposable wallet (neither card owner nor agent — recorded as lane
fact, value withheld with the token), role `user`, ~27min TTL at lane
start. Auth PASSED on both protected routes (no 401s — first time the
lane clears application auth; region gates also pass).

## 2. H1 — intent route: BLOCKED at card scoping (no provider contact)

- `POST /functions/v1/ai-gateway/v1/agent/intents`,
  `{prompt, cardId:"1"}`, corr `h1-arc-auth-1`.
- ONE attempt: HTTP **400**, keys `[code,message,requestId,retryable]`,
  code `CARD_NOT_ELIGIBLE`, latency `2375ms`.
- Cause: gateway resolves the card owner-scoped
  (`ownerAddress = sessionWallet`); the session wallet is not the card
  owner, so no card resolves and the request fails closed BEFORE provider,
  persistence, or chain work. Zero OpenAI calls, zero writes.
- Redacted: `{provider:"openai", model:"gpt-5.6-luna", attempts:1,
  providerRequestId:"not-returned", latencyMs:2375,
  decision:"CARD_NOT_ELIGIBLE", storeConfirmed:false,
  allowFallbackAsserted:false}`.
- **H1 BLOCKED.** An OWNER session is required for H1's card lookup.

## 3. H2 — read-only preflight: BLOCKED at scoping (no chain contact)

- `POST /functions/v1/agent-executor/v1/payments/preflight`,
  `{intentId:"intent-req-1"}`, corr `h2-arc-auth-1`.
- ONE attempt: HTTP **200**, exact H2 shape
  `[chainId,checkedAt,decision,intentId,reasonCode,requestId]`,
  decision `declined`, reason `PREFLIGHT_DECLINED`, chain `5042002`,
  latency `2159ms`. No retry. Zero RPC calls, zero tx/gas/signer ops.
- Cause chain: single-wallet lookup misses (session wallet is neither
  owner nor agent) AND the split-role registry misses (entry is keyed to
  `intent-arc-1`/agent while the seeded intent is `intent-req-1`) — both
  fail-closed before any chain read. Seeded rows never reached.
- **H2 BLOCKED** (no usable static-call evidence).

## 4. H3 — health: PARTIAL (unchanged)

- ONE GET `/functions/v1/ai-gateway/health`: HTTP **200**, exact
  seven-key shape, `chainId` 5042002, provider `openai`,
  `modelAvailable` false. **H3 PARTIAL.**

## 5. Budgets, deltas, cleanup

- OpenAI billable `0/3`; chain reads `0/3`; tx/gas/signer `0`;
  H1/H2/H3 one attempt each; retries `0`.
- Lane-created rows: `0`. Counts after: cards `1`, intents `1` (seed
  intact). Cleanup `0`; secret scan `1123/0`; diff-check clean.
- No implementation, migration, deployment, commit, or push.

## 6. Integration gaps precisely located (next-lane inputs)

1. H1 needs an OWNER session (card lookup is owner-scoped); the current
   token wallet matches nothing on card 1.
2. H2 needs registry↔seed intentId alignment: the deployed default
   registry authorizes `intent-arc-1` while the seeded row is
   `intent-req-1` — a code change + redeploy (or a registry-agnostic
   H1-minted intent) is required before any agent session can reach the
   chain. No code was changed in this lane.
3. Seeded credit is expired on-chain, so even a fully-authorized H2 is
   expected to record a chain-evaluated decline — valid H2 evidence
   either way per the pack.

## 7. Final classification

**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL. Phase 04 COMPLETE_WITH_GAPS.**
The lane proved auth, region, lane code, seed, and scoping mechanics end
to end; only session-role alignment and registry intentId alignment
remain. Next: registry-alignment code change (authorize `intent-req-1`)
+ redeploy + agent-session H2 rerun (smallest path to usable H2 chain
evidence); owner-session H1 separately for live provider evidence.
