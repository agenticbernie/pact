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
