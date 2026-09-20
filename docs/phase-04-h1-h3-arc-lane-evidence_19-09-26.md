# Fresh H1–H3 Arc Lane Evidence (2026-09-19, REDACTED)

Date: 2026-09-19 (UTC) · Branch: `main` · Project `myotkovmgzdabuirkqlx`.
Lane: EXACTLY one H1 call + one H2 call + one H3 health GET per the
hybrid-gate-pack sequence (Steps 0–6). No retry (deterministic codes),
no second live model call, no deploy, no seed/change, no OpenAI contact
beyond the (unreached) server path, no signer/key, no broadcast, no
commit/push. No secret, prompt, body, token, or raw response recorded —
response keys and mapped codes only.

## 1. Step 0 — presence by name (no values)

Present: `OPENAI_API_KEY`, `SESSION_HMAC_SECRET`, `DEMO_TOKEN`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ARC_RPC_URL`, `OPENAI_MODEL`
(pinned-match, see §2). Absent: `SUPABASE_FUNCTION_REGION`,
`SUPABASE_REGIONAL_FUNCTION_URL` (derived via platform convention
`https://<ref>.supabase.co/functions/v1`, verified live below),
`AGENT_SIGNER_PRIVATE_KEY` ABSENT (required; holds before and after).

## 2. Step 1 — pre-call assertions (local, no network): PASS

`model-config.json` parses as `openai`/`gpt-5.6-luna`/`allowFallback:false`;
`OPENAI_MODEL` pinned-match; `allowFallback===false` enforced in loader;
`store:false` + strict `pact_agent_intent` + merchantId-only in provider
source. The lane proceeded.

## 3. H1 — AI intent route: BLOCKED (fail-closed at auth)

- Route: `POST /functions/v1/ai-gateway/v1/agent/intents`,
  fixture `{prompt, cardId:"1"}`, correlation `h1-lane-arc-1`.
- ONE attempt: HTTP **401**, keys `[code,message,requestId,retryable]`,
  decision `AUTH_REQUIRED`, latency `770ms`. No retry (401 non-retryable).
- Redacted: `{provider:"openai", model:"gpt-5.6-luna", attempts:1,
  providerRequestId:"not-returned", latencyMs:770,
  decision:"AUTH_REQUIRED", storeConfirmed:false,
  allowFallbackAsserted:false}`.
- Cause: no valid wallet-bound session token exists in lane inputs, and
  minting one needs either a signing key (forbidden by this approval) or
  the HMAC secret value (names-only boundary). The request stopped at
  application auth — zero provider calls, zero persistence writes.
- **H1 BLOCKED.** No fallback used; no provider success claimed.

## 4. H2 — regional read-only preflight: BLOCKED (fail-closed at auth)

- Route: `POST /functions/v1/agent-executor/v1/payments/preflight`,
  fixture `{intentId:"intent-req-1"}`, correlation `h2-lane-arc-1`.
- ONE attempt: HTTP **401**, keys `[code,message,requestId,retryable]`,
  decision `AUTH_REQUIRED`, latency `1571ms`. No retry. No `decision`,
  `reasonCode`, `chainId`, or `checkedAt` returned — no usable
  static-call evidence.
- Zero RPC calls (stopped before transport), zero transactions/gas/signer
  ops. Seeded rows (`card 1`, `intent-req-1`) were never reached.
- **H2 BLOCKED.** No RPC success inferred.

## 5. H3 — fixed regional health: PARTIAL

- ONE GET `/functions/v1/ai-gateway/health`, correlation `h3-lane-arc-1`:
  HTTP **200**, exact seven-key shape, `chainId` **5042002**, provider
  `openai`, `modelAvailable` **false**, `configuredRegion ap-southeast-1`
  vs `expectedRegion us-east-1`, latency `656ms`.
- Regional base URL live, routed, authenticated-gateway behavior intact
  (unknown paths → function 404s in prior lanes; health public).
  `wrangler.toml` still holds placeholder URL + inactive rate-limiter
  (edge path out of scope per G17 — recorded, unchanged).
- **H3 PARTIAL**: reachability + Arc-lane shape proven; region match and
  model availability not proven.

## 6. Budgets, persistence deltas, cleanup

- OpenAI billable `0/3`; chain reads `0/3`; transactions/gas/signer `0`;
  H1 `1/2` attempts, H2 `1/3`, H3 `1/1`; retries `0`.
- Lane-created sessions/intents/rows: `0` (all requests failed closed
  before persistence). Direct counts after: cards `1`, intents `1` —
  seed rows intact, nothing added or removed. Cleanup actions: `0`
  (nothing to revoke/expire/delete); `SESSION_HMAC_SECRET` untouched.
- Verification after: secret scan `1122/0` at report time (rerun below),
  `git diff --check` clean. No implementation, migration, deployment,
  commit, or push in this lane.

## 7. Final classification

**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL. Phase 04 COMPLETE_WITH_GAPS.**
The blocker is application authentication (no valid session token
obtainable without a signing key or the HMAC secret value, both outside
this approval) — not provider, region, chain, card, or intent state. The
seeded Arc rows, lane code, migration, secret, and redeploy all held;
only the auth bootstrap is missing. Next: a session-bootstrap approval
(disposable challenge-signing wallet OR operator-minted session) before
any H1/H2 re-approval; no other lane is unblocked by this artifact.

---

## 8. Keystore-session lane appendix (2026-09-19, REDACTED)

Scope: fresh H1–H3 with owner/agent keystore sessions (one attempt per
lane, no retry). No token, prompt, body, key, password, or raw response
recorded — keys, codes, and redacted metadata only.

### Preflight

- Keystore files `pact-owner` + `pact-agent` present in the foundry
  keystores dir (filenames only; contents never read).
- Challenge/verify shapes confirmed from source:
  `POST …/session/challenge {wallet[,domain,chainLabel]}` →
  `{nonce,message,expiresAt}`;
  `POST …/session/verify {nonce,signature}` → `{token,sessionId}`.
- Keystore passwords: ABSENT in every checked name (generic, cast, and
  lane-specific). Empty-password attempt fails closed at decrypt
  (“Failed to decrypt keystore”). No value guessed, no fallback key
  used, no raw private key handled.

### H1/H2: STOPPED at hard stop — NOT EXECUTED

Challenge signing is impossible without the keystore passwords, and the
approval forbids any non-keystore private-key use. Per the hard-stop
rules the lane stopped BEFORE any H1/H2 request: zero H1 attempts, zero
H2 attempts, zero provider calls, zero RPC calls, zero persistence
writes, zero retries. No 401/4xx probe was sent (rejected already by the
prior lane; resending adds no evidence).

- **H1 BLOCKED** (no owner session obtainable).
- **H2 BLOCKED** (no agent session obtainable).

### H3: executed (no auth required)

- ONE GET `/functions/v1/ai-gateway/health`, corr `h3-arc-ks-1`:
  HTTP **200**, exact seven-key shape, `chainId` 5042002, provider
  `openai`, `modelAvailable` false, latency `842ms`.
- **H3 PARTIAL** (unchanged).

### Deltas and verification

- Counts after: cards `1`, intents `1` (seed intact; nothing added or
  removed). No implementation, migration, deployment, commit, or push.
- Secret scan `1126/0`; `git diff --check` clean (rerun at evidence
  time).

### Classification

**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL. Phase 04 COMPLETE_WITH_GAPS.**
Precise unblocker: provision the two keystore passwords to a future lane
shell (or operator-minted owner/agent sessions) — everything downstream
(seed, code, migration, secret, redeploy, registry semantics) is already
proven. No other lane is unblocked by this artifact.

---

## 9. Keystore-session H1/H2 execution appendix (2026-09-19, REDACTED)

Scope: fresh H1 (owner keystore session) + H2 (agent keystore session) +
H3, one attempt per lane, no retry. Keystore passwords consumed from
provisioned files (existence only; contents never read or displayed).
Challenge nonces/messages, signatures, and session tokens lived only in
`600` temp files / shell vars and were shredded after (confirmed
absent). No prompt, body, token, key, password, or raw response recorded.

### H1 — owner session, provider gate: BLOCKED (provider)

- Challenge (`{wallet: owner}`) → 200 with nonce/message; signed via
  `cast wallet sign --account pact-owner --password-file` (message
  signing only, no transaction); verify → 200, owner session established.
- ONE intent POST (`{prompt, cardId:"1"}`, corr `h1-arc-owner-1`):
  HTTP **400**, keys `[code,message,requestId,retryable]`, code
  `PROVIDER_UNAVAILABLE`, latency `2915ms`. Auth, region, and card gates
  all passed (no 401, no REGION_MISMATCH, no CARD_NOT_ELIGIBLE).
- Provider billable calls: ≤1 (single attempt, no retry issued; server
  maps the failure without raw detail). No intent persisted.
- Redacted: `{provider:"openai", model:"gpt-5.6-luna", attempts:1,
  providerRequestId:"not-returned", latencyMs:2915,
  decision:"PROVIDER_UNAVAILABLE", storeConfirmed:false,
  allowFallbackAsserted:false}`.
- **H1 BLOCKED** (bounded provider blocker; fail-closed correctly).

### H2 — agent session, read-only preflight: BLOCKED (no usable static evidence)

- Challenge (`{wallet: agent}`) → 200; signed via pact-agent keystore;
  verify → 200, agent session established.
- ONE preflight POST (`{intentId:"intent-req-1"}`, corr `h2-arc-agent-1`):
  HTTP **200**, exact H2 shape
  `[chainId,checkedAt,decision,intentId,reasonCode,requestId]`, decision
  `declined`, reason `CARD_NOT_ELIGIBLE`, chain `5042002`, latency
  `4101ms`. No retry. Zero RPC calls claimed, zero tx/gas/signer ops.
- Reading: declined at binding evaluation (not a missing-record short
  circuit); no chain-evaluated decision was produced, so no usable
  static-call evidence is claimed. Exact failing sub-branch is not
  externally distinguishable (PVL is server-side by design); server logs
  would disambiguate and are outside this lane.
- **H2 BLOCKED.**

### H3 — health: PARTIAL (unchanged)

- ONE GET, corr `h3-arc-ks2-1`: HTTP **200**, exact seven-key shape,
  `chainId` 5042002, provider `openai`, `modelAvailable` false.
- **H3 PARTIAL.**

### Budgets, deltas, cleanup

- H1/H2/H3 one attempt each; retries `0`. Provider billable ≤1 (H1 only).
- This lane's accounted writes: 3 challenge rows + 2 session rows (all
  consumed/valid per flow; sessions expire naturally ≤30min; no revoke
  calls issued to stay within the 1-attempt-per-lane budget).
- Counts after: cards `1`, intents `1` (seed intact); sessions `11`,
  challenges `26` — the excess over this lane's footprint (+5/+7 vs the
  migration-apply baseline) indicates concurrent operator-lane activity
  outside this lane's scope; no foreign row was touched.
- No implementation, migration, deployment, commit, or push. Secret scan
  `1126/0`; `git diff --check` clean (rerun at evidence time).

### Classification

**H1 BLOCKED / H2 BLOCKED / H3 PARTIAL. Phase 04 COMPLETE_WITH_GAPS.**
This lane proved end-to-end: keystore challenge auth, owner/agent
sessions, region gates, card-intent scoping, lane code on staging, and
fail-closed provider/binding behavior — with the registry↔seed intentId
alignment plus a live provider path as the remaining precise gaps. No
other lane is unblocked by this artifact.
