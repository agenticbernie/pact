---
name: context:live-e2e
description: Pact Advance Testnet preflight, deployment verification, model access, and evidence-lane checks.
keywords: live, advance, testnet, rpc, deployment, preflight, evidence, asc, model, region
related: [context:all-tests]
date: 10-09-26
---

# Advance Testnet and Live Evidence

## Scope

This document covers the hybrid lane that verifies Pact against Creditcoin EVM
Advance Testnet and the configured OpenAI region/model. It is owned by Phase 07
and is separate from local automated tests. Reading this file does not grant
permission to broadcast transactions or mutate testnet state.

## Required Gates

- target network is explicitly `advance-testnet`;
- the canonical network config and deployment manifest pass parity checks;
- chain ID, RPC identity, contract bytecode, owner/agent wiring, and ASC
  verifier identity are verified;
- model access and permitted region pass without provider/model substitution;
- disposable wallet labels and server-side secret names are present without
  exposing values;
- preflight is read-only before any approved broadcast;
- evidence is redacted and links only to target-chain transactions/logs.

## Planned Commands

    node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
    node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run
    node scripts/verify-model-access.mjs --network advance-testnet
    node scripts/rehearse-live-demo.mjs --network advance-testnet --dry-run
    node scripts/check-no-secrets.mjs

The non-dry-run rehearsal requires an explicit live-lane approval. It must
record transaction hashes, receipt status, matching indexed events, and
explorer links, while never claiming settlement from a single signal.

## Current Blockers

Setup-time blockers (network config, deployment manifest, live scripts, exact
Advance identity, ASC verifier details, provider access) are resolved for the
Phase 03 Task 5B single-proof lane only: source 11155111 / target 102031 /
chainKey 1 verified; preflight exit 0 via untracked verified config; one
Sepolia `recordCredit` → proof → Advance `execute` → `CreditVerified` recorded
in `config/deployments/asc-evidence-rehearsal.json` (schema-valid, EVL PASS
2026-09-10). No second proof performed.

Remaining for Phase 07 full demo: model/region live access, production-shaped
deployment manifest parity, Playwright demo path, and runbook rehearsal. No
further live testnet action without a new lane approval.

Phase 04 local G14-G17 runtime-wiring EVL (2026-09-11) is GREEN: genuine RED
was captured before implementation; focused tests are 4/4, relevant Vitest is
119/119, function regression is 13/13, G1-G6/G8 are GREEN, G7 is
CI-only/non-binding, G12a is 6/6, G12b is GREEN under Deno `2.9.6`, and
typecheck/lint/AICD/diff-check are GREEN with secret scan 975/0. Local
session/gateway/executor/health behavior is verified. This proves only local
runtime behavior and does not prove hosted deployment or remote schema parity;
parity remains UNKNOWN/HYBRID-ONLY.

The newly implemented runtime wiring has not been deployed and current staging
does not reflect it. The earlier G13 deployment-only success remains preserved.
A post-runtime G13 staging redeploy is required before H1-H3. H1-H3 are NOT RUN
and separately approval-gated. The local Supabase serve check was not run, and
no deployment, migration, OpenAI/RPC call, transaction, or secret access is
implied by this local EVL.

Phase 04 Option A persistence foundation EVL (2026-09-12, local/static
only) is GREEN: focused `7/49`, full `29/171`, G18 GREEN, G19 GREEN, G20
`16/16` GREEN, G21 GREEN, G22 UNKNOWN/HYBRID-ONLY, G1-G6/G8 GREEN, G7
CI-only, G12a `6/6`, G12b GREEN under Deno `2.9.6` (`3+3`),
typecheck/lint/AICD GREEN, secret scan `989/0`, `git diff --check` GREEN, no
`deno.lock`, `AGENT_SIGNER_PRIVATE_KEY` absent, V1 staleness doc-only.
Migration `supabase/migrations/202609120001_persistence_contracts.sql` is
created/static-only and NOT applied; staging is unchanged. G13 evidence is
preserved but predates the foundation. Live routing is unchanged: no staging
migration, no G13 redeploy, no G22 parity check, and no H1-H3 without
separate explicit approvals. Remote remains UNKNOWN/HYBRID-ONLY.

Phase 04 hybrid backlog (2026-09-11, NOT executed): H1 live `gpt-5.6-luna`
structured-output call, H2 regional `preflightPay` static-call evidence, H3
fixed `SUPABASE_REGIONAL_FUNCTION_URL` + region confirmation. `AGENT_SIGNER_PRIVATE_KEY`
is absent by design and `SUPABASE_REGIONAL_FUNCTION_URL` is absent until a
successful G13 deployment derives it. Local implementation and bundle-equivalent
checks are green (fake-backed); hybrid gates require separate explicit approval
per the Phase 04 Validate Contract. No fallback model/region/direct payment is
ever permitted.

## Update Triggers

Refresh when chain identity, deployment addresses, model/region access, ASC
decoder, evidence schema, live command, or approval boundary changes.
