---
name: context:backend-tests
description: Pact Supabase, OpenAI relay, Cloudflare boundary, indexer, and read-model verification.
keywords: backend, supabase, deno, cloudflare, worker, openai, relay, indexer, postgres, api
related: [context:all-tests]
date: 09-09-26
---

# Backend and Relay Tests

## Scope

This document covers Supabase migrations/functions, the regional OpenAI relay,
Cloudflare Worker routing, agent execution authorization, indexer behavior, and
read-model receipt truth. It does not authorize live deployment or replace the
on-chain policy tests in `contract-tests.md`.

## Planned Source Surface

- `supabase/migrations/` and `supabase/test/` for local schema and migration
  checks;
- `supabase/functions/` for the regional relay, preflight, executor, indexer,
  and redacted error mapping;
- `services/edge-worker/` or the Phase 04 edge path for Cloudflare routing;
- `packages/domain/` for shared request/response types and canonical hashes.

The repository currently has none of these runtime files. The first executable
backend checks must use local fixtures and must not require a production URL,
service-role value, provider secret, or live chain mutation.

Phase 04 update (2026-09-11, local G14-G17 runtime-wiring EVL and G12b
verification):
`supabase/functions/` now exists
(`_shared/`, `session/`, `ai-gateway/` with raw-fetch-behind-port provider,
`agent-executor/` with reconcile) plus Vitest mirrors
(`*.vitest.test.ts`, hermetic + fake-backed) and Deno CI refs (`*.test.ts`,
non-binding while CLIs are missing); `apps/edge/` worker app + tests +
`wrangler.toml` (fixed regional URL, no secrets); `supabase/migrations/
202609080001_sessions_and_intents.sql` (`session_challenges`, `sessions`,
`payment_attempts` with sha256-only hashes, atomic consume, first-claim lock);
`config/ai/model-config.json` is the single model truth
(`openai`/`gpt-5.6-luna`/`allowFallback:false`). Binding local green stays
Vitest E1+E2; Deno suites are CI-only references per the Phase 04 Validate
Contract (G7 non-binding). Each deployable function also carries a local
`deno.json` with exact `ethers@6.17.0` and `zod@3.25.76` mappings; Deno
`2.9.6` check/bundle passed for all three functions, including the supported
`deno bundle --no-lock -c <function>/deno.json -o <output> <entrypoint>` form;
the focused `ai-gateway` check and G12a `6/6` passed, and full Vitest is
`145/145`. Typecheck, lint, AICD, secret scan `970/0`, and `git diff --check`
are green. The fix scope was limited to ambient `randomUUID` typing in
`supabase/functions/ai-gateway/index.ts` and
`supabase/functions/agent-executor/index.ts`, with no runtime/business drift.
`deno.lock` and `AGENT_SIGNER_PRIVATE_KEY` are absent. Supabase CLI `2.117.0`
was verified. Local Supabase serve was not run; the original G13 bare-ethers
failure is preserved unchanged. G14-G17 local EVL is GREEN: genuine RED
preceded implementation, focused tests are 4/4, relevant Vitest is 119/119,
function regression is 13/13, G1-G6/G8 are GREEN, G7 is CI-only/non-binding,
G12a is 6/6, G12b is GREEN under Deno 2.9.6, and typecheck/lint/AICD/diff-check
are GREEN with secret scan 975/0. Local session/gateway/executor/health
behavior is verified. Remote schema parity is UNKNOWN/HYBRID-ONLY. The new
runtime wiring is not deployed and current staging does not reflect it. The
earlier G13 deployment-only success remains preserved; a post-runtime G13
staging redeploy is required before H1-H3. H1-H3 are NOT RUN and separately
approval-gated.

Phase 04 Option A persistence foundation EVL (2026-09-12, local/static
only) is GREEN: focused `7/49`, full `29/171`, G18 GREEN, G19 GREEN, G20
`16/16` GREEN, G21 GREEN, G22 UNKNOWN/HYBRID-ONLY, G1-G6/G8 GREEN, G7
CI-only, G12a `6/6`, G12b GREEN under Deno `2.9.6` (`3+3`),
typecheck/lint/AICD GREEN, secret scan `989/0`, `git diff --check` GREEN, no
`deno.lock`, `AGENT_SIGNER_PRIVATE_KEY` absent, V1 staleness doc-only.
Migration `supabase/migrations/202609120001_persistence_contracts.sql` is
created/static-only and NOT applied; staging is unchanged. G13 evidence is
preserved but predates the foundation; post-foundation migration + G13
staging redeploy are required before H1-H3. Backend routing stays
local/static for persistence; any remote schema parity is HYBRID-ONLY via
G22 with separate approval.

## Planned Commands

    supabase start
    supabase db reset --local
    deno test --allow-env --allow-net --allow-read supabase/test/schema.test.ts
    yarn vitest run supabase/functions

The exact Deno/Vitest split is finalized when the functions and root manifest
are created; the commands above are the approved plan surface.

## Required Assertions

- Only the regional Supabase function can use `OPENAI_API_KEY`.
- The Cloudflare edge cannot expose provider or signer secrets and only routes
  to the approved regional function.
- `OPENAI_MODEL` is exactly the configured `gpt-5.6-luna` value; provider or
  model fallback is not automatic.
- Timeouts, provider errors, malformed output, wrong-chain RPC, and database
  failures map to stable redacted error states.
- Executor requests require a valid canonical intent, policy version, agent
  identity, nonce, deadline, and preflight result.
- Indexer upserts are idempotent by chain identity plus transaction/log
  identity, and cursor updates are safe across retries.
- Read APIs show settled only after both receipt confirmation and matching
  indexed `PaymentSettled` evidence.

## Update Triggers

Refresh this file when the relay boundary, region, secret name, provider model,
Supabase schema, indexer cursor, API route, or backend runner changes.
