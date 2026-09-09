# Pact

<!-- Part of the Pact project -->

## Scope

Pact is the product feature for a testnet-only programmable virtual spending
card controlled by one AI Agent. It covers the shared domain contract, on-chain
policy and native Advance Testnet settlement, ASC credit evidence, the OpenAI
relay/executor path, indexed read models, the browser control room, and the
integrated demo/evidence lane. The current active task folder contains the
umbrella plan plus seven phase plans; implementation source is not materialized
yet.

## Key Source Files

- `process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md` — execution order and phase gates
- `process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md` — shared foundation and context bootstrap
- `process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md` — Solidity policy authority and pool
- `process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md` — ASC evidence ingestion and verification
- `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md` — provider relay, preflight, and agent execution
- `process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md` — confirmed logs and truthful receipts
- `process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md` — setup, card, agent console, and receipt UI
- `process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md` — deployment, CI, rehearsal, and evidence
- `process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md` — file ownership and cross-phase change rules
- `docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md` — product and architecture source
- `docs/superpowers/plans/2026-09-08-pact-mvp-implementation-plan.md` — Superpowers task decomposition

Planned code roots are `packages/domain/`, `contracts/`,
`packages/asc/`, `supabase/`, `apps/web/`,
`config/`, `scripts/`, and `e2e/`. They are
not yet present and must not be treated as implemented.

## Related Context

- `process/context/all-context.md` — product truth, repository state, and routing
- `process/context/planning/all-planning.md` — plan conventions and phase ownership
- `process/context/tests/all-tests.md` — verification commands and test-context routing

## Current Status

Status: in-progress

The branch is in pre-PVL foundation setup. The Vibecode harness and durable
context tree are installed; Phase 01 still requires implementation source and
discoverable tests before strict validation can authorize execution.

## Folder Contents

```
process/features/pact/
  active/       -- current umbrella and phase plans in a dated task folder
  completed/    -- archived completed plans after verified completion
  backlog/      -- deferred Pact work that is not in the active MVP path
```

All Pact artifacts belong inside a dated task folder under the appropriate lane.
Do not create `reports/` or `references/` sibling directories.
