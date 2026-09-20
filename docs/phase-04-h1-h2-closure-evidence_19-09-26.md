# Phase 04 H1/H2 Closure Evidence — Local/Read-Only Pass (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: **H1 + H2 only**.
No live mutation, broadcast, signer/private-key use, deployment, migration,
funding, faucet, OpenAI call, Neon deploy, commit, or push was performed in
this task. No historical plan/report/evidence file was rewritten or deleted.
Phase 03 ASC/Creditcoin legacy boundary untouched. H3 and G22 untouched.

Convention note: Phase 04 live-lane evidence normally appends to
`process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_REPORT_08-09-26.md`.
This pass ran **no live lane**, so per the "no mock-green H-record" rule no
H-appendix was added there. This additive `docs/` report is the task artifact;
it links source reports (which govern on any reading difference).

## 1. Executive summary

H1 and H2 cannot be marked VERIFIED in this task. Their acceptance criteria
require hybrid live evidence (H1: one live `gpt-5.6-luna` call through the
regional function; H2: one regional read-only `preflightPay` static call with
usable decision evidence), and both are stopped by blockers this task is not
authorized to clear: this task forbids OpenAI calls, and the staging
business-state seed both lanes need requires authoritative chain metadata that
is unavailable plus a separate explicit approval. What this task *could* close
was verified fresh: every local code half of H1/H2 (gateway protected
composition G27/G31, executor read-only composition G28, region/model/config
isolation G25/G34/G35, session persistence selection G26, intent scoping G32,
route matrix G33, platform JWT/health G29) is GREEN on the current worktree,
and all required regression gates are GREEN. No code patch was needed or made:
the implementation already satisfies the local contract, so per the task's
"evidence-only" rule no gratuitous edit was introduced.

Final classification (honest, per AC):

```text
H1 BLOCKED (local halves GREEN; live provider evidence missing)
H2 BLOCKED (local halves GREEN; usable static-call evidence missing)
H3 PARTIAL (unchanged, out of scope)
G22 DRIFT (unchanged, out of scope)
Phase 04 COMPLETE_WITH_GAPS (not CLOSED, not VERIFIED)
No live mutation
No commit/push
```

Discrepancy vs the task's desired outcome (`H1 VERIFIED / H2 VERIFIED`):
marking VERIFIED without the §7 hybrid artifacts would be a mock-green claim,
which the Phase 04 contracts explicitly forbid. The discrepancy and the exact
approval boundary to unblock are recorded in §12–§13 instead.

## 2. Governance status

Read before any action (full, not skimmed):

- `AGENTS.md` + `CLAUDE.md` (bootstrap guard: `process/context/all-context.md`
  exists; mandatory `find process/context/ -type f` +
  `find process/development-protocols/ -type f` executed and outputs read).
- `process/context/all-context.md` (router) → `process/context/planning/all-planning.md`
  → `process/context/tests/all-tests.md` → `process/context/tests/backend-tests.md`.
- `process/development-protocols/all-development-protocols.md` (router) →
  `process/development-protocols/pact-mvp-gates.md` (exact gate commands,
  preconditions, fail-closed rules).
- Phase 04 authority set (all in
  `process/features/pact/active/pact-mvp_08-09-26/`):
  `phase-04-ai-gateway-executor_PLAN_08-09-26.md` (V1–V7 CONDITIONAL),
  `phase-04-ai-gateway-executor_REPORT_08-09-26.md` (read fully, 1278 lines:
  local EXIT + G14–G35 + G13 histories + all H1–H3 appendices),
  `phase-04-hybrid-gate-pack_10-09-26.md` (H1/H2/H3 lane authority, §§1–12),
  `phase-04-h1-h3-runtime-wiring-supplement_PLAN_11-09-26.md` (G14–G17),
  `phase-04-session-intent-card-persistence-supplement_PLAN_12-09-26.md`
  (Option A, G18–G22),
  `phase-04-runtime-composition-correction-supplement_PLAN_13-09-26.md`
  (G24–G35, terminal local state),
  plus prefix-routing/hosted-path-diagnostic supplements and the
  `phase-04-ai-gateway-executor_AUTOPILOT_GOAL_13-09-26.md` goal block.
- Referenced source/test files for H1/H2 (read or grep-verified):
  `supabase/functions/ai-gateway/index.ts` (requireSession, canonical model
  load, `PACT_EXPECTED_REGION`/`SB_REGION` wiring),
  `supabase/functions/agent-executor/index.ts` + `chain-client.ts` (auth-first,
  server-bound intent/card, read-only transport),
  `supabase/config.toml` (`verify_jwt = false` ×3, app-auth owns protection),
  `config/ai/model-config.json` (pinned `openai`/`gpt-5.6-luna`/`allowFallback:false`).
- `git status` + `git diff --stat` captured before and after: 6 tracked files
  modified + 17 untracked paths, all pre-existing Arc/Neon-track work from
  prior sessions (see §7). Nothing in the worktree was committed or pushed.
- Vibecode Pro Max Kit is the governing kit. `obra/superpowers` is absent from
  the repo; recorded as a known GAP, no surrogate workflow was invented.

## 3. H1 status — BLOCKED

Definition (hybrid gate pack §1 + Validate Contract G9): one live
`gpt-5.6-luna` structured-output call through the regional function, proving
the AC-07/AC-08 live side. Expected artifact (pack §7): redacted log
`{provider:"openai", model:"gpt-5.6-luna", providerRequestId, latencyMs,
decision:"ok", storeConfirmed:false, allowFallbackAsserted:false}`.

Blocker (unchanged, latest hosted result 2026-09-14): HTTP `400`
`CARD_NOT_ELIGIBLE` for the approved `{prompt:"buy coffee",cardId:"7"}`
fixture — no eligible owner-scoped staging card exists. The approved minimal
staging seed (one eligible `cards` row for card `7` + one `ready` intent)
is blocked on authoritative chain metadata that remains unavailable (agent,
controller provenance, policy version, allowlist hash, source block/tx,
current chain limits/expiry; network config unverified/placeholder;
required RPC/deployment input names absent). No synthetic values were
written, and this task additionally forbids OpenAI calls outright, so the
live H1 lane could not run under any reading of the approvals.

Local halves of H1 re-verified fresh in this task (§8): gateway protected
composition, auth-before-work, canonical model pin, `store:false`, strict
`pact_agent_intent`, merchantId-only output, 15-code mapping, retry budget —
all GREEN. Code is correct; only live evidence is missing.

## 4. H2 status — BLOCKED

Definition (pack §1 + G10): one regional read-only `preflightPay` static call
(`from` = agent, server-bound values, card-scoped nonce) via the regional
function on the configured chain — zero transactions, zero gas, zero signers —
proving the AC-10/AC-11 regional side. Expected artifact (pack §7):
`{decision, reasonCode, chainId, checkedAt, correlationIds}` with approved
redaction.

Blocker (unchanged, latest hosted result 2026-09-14): HTTP `200`
`decision:"declined"`, `reasonCode:"PREFLIGHT_DECLINED"`, `chainId:102031` for
`{intentId:"intent-req-1"}` — the read-only executor returns this for a
missing/expired owner-scoped intent, so no usable static-call evidence was
produced. Same seed blocker as H1 (no `intent-req-1` row; seed needs the same
unavailable chain metadata + separate approval). No RPC success, transaction,
gas, broadcast, or signer operation occurred or is claimed.

Local halves of H2 re-verified fresh in this task (§8): persisted/server-bound
intent/card/merchant/asset/policy/agent/nonce, `from=agent`, `eth_chainId` +
`eth_call` only, no Wallet/signer/send/broadcast path — all GREEN. Code is
correct; only live evidence is missing.

## 5. Gap-to-evidence matrix

| Lane | Requirement (AC source) | Current evidence (fresh, this task) | Gap | Test needed | Related files | Status |
| ---- | ----------------------- | ----------------------------------- | --- | ----------- | ------------- | ------ |
| H1 | Pack §7 H1 log; G9; AC-07/AC-08 live side | Latest hosted `400 CARD_NOT_ELIGIBLE`; local halves GREEN (fresh 43/43 focused, 242 full) | Live provider call + staging card seed; OpenAI call forbidden by this task; seed needs unavailable metadata + separate approval | Fresh H1 lane after seed + approval | `supabase/functions/ai-gateway/index.ts`, `openai-provider.ts`, `provider-port.ts`, CardStore, IntentStore | BLOCKED |
| H2 | Pack §7 H2 evidence; G10; AC-10/AC-11 regional side | Latest hosted `200 declined PREFLIGHT_DECLINED`, no usable static-call evidence; local halves GREEN fresh | Staging intent seed (same metadata + approval blocker) | Fresh H2 lane after seed + approval | `supabase/functions/agent-executor/index.ts`, `chain-client.ts`, `intent-store.ts`, `card-store.ts` | BLOCKED |
| H3 | Pack §7 H3 record (out of scope) | Carried forward: prefixed health `200`, seven-key shape, region/model not proven | — (not handled) | — | — | PARTIAL |
| G22 | Linked schema parity (out of scope) | `db diff --linked` non-empty (RLS + event trigger) | — (not handled) | — | migrations `202609080001`, `202609120001` | DRIFT |

## 6. Implementation summary

No source, test, config, or docs patch was made in this task. Rationale
(task Step 3 + evidence-only rule): the H1/H2 local requirements are already
implemented and GREEN on the current worktree — fresh focused tests (G24–G35,
G31–G33, gateway/executor mirrors) pass without modification, and the
remaining gaps are missing *live* evidence plus missing *staging state*,neither
of which a code edit can lawfully produce here. A RED→GREEN cycle with no
genuine gap would be theater; none was manufactured. TDD readiness is
preserved: the exact RED-first commands from the correction contracts were
re-run as GREEN confirmations (§8).

Source spot-checks confirming the corrections are present (read-only `rg`):

- `requireSession` enforced in `ai-gateway/index.ts:194` and
  `agent-executor/index.ts:255`; health stays public/side-effect-free.
- Canonical model path via `parseModelConfigJson` (`ai-gateway/index.ts:27,327`);
  `allowFallback:false` asserted before fetch; no `openai` SDK import anywhere.
- `PACT_EXPECTED_REGION` + observed `SB_REGION` composed in all three
  production roots; `supabase/config.toml` sets `verify_jwt = false` for
  `session`, `ai-gateway`, `agent-executor` (app auth owns protection).
- Read-only executor branch performs persisted intent/card lookup with
  server-bound values; `sendPayment`/signer paths are unreachable from it
  (asserted by green focused tests).

## 7. Files created/modified

Created (this task, additive only):

- `docs/phase-04-h1-h2-closure-evidence_19-09-26.md` — this report.

Modified: none. Historical plans, reports, supplements, sources, tests,
migrations, and configs were left byte-identical.

Pre-existing worktree state (not mine; preserved untouched, no commit/push):

- Tracked modifications (6): `.gitignore` (`contracts/out-arc/`), 
...[truncated 4474 chars]