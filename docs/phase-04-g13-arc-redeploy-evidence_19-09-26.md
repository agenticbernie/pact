# G13 Arc Redeploy Evidence — Staging (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Project `myotkovmgzdabuirkqlx`
("pact"). Scope: redeploy EXACTLY the G13 set (`session`, `ai-gateway`,
`agent-executor`) with the Arc-lane local code, then read-only verify. No
DB seed/read-write beyond verification SELECTs, no OpenAI call, no H-lane
run, no broadcast/signer/card/credit/payment, no Neon, no CTC-legacy or
Arc-evidence change, no contract/source edit in this lane, no commit/push.
No credential or secret value printed, logged, or persisted.

## 1. Result

**G13 deployment: SUCCEEDED. Health: HTTP 200 with Arc-lane shape but NOT
GREEN** (model unavailable + region pair, same historical pattern).
Deployed code is the reviewed Arc-lane tree (lane roots select Arc,
`ARC_RPC_URL` wiring, split-role seam with explicit card-1 registry,
`allowFallback:false`, read-only executor, server-side OpenAI — all
unchanged by this lane; the lane performed zero source edits).

## 2. Preflight (all green before deploy)

- Project: linked ref + CLI scope = approved ref; local set complete (3
  dirs + per-function `deno.json`).
- Remote before: `session` ACTIVE v13, `ai-gateway` ACTIVE v13,
  `agent-executor` ACTIVE v15 (2026-09-13).
- Remote secret names (digests only): `OPENAI_API_KEY`,
  `SESSION_HMAC_SECRET`, `DEMO_TOKEN`, `PACT_EXPECTED_REGION`,
  `CREDITCOIN_RPC_URL`, `OPENAI_MODEL` + platform keys present;
  **`ARC_RPC_URL` ABSENT** — recorded as a follow-up, NOT set here
  (secret writes are outside this approval). Consequence: the deployed
  Arc H2 transport fails closed (503, no crash) until the secret exists.

## 3. Deploy record

Single command: `supabase functions deploy session ai-gateway
agent-executor --project-ref myotkovmgzdabuirkqlx` → bundled
(2.7 MB / 3.0 MB / 54 kB) → `Deployed Functions on project
myotkovmgzdabuirkqlx: session, ai-gateway, agent-executor`, exit 0.
Exactly the approved set; no other slug created, replaced, or removed.

## 4. Post-deploy verification (read-only)

- Versions (all ACTIVE, same IDs): `session` v13→**v14**,
  `ai-gateway` v13→**v14**, `agent-executor` v15→**v16**
  (2026-09-19 20:26:54 UTC). Exactly +1 each.
- Prefixed health: single unauthenticated `GET
  /functions/v1/ai-gateway/health` → HTTP **200**, exact seven-key shape
  (`requestId` redacted): `chainId` **5042002** (was 102031 — proves the
  Arc lane code is live), provider `openai`, model `gpt-5.6-luna`,
  `modelAvailable` **false**, `configuredRegion ap-southeast-1` vs
  `expectedRegion us-east-1` (known G35 semantics, not a deploy defect).
- No session, intent, preflight, execute, provider, RPC, payment,
  transaction, migration, or signer route was called. No database row was
  written, updated, or deleted in this lane.

## 5. Mutations performed (exhaustive)

One three-function code deployment. Nothing else.

## 6. Next approvals (unchanged order)

`ARC_RPC_URL` secret provisioning (dashboard/operator lane) → fresh H1–H3
(note: seeded credit is expired on-chain, so H2 is expected to record a
fail-closed decline — valid evidence either way). None granted here. H1/H2
remain BLOCKED, H3 PARTIAL, G22 DRIFT, Phase 04 COMPLETE_WITH_GAPS. No
commit/push performed.
