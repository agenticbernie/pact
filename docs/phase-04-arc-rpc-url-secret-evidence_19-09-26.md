# ARC_RPC_URL Secret Provisioning Evidence — Staging (2026-09-19)

Date: 2026-09-19 (UTC) · Branch: `main` · Project `myotkovmgzdabuirkqlx`.
Scope: set EXACTLY ONE secret (`ARC_RPC_URL`) + names-only verify +
read-only health. No other secret touched, no redeploy initiated, no
OpenAI call, no H-lane run, no DB seed/change, no broadcast/card/credit/
payment, no commit/push. No secret value printed, logged, or persisted
anywhere in this lane.

## 1. Result

**`ARC_RPC_URL`: SET.** Value verified byte-equal to the approved Arc
Testnet endpoint for chain `5042002` BEFORE writing (strict equality
check, value never displayed). Transport: temp env file (mode 600) via
`secrets set --env-file`; temp file shredded after (confirmed absent).
No value ever appeared in CLI text, logs, or evidence.

## 2. Verification

- `secrets list` (names only): `ARC_RPC_URL` present alongside the
  untouched set (`CREDITCOIN_RPC_URL`, `OPENAI_API_KEY`,
  `SESSION_HMAC_SECRET`, `PACT_EXPECTED_REGION`, …). No other secret
  created, modified, or removed.
- Functions (untouched by this lane except platform config revision):
  `session` v14→v15, `ai-gateway` v14→v15, `agent-executor` v16→v17 —
  the platform bumps config revisions on secret change (same code, same
  timestamp lineage). No `functions deploy` was run here.
- Health (single unauthenticated GET): HTTP 200, exact seven-key shape,
  `chainId` 5042002, provider/model pin intact. Nothing broke.
- No database row written, updated, or deleted; no H1/H2/H3 executed.

## 3. Next approval

Fresh H1–H3 (note: seeded credit is expired on-chain, so H2 is expected
to record a fail-closed decline — valid evidence either way). H1/H2
remain BLOCKED, H3 PARTIAL, G22 DRIFT, Phase 04 COMPLETE_WITH_GAPS. No
commit/push performed.
