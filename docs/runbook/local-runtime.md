# Local runtime runbook (Phase 04)

Local-first: every binding gate runs without production URLs, service-role
values, provider secrets, or live chain mutation.

## Binding local gates (G1–G6)

```bash
corepack yarn vitest run packages/domain/test
corepack yarn vitest run apps/edge/test/edge.test.ts
corepack yarn vitest run supabase/functions/ai-gateway/test/ai-gateway.vitest.test.ts
corepack yarn vitest run supabase/functions/agent-executor/test/executor.vitest.test.ts
corepack yarn typecheck
corepack yarn lint
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
git diff --check
```

Deno/Supabase suites (`supabase/functions/*/test/*.test.ts`) are CI-only
references (G7) and MUST NOT gate local green. Do not shell to
`deno`/`supabase`; if the CLIs are absent, record as such, never fail.

## Fake-backed smoke

```bash
node scripts/smoke-edge-gateway.mjs
```

Exercises challenge → verify → intent(fake) → preflight(fake) →
execute(fake) with correlated request IDs and zero live testnet calls, plus
malformed-provider and over-limit fixtures (mapped codes, zero sends).

## Secrets

Names only in code/tests; values live only in local/hosted secret stores.
`SESSION_HMAC_SECRET` is function-only with versioned rotation
(verify-accept-old-for-one-session-TTL overlap then destroy). The edge and
browser never receive provider/signer/service-role secrets. Upstream is the
fixed `SUPABASE_REGIONAL_FUNCTION_URL` only.

## Pins

- Challenge TTL 5 min; session TTL 30 min; sha256-hex-only hashes.
- `payment_attempts` first-claim + store-txHash-before-wait + reconcile.
- Single model truth `config/ai/model-config.json`
  (`openai`/`gpt-5.6-luna`/`allowFallback:false`).
