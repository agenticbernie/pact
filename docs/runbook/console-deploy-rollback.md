# Console deployment and rollback runbook

Covers shipping and reverting the Pact web console (`apps/web`) and the API surface it
calls. Deployment is host-git-integration based: the repository has no CI workflow
(`.github/workflows` is absent) and, per the README, no deployment scripts yet.

## Topology

- **Web** — `apps/web` (Vite + React). Built by `yarn build:web` (runs
  `tsc --noEmit` then `vite build`) into `apps/web/dist`. Hosted on Netlify
  (`netlify.toml`) or Vercel (`vercel.json`).
- **API** — the `session` and `readapi` functions run on Neon-hosted compute. The
  committed host configs rewrite `/v1/session/*`, `/v1/*` and `/health` to them, so the
  browser and the read API share one origin and the wallet-bound session token never
  crosses a site boundary.
- **Database** — Postgres: a hosted Neon branch, or the compose Postgres locally.
- **Local sandbox** — `docker compose -f docker-compose.base44.yml up -d` (port 3000 is
  the console dev server; it proxies `/v1/*` and `/health` to the api service).

## Preconditions

- Required secrets are present (`SESSION_HMAC_SECRET` is required at boot; `DATABASE_URL`,
  `OPENAI_API_KEY`, `OWNER_WALLET_PRIVATE_KEY`/`OWNER_WALLET_ADDRESS`,
  `AGENT_SIGNER_PRIVATE_KEY`, … are optional for boot — names are documented in
  `.base44/environment.json`).
- Migrations `neon/migrations/*.sql` have been applied in lexical order. They are
  additive and idempotent; the compose `migrate` service applies them on boot, and a
  hosted Neon branch is migrated out of band.

## Deploy

1. Build: `yarn build:web` → `apps/web/dist`.
2. Publish the build through the connected host project (Netlify/Vercel git
   integration). The committed `netlify.toml` / `vercel.json` own the build command, the
   output directory, the `/v1/*` + `/health` rewrites, and the SPA fallback.
3. Confirm the API functions and the database schema are already deployed for the target
   environment.

## Verify after deploy

```bash
curl -s https://<host>/health          # 200, "chainId": 5042002
curl -s https://<host>/v1/config       # 200 with the controller address
```

`503 PROVIDER_UNAVAILABLE` from `/v1/config` means a required migration is missing on
that database branch — apply the migration, do not roll back the web build. Then sign in
with the owner wallet and open `/console`, `/cards/new`, and `/cards/2`.

## Rollback

- **Web (preferred, no rebuild):** re-publish the previous successful build from the host
  dashboard — Netlify: roll back to a prior deploy; Vercel: promote the previous
  deployment to production.
- **Web (from source):** `git revert 536c6be 8e60a72`, rebuild with `yarn build:web`, and
  re-publish. Reverting removes only the issuance page, the policy/ABI libraries and the
  settlement panel; the read-only console is unaffected.
- **API/functions:** redeploy the previous function version. The console read routes are
  additive, so an older console keeps working against the newer API.
- **Database:** no destructive down-migration is required — the migrations only add
  tables/indexes. **Never delete the `db-data` volume.** If a branch lags a required
  migration, apply it rather than reverting code.
- **Secrets:** this release adds no new secret names, so there is no secret to roll back.

## Post-rollback verification

Repeat the "Verify after deploy" checks: `/health` and `/v1/config` must answer, and the
console must load the owner's read model.
