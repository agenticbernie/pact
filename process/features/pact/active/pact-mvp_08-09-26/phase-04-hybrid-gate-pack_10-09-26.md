# HYBRID GATE PACK — Phase 04 H1–H3 (requires explicit user approval)

Status: PREPARED 2026-09-10 · NOT APPROVED · NOT EXECUTED.
Validate Contract: CONDITIONAL (2026-09-10), gates G9–G11; this pack executes exactly those gates.
Local EXIT prerequisite: G1–G6 + G8 green (reported 2026-09-10); G7 CI-only/non-binding.
Any deviation from this pack without a new approval voids the lane.

## 1. Purpose and boundary

Collect exactly three live evidence artifacts for Phase 04 and record them redacted
in `phase-04-ai-gateway-executor_REPORT_08-09-26.md`:
- **H1** — one live `gpt-5.6-luna` structured-output call through the regional
  function (proves AC-07/AC-08 live side).
- **H2** — one regional `preflightPay` static-call evidence set (proves AC-10/AC-11
  regional side).
- **H3** — fixed regional URL + expected-vs-actual region confirmation record.

The lane may: run the capability check, send one structured-output request, run
read-only static calls, read regional health, write the redacted report appendix.
The lane may NOT: deploy anything, broadcast any transaction, spend gas, call any
model except `gpt-5.6-luna`, use any region except the configured one, persist
secrets, modify any approved artifact beyond the report appendix, retry as a new
payment, or run a second live model call.

## 2. Prerequisites (all must hold before step 0)

- Phase 04 local EXIT green on the lane machine (G1–G6 + G8; split-report evidence
  2026-09-10; Deno absence recorded, never a failure).
- Implementation commits present locally: `8c5e23c`, `77e5d25`, `ad6d50b`
  (correction: pack text citing `ad6d50e` is void — that revision does not exist).
- Regional function deployed to the staging/disposable Supabase project with the
  lane secrets set via dashboard/CLI (never the repo); edge `wrangler.toml`
  binding points at the fixed regional URL from §7.
- Operator confirms the disposable lane environment (staging project, demo
  credential, region pair) with no production data in scope.

## 3. Environment variables — classified input contract (names only, never values)

Server-only secrets (function/deployment env via dashboard/CLI; never repo,
browser, edge, logs, or chat):
- `OPENAI_API_KEY` — gateway function only; H1 caller authentication.
- `SESSION_HMAC_SECRET` — gateway/session functions only; versioned; the lane
  does NOT rotate it (cleanup records "untouched" or a rotation statement only
  if the operator rotates out-of-lane).
- `SUPABASE_SERVICE_ROLE_KEY` — only if lane setup needs it; functions must not
  log or return it; prefer anon-key paths where the design allows.
- `DEMO_TOKEN` — explicitly-configured demo credential for edge shape checks;
  sent per-call, never persisted.

Operator-provided public/operational inputs (values by operator at runtime):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (anon key is public by design).
- `SUPABASE_FUNCTION_REGION` — expected region value; H3 compares expected vs actual.
- `SUPABASE_REGIONAL_FUNCTION_URL` — the ONE fixed upstream (H3 records it).
- `CREDITCOIN_RPC_URL` — chain read for the H2 static call (public input).
- `OPENAI_MODEL` — must be unset or exactly `gpt-5.6-luna`; any other value aborts
  before any provider call (`resolveOpenAIModel` throws `AI_CONFIG_INVALID`).

NOT REQUIRED for this lane (never request, inject, or bring near the session):
- `AGENT_SIGNER_PRIVATE_KEY` — H1 is a model call and H2 is a static call; no
  signer exists on either path. If any step demands a signer, abort (scope breach).
- Any production key, mainnet key, or real customer credential.

Step-0 presence rule: the 4 server secrets above (minus service-role if unused)
plus the 5 operational inputs must be present-by-name in the lane shell;
`AGENT_SIGNER_PRIVATE_KEY` must be ABSENT. Presence is checked by name only —
values are never printed, logged, or persisted.

## 4. Pre-call assertions (executed in code before any live contact; abort on any failure)

1. `loadOpenAIConfig(config/ai/model-config.json)` parses with
   `{provider:"openai", model:"gpt-5.6-luna", allowFallback:false}` —
   single source of truth, no second pin.
2. `resolveOpenAIModel(config)` returns `"gpt-5.6-luna"` (env unset-or-equal).
3. `config.allowFallback === false` asserted explicitly; if not false, throw
   fail-closed before any fetch.
4. Request shape asserts `store:false` + strict schema name `pact_agent_intent`
   + `merchantId`-only output (`additionalProperties:false`); any deviation aborts.
5. Upstream URL equals the fixed `SUPABASE_REGIONAL_FUNCTION_URL`; arbitrary
   upstream aborts.

## 5. Retry policy (the ONLY permitted retries)

- Retry ONCE and only on HTTP 502, 503, or 429 from the provider/regional call.
- Maximum 2 attempts per live call; the retry reuses the identical request
  (identical idempotency/correlation IDs) — never a new payment, never a new
  intent, never a resubmitted transaction.
- Any other status, malformed output, model-unavailable, region mismatch, auth
  failure, timeout with unknown outcome, or second consecutive retryable status
  → mapped `ApiError`, fail closed, lane stops (bounded blocker note, never green).

## 6. Exact lane sequence (placeholders in angle brackets, values only at runtime)

1. Step 0: presence-by-name check per §3 (no values). Abort if any required name
   missing or if a signer key is present.
2. Step 1: run pre-call assertions per §4 (local, no network). Abort otherwise.
3. **H1**: capability check for `gpt-5.6-luna` (fail startup/first-request with
   `PROVIDER_MODEL_UNAVAILABLE` if inaccessible; never choose another model),
   then ONE structured-output request through the regional function.
   Record the redacted H1 log per §7.
4. **H2**: ONE `preflightPay` static call (`from` = agent address, server-bound
   card/merchant/asset, card-scoped nonce) via the regional function on the
   configured chain. No signer, no transaction, no gas. Record redacted H2
   evidence per §7.
5. **H3**: read regional health; record concrete `SUPABASE_REGIONAL_FUNCTION_URL`
   + expected-vs-actual region pair + `wrangler.toml` binding proof
   (`SUPABASE_REGIONAL_FUNCTION_URL`, `ALLOWED_ORIGIN`, rate-limiter) per §7.
6. Append the redacted H1–H3 appendix to the Phase 04 report (report file only).
7. Cleanup per §9; secret scan + `git status` clean-of-secrets verification.

## 7. Redacted expected outputs (exact shapes; secrets never appear)

- H1 log: `{provider:"openai", model:"gpt-5.6-luna", providerRequestId:"<id>",
  latencyMs:<n>, decision:"ok"|"<ApiErrorCode>", storeConfirmed:false,
  allowFallbackAsserted:false}`. Never: prompt text, response body, key material,
  merchant PII beyond the logical merchant ID allowlisted for the test.
- H2 evidence: `{decision:<bool>, reasonCode:"<bytes32-name>", chainId:<n>,
  checkedAt:"<UTC>", correlationIds:{requestId:"<id>", intentId:"<id>"}}`.
  Addresses redacted to approved shape (first-6/last-4 or `address(0)`-class
  labels per the report's redaction rule); keys never appear. `chainId` must
  equal the configured testnet chain; any mainnet ID aborts the lane.
- H3 record: `{regionalUrl:"<fixed-url>", expectedRegion:"<r1>",
  actualRegion:"<r2>", regionsMatch:<bool>, wranglerBindings:["SUPABASE_REGIONAL_FUNCTION_URL","ALLOWED_ORIGIN","RATE_LIMITER"], health:{requestId:"<id>", chainId:<n>, provider:"openai", modelAvailable:<bool>}}`.
  No secret values.

Consensus-healthy run: H1 decision `ok` with pinned model; H2 decision recorded
(allowed or declined — either is valid evidence, both prove the regional path);
H3 `regionsMatch:true`. Any H-failure is recorded as a mapped error with zero
payment calls — never converted into a green claim.

## 8. Transaction / API budget (hard caps for the lane)

- OpenAI billable calls: MAX 3 attempts total (1 capability + 1 structured-output
  + 1 single retry on 502/503/429). A 4th billable call without new approval
  voids the lane.
- Chain RPC: read-only static calls + receipt lookups only, MAX 3 attempts for H2;
  ZERO transactions, ZERO broadcasts, ZERO gas spend, ZERO deployments.
- Supabase: only the session/intent rows the lane itself creates
  (challenge → verify → intent), all revoked/expired in cleanup.
- No testnet funds move; funder keys are never in scope.

## 9. Disposable environment and cleanup

- Lane scope is staging/disposable only: no production project, database, key, or
  customer data is touched. Challenge/intent rows carry random hashes only.
- Cleanup (in order): revoke lane sessions + demo credential; expire/delete lane
  challenge/intent rows (record counts deleted vs expired); confirm
  `SESSION_HMAC_SECRET` untouched (or attach the operator's rotation statement
  only if rotated out-of-lane); record final row counts + revocation list.
- Verification: `node scripts/check-no-secrets.mjs` → 0 findings;
  `git status` shows no key material and no files outside the report appendix.
- Lane failure → bounded blocker note in the report appendix (exact error, safe
  next action); local gates stay green; never a mock-green H-record.

## 10. No-production-key evidence (checked before close)

- Env-only transport attested by operator; no secret value in chat, repo, logs,
  or evidence artifacts.
- `git status` shows no key material; secret scan 0 findings.
- No mainnet chain ID (1, 10, 56, 137, 42161, …) appears in any lane command,
  evidence, or report appendix (H2 `chainId` is the configured testnet chain).
- No `openai` SDK import was added for the lane (raw-fetch port only).

## 11. Hard-stop conditions

Pre-call assert failure; `allowFallback` not false; `store` not false; model
value not exactly `gpt-5.6-luna`; `openai` package import anywhere; retry beyond
once / on non-502-503-429 / as a new payment; any fallback model, region, or
direct payment; any secret-shaped value near the repo; arbitrary upstream URL;
signer key demanded or present; H-failure recorded as success; second live model
call beyond §8 budget; any mainnet chain ID anywhere; any step outside §§1–10
without new approval; local EXIT gates (G1–G6 + G8) not green at lane start.

## 12. Approval block (user completes to open the lane)

- Approved by: ______________ Date (UTC): __________ Scope confirmed (§§1–11): yes/no
- Local EXIT green (G1–G6 + G8; G7 CI-only noted): yes/no
- Input contract confirmed (§3): server secrets env-only / operational inputs set / signer absent: yes/no
- Budget confirmed (§8: ≤3 billable calls, 0 transactions, 0 gas): yes/no
- Pre-call asserts understood (§4: allowFallback false, store false, pinned model): yes/no
- On approval, the lane runs under EXECUTE discipline with per-step output logging.
