# Fresh H1–H3 on Neon — Lane Evidence (2026-09-20, REDACTED)

Date: 2026-09-20 (UTC) · Branch: `main` · Neon project
`polished-dream-04296130`, branch `main`, DB `pact`.
Scope: EXACTLY one H1 + one H2 + one H3 call (no retry), keystore
challenge auth per lane. No payment/card/credit/broadcast, no seed/DB
change beyond pack-mandated session rows, no Supabase lane, no code/
secret/model change, no commit/push. Tokens, nonces, messages,
signatures, keys, and passwords lived only in `600` temp files/shell
vars and were shredded after (confirmed absent). No prompt, body,
token, or raw response recorded.

## H1 — owner session, provider gate: BLOCKED (provider)

- Challenge (`{wallet: owner}`) → 200; signed via pact-owner keystore
  (message signing only); verify → 200, owner session established.
- ONE intent POST (`{prompt, cardId:"1"}`, corr `neon-h1-1`):
  HTTP **400**, keys `[code,message,requestId,retryable]`, code
  `PROVIDER_UNAVAILABLE`, latency `~3s`. Auth, region, and owner-scoped
  card gates all passed; the failure is strictly inside the provider
  call (same classifier as the Supabase H1 audit: not 429/404-shape).
- Provider billable ≤1 (single attempt, no retry issued). No intent
  persisted.
- Redacted: `{provider:"openai", model:"gpt-5.6-luna", attempts:1,
  decision:"PROVIDER_UNAVAILABLE", storeConfirmed:false,
  allowFallbackAsserted:false}`.
- **H1 BLOCKED** (bounded provider blocker).

## H2 — agent session, read-only preflight: BLOCKED (no usable static evidence)

- Challenge (`{wallet: agent}`) → 200; signed via pact-agent keystore;
  verify → 200, agent session established.
- ONE preflight POST (`{intentId:"intent-req-1"}`, corr `neon-h2-1`):
  HTTP **200**, exact H2 shape
  `[chainId,checkedAt,decision,intentId,reasonCode,requestId]`, decision
  `declined`, reason `PREFLIGHT_DECLINED`, chain `5042002`. No retry.
  Zero RPC calls claimed, zero tx/gas/signer ops.
- Reading: single-wallet lookup misses (owner≠agent) and the deployed
  default registry authorizes `intent-arc-1`, not the seeded
  `intent-req-1` — declined before any chain read. Registry↔seed
  intentId alignment remains the precise H2 unblocker (code + redeploy).
- **H2 BLOCKED.**

## H3 — health: PARTIAL (with corrected semantics live)

- ONE GET `/health`: HTTP **200**, exact seven-key shape, `chainId`
  5042002, `configuredRegion us-east-1` + `expectedRegion us-east-1`
  (corrected region semantics serving live), provider `openai`,
  `modelAvailable` false.
- **H3 PARTIAL** (reachability + lane shape proven; model availability
  not proven, honestly static).

## Budgets, deltas, verification

- Attempts: H1/H2/H3 one each; retries `0`; OpenAI billable ≤1 (H1 only).
- Lane writes (pack-mandated only): 2 challenges + 2 sessions. Counts
  after: cards `1`, intents `1` (seed intact), sessions `2`, challenges
  `2`, attempts `0` — nothing else created, altered, or removed.
- Supabase non-interference: cards `1`, intents `1` (unchanged; no
  Supabase lane ran).
- No implementation, migration, deployment, secret, commit, or push.
  Secret scan `1142/0` at evidence time; `git diff --check` clean.

## Classification

**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL. Phase 04 COMPLETE_WITH_GAPS**
(Supabase lane) with the Neon execution target proven end to end short
of provider/model access and registry intentId alignment. No VERIFIED
marking (no live §7 success artifacts). Next: fresh H1–H3 approval only
after provider access and/or registry alignment — never self-run.
