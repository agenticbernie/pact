# Neon migration baseline (CREATED, NOT APPLIED — no live lane)

Status: baseline DDL adopted 2026-09-19 (`migrations/0001_neon_baseline.sql`:
consolidated byte-verbatim replay of the three Supabase migrations, PG17
reviewed). No Neon project link, branch provisioning, function deploy,
migration apply, or secret provisioning has occurred. Everything under
`neon/` remains planning/interface material until a lane approval says
otherwise.

## Layout

- `migrations/0001_neon_baseline.sql` — consolidated baseline: byte-verbatim
  S1→S2→S3 replay of `supabase/migrations/` (checksums pinned in-file),
  PG17-reviewed, NOT APPLIED. Supabase files remain the change history;
  this file is the Neon apply target (approved lane only).
- `functions/` — reserved for Neon Functions ports of `session`, `ai-gateway`,
  `agent-executor` (Node/Hono shape). Empty until Track B opens.

## Transport decision (from official Neon facts)

- Default path: Neon Data API (PostgREST-compatible) → existing `*-store.ts`
  adapters change base URL + auth headers only; queries unchanged.
- Runtime path: Neon Functions (Node.js) replace `Deno.serve` entrypoints;
  handler business logic moves unchanged.
- Auth: HMAC wallet sessions kept; Managed Better Auth out of MVP.
- Secrets (`OPENAI_API_KEY`, `SESSION_HMAC_SECRET`): Neon function env only,
  provisioned via Dashboard/CLI at lane time. Never in this repo.

## No-go (same bar as any live lane)

No `neon link/deploy`, no `db push`, no env provisioning from this skeleton.
Each needs explicit approval + the B1–B5 blockers resolved
(see `docs/migrations/pact-v1-neon-backend-facts.md`).
