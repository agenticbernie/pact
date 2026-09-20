# Pact v1 — Neon Backend Facts (official sources only)

Date: 2026-09-19 · Sources: `https://neon.com/docs/*`, `https://neon.com/guides/*`
(official Neon docs, fetched 2026-09-19). No blogs or community posts used.
Neon AI Gateway is documented below as future-option context only — NOT used in
this phase per governance rule 4.

## CONFIRMED (official docs)

### Lakebase Postgres
- Fully managed serverless Postgres; any Postgres driver/ORM/framework works
  (neon.com/docs/postgres/overview). Existing Supabase SQL (tables, CHECKs, indexes)
  is portable Postgres — migration is tooling + idiom review, not rewrite.
- Copy-on-write branching: instant isolated clones WITH data (unlike Supabase
  branches which rebuild from migrations/seeds) (neon.com/guides/neon-vs-supabase).
- Autoscale, scale-to-zero, instant point-in-time restore, read replicas, pooling.
- Pact note: G22-style drift checks map to branch diffs; preview branches give
  staging-like parity without seed scripts.

### Neon Functions
- Serverless Node.js compute deployed onto a Neon branch, same region as data
  (neon.com/docs/compute/functions/overview). Replaces Supabase Edge/Deno runtime.
- `DATABASE_URL` (+ unpooled variant) injected automatically; branch-scoped
  (neon.com/docs/compute/functions/environment-variables.md).
- Long-running (streaming/WebSocket/SSE friendly); per-branch URLs; deploy via
  `neon functions deploy` / `neon.ts`; local via `neon env pull`; typed env via
  `@neon/env` `parseEnv`.
- Custom secrets via `--env KEY=VALUE` or `neon.ts` `env` field. Never commit values.

### Neon Data API (key migration simplifier)
- PostgREST-compatible HTTP query interface for Postgres; protocol identical to
  PostgREST — "migration is as simple as pointing your client to a new endpoint
  and updating auth" (neon.com/blog/a-postgrest-compatible-data-api-now-on-neon,
  neon.com/docs/data-api/overview).
- Pact impact: `_shared/session-challenge-store.ts`, `intent-store.ts`, `card-store.ts`
  use raw PostgREST fetch (`eq./is.null/gt./select=` DSL) with NO supabase-js —
  so the adapter delta is base-URL + auth-header shape, not query rewrite. CONFIRMED
  as the lowest-risk persistence path (Track B default).
- Per-branch Data API endpoints; JWT auth (Neon Auth or external JWKS); RLS enforced.

### Managed Better Auth
- Users/sessions/OAuth in `neon_auth` schema, queryable SQL, RLS-compatible,
  branch-scoped (neon.com/docs/auth/overview). AWS regions only at fetch time.
- Official Supabase→Neon migration guide exists (neon.com/guides/complete-supabase-migration,
  neon.com/docs/auth/migrate/from-supabase); `@neondatabase/neon-js` with
  `SupabaseAuthAdapter` keeps `from()` query code identical.
- LIMITS (confirmed): password-hash users CANNOT transfer (different hashing);
  NO phone/SMS/WhatsApp, NO SAML SSO, NO Web3 wallet sign-in; `updateUser()` has
  reduced params; email verification UI must be built by app.
- Pact verdict: Pact authenticates a single agent wallet via HMAC challenge/session
  (Web3 sign-in) — Managed Better Auth does NOT fit the MVP auth path. Keep
  `session-token.ts` + session functions; mark Better Auth as "Cần xác minh live sau /
  không dùng trong MVP". Revisit only if product adds human OAuth login.

### Neon Object Storage
- S3-compatible, beta, branches with DB; `AWS_*` creds injected; presigned-URL
  upload pattern with metadata table in Postgres (neon.com/docs/guides/aws-s3).
- Pact verdict: Pact stores no files/objects (evidence is JSON manifests + chain
  state) → Cần loại khỏi MVP. Boundary reserved, no code.

### Branching / env / secrets
- `neon link` / `checkout` / `env pull` write managed vars to local `.env`
  (preserving other lines); `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`
  core + per-service creds (`NEON_AUTH_*`, `NEON_DATA_API_URL`, `NEON_AI_GATEWAY_*`,
  `AWS_*`) (environment-variables.md).
- Pact mapping: `SUPABASE_URL`→Data API URL or `DATABASE_URL`; service-role header →
  Data API JWT/JWKS model; `SB_REGION`/`SUPABASE_FUNCTION_REGION` → branch region
  (functions co-located, no cross-region hop); `SUPABASE_REGIONAL_FUNCTION_URL` →
  per-function Neon URLs; secrets via Neon env, never repo.

### Neon AI Gateway (future option — NOT in this phase)
- Exists as branch-scoped gateway (`NEON_AI_GATEWAY_TOKEN/BASE_URL`, OpenAI
  Responses dialect at `/openai/v1`); Pact keeps direct OpenAI `fetch` with
  `store:false` + strict schema. No `NEON_AI_GATEWAY_*` in source; provider
  abstraction reserves the seam without wiring it.

## INFERRED (needs verify before build)

- I1: PostgREST adapters port to Data API with only transport-config change
  (base URL + headers). Verify by: Data API branch endpoint + existing Vitest
  contract tests re-pointed (no query rewrite expected).
- I2: Migrations `202609080001/202609120001` apply on Neon Postgres as-is except
  Supabase idioms (RLS deny matrix semantics, `to_regclass` guards) — review
  against a Neon branch diff (G22-equivalent), not assumed green.
- I3: Deno `Deno.serve` entrypoints port to Neon Functions Node/Hono shape;
  pure handler logic (session/gateway/executor) is runtime-agnostic. Verify by:
  function deploy on a preview branch + `/health` smoke.
- I4: OpenAI relay code moves unchanged (only env-source + fetch injection change).

## UNKNOWN (never hard-code)

- U1: Neon project/branch IDs, connection strings, Data API URLs (created at lane time).
- U2: Managed Better Auth availability outside AWS / future Web3 support.
- U3: Object Storage GA status/pricing (irrelevant for MVP).
- U4: AI Gateway model/dialect parity for `pact_agent_intent` strict schema (future).

## BLOCKER (need Bernie confirmation / access)

- B1: Neon project + branch provisioning approval (who creates, which region —
  note Phase 04 expected `us-east-1` vs observed `ap-southeast-1` mismatch; decide
  the Neon region explicitly).
- B2: `OPENAI_API_KEY` in Neon function env (server-side only) — Dashboard/CLI
  provisioned, never repo. (Existing key story unchanged; new home needed.)
- B3: `SESSION_HMAC_SECRET` rotation/provisioning story on Neon (function-only env).
- B4: Decision: keep HMAC wallet sessions (recommended for MVP) vs adopt Better Auth
  for future human login — product call, not technical.
- B5: Staging seed data (`cards:7`-equivalent) re-creation on Neon branch for H-lanes.

## Compatibility decision (initial; migration plan owns final)

| Item | Decision |
|---|---|
| Tables/columns/constraints/indexes (both migrations) | Có thể giữ nguyên (Postgres-portable; idiom review) |
| RLS deny matrix | Cần adapter (Neon Data API + RLS review per official guide) |
| PostgREST adapters (`*-store.ts`, ports, headers) | Cần adapter (base URL + auth header; queries unchanged — Data API compat) |
| `payment_attempts` missing adapter | Cần viết lại (new Neon-side adapter; close the gap) |
| Deno entrypoints / `deno.json` / `config.toml` | Cần viết lại (Neon Functions Node shape) |
| Handler business logic (session/gateway/executor/preflight/reconcile) | Có thể giữ nguyên |
| OpenAI provider (`openai-provider.ts`, `provider-port.ts`, model pin) | Có thể giữ nguyên |
| HMAC wallet sessions | Có thể giữ nguyên (Better Auth: Cần loại khỏi MVP) |
| Edge Worker → Neon URLs | Cần adapter (per-function routing decision) |
| Object Storage | Cần loại khỏi MVP |
| Neon AI Gateway | Cần xác minh live sau (boundary only) |
| Cloudflare Worker long-term | Cần xác minh live sau (keep during migration, decide cutover later) |
