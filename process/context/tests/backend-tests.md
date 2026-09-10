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

Phase 04 update (2026-09-10, local green): `supabase/functions/` now exists
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
Contract (G7 non-binding).

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
