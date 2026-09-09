---
name: context:all-tests
description: Pact verification commands, test-tier ownership, and failure-triage routing.
keywords: testing, verification, vitest, forge, deno, supabase, playwright, preflight, aicd, secrets
related: []
date: 09-09-26
---

# Pact — All Tests

Attach this file after `process/context/all-context.md` whenever the task
involves testing, verification, debugging, CI, or evidence collection.

## Current State

Phase 01 foundation outputs are materialized and gated: `packages/domain`
source plus its Vitest suite, canonical network/AI configuration, AICD source
with validator and generated diagram, and the preflight/secret-scan scripts.
The rows below marked green are executable now; the rest become executable as
their owning phase materializes the corresponding files and toolchains. No
green result is claimed from a planned command.

Current shell facts: Node `v24.17.0` and Corepack `0.35.0` are available;
`corepack yarn --version` reads `1.22.22`. Foundry (`forge`/`cast`/`anvil`)
and `wrangler` are installed. Supabase CLI, Deno, and Playwright are not
installed in this environment.

## Test-Tier Routing

| If you need... | Read next |
|---|---|
| shared schema, canonical hash, config, and fixture tests | `contract-tests.md` for the domain/contract boundary, then Phase 01 plan |
| Solidity policy, atomicity, invariant, or local deployment tests | `contract-tests.md`, then Phase 02 plan |
| Supabase migrations, relay, indexer, or Deno tests | `backend-tests.md`, then Phase 04 or Phase 05 plan |
| React rendering, accessibility, and browser-facing tests | `browser-tests.md`, then Phase 06 plan |
| local service/container orchestration | `container-e2e.md`, then the owning phase plan |
| Playwright browser automation | `browser-automation.md`, then Phase 07 plan |
| Advance Testnet RPC/model/region/evidence verification | `live-e2e.md`, then Phase 07 plan; require live-lane approval |

## Verification Order

1. Read the root context and the owning phase plan.
2. Run the narrowest existing automated test for the changed surface.
3. Run typecheck and lint when the change is TypeScript or web-facing.
4. Run AICD and secret scans for shared contracts, configuration, or evidence.
5. Run local integration/browser checks only after unit and contract checks are
   green.
6. Run the live lane only with explicit approval and disposable testnet state.

## Approved Commands

| Layer | Runner/command | Scope and current status |
|---|---|---|
| Domain | `corepack yarn vitest run packages/domain/test` | Phase 01 schema, hash, asset, config, preflight, and AICD fixtures — green |
| TypeScript | `corepack yarn typecheck` | root/domain type safety — green |
| Lint | `corepack yarn lint` | repository lint — green |
| AICD | `corepack yarn validate:aicd` | architecture/source/diagram consistency — green (11 components, 6 flows, 17 scenarios) |
| Solidity | `forge fmt --check` | formatting for `contracts/`; Foundry project not created yet |
| Solidity | `forge test --root contracts -vvv` | full Forge suite; contracts are not created yet |
| Solidity invariants | `forge test --root contracts --match-path test/PactPaymentInvariant.t.sol -vvv` | payment invariant gate; test is not created yet |
| Local deployment | `anvil --silent` plus the Phase 02 deploy script | local wiring/readback; Foundry is installed, deploy script arrives in Phase 02 |
| Backend | `supabase start && supabase db reset --local && deno test --allow-env --allow-net --allow-read supabase/test/schema.test.ts` | local migration gate; Supabase/Deno files and CLI arrive in Phase 04/05 |
| Web build | `corepack yarn build:web` | production web bundle; web app arrives in Phase 06 |
| Local E2E | `node scripts/start-local-stack.mjs && corepack yarn test:e2e && node scripts/stop-local-stack.mjs` | Playwright local path; scripts/app arrive in later phases |
| Preflight | `node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json` | read-only chain/config preflight — executable; fails closed (exit 2, `unverified`) while values are unconfirmed |
| Live lane | `node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run` | read-only deployment/demo preflight; Phase 07 owns it |
| Evidence | `node scripts/check-no-secrets.mjs` | source, fixtures, bundles, and evidence scan — green (clean) |

## Required Pact Assertions

- Strict model output parsing rejects unknown fields and invalid values.
- `policyVersion` participates in canonical intent hashing.
- Native testnet CTC uses the shared `native-testnet-ctc`/`address(0)` mapping.
- Off-chain preflight and on-chain policy reject the same invalid payment cases.
- Reused nonces, inactive cards, wrong merchants/assets, caps, expiry, and
  stale/invalid credit evidence fail closed.
- A successful receipt without its indexed `PaymentSettled` event is not
  settled; an event without a successful receipt is not settled.
- Browser bundles contain no provider, signer, service-role, or relay secret.
- Malformed model output, provider errors, wrong-chain RPC, and indexer lag are
  exposed as explicit failure/uncertain states.

## Debugging Rules

- Start from the smallest failing command and preserve its exact output.
- Never “fix” a fixture by weakening a contract, schema, or fail-closed gate.
- Do not print secret-shaped values while debugging. Record names and redacted
  error codes only.
- A network mismatch is a configuration failure, not a reason to retry against
  an unapproved chain.
- A model access failure is a bounded provider blocker; do not silently switch
  models or providers.
- A missing receipt/event signal is an uncertainty state, not success.

## Known Gaps at Setup Time

- Phase 01 executable coverage is green (domain, AICD, preflight fixtures,
  secret scan); contract sources, Supabase, web, and e2e coverage arrive with
  their owning phases.
- The toolchain owners for later phases (Supabase CLI/Deno, Playwright) still
  need to be installed in the build environment before their planned commands
  can be executed.
- Advance Testnet identity, ASC integration details, deployment addresses, and
  live model access require explicit verification before a demo lane.
