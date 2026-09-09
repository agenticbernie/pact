---
name: context:all-planning
description: Pact planning conventions, phase ownership, and implementation-plan routing.
keywords: planning, plan, phase, implementation, scope, pvl, superpowers, architecture
related: []
date: 09-09-26
---

# Pact Planning Context

This is the canonical planning context entrypoint for Pact. Read it after
`process/context/all-context.md` whenever a task changes scope, plan shape,
phase ownership, validation gates, or implementation order.

## Scope

This group covers:

- the approved Pact MVP and AICD design;
- the Superpowers implementation plan;
- the seven-phase Pact execution plans and their cross-phase contracts;
- plan supplements, blast-radius ownership, and validation protocol;
- calibration for SIMPLE versus COMPLEX work.

It does not contain implementation source, test results, or live deployment
state. Those belong to the feature task folder, `process/context/tests/`, or
redacted evidence artifacts created by the relevant phase.

## Current Plan Sources

| Purpose | Canonical file |
|---|---|
| Product and AICD design | `docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md` |
| Superpowers implementation plan | `docs/superpowers/plans/2026-09-08-pact-mvp-implementation-plan.md` |
| Umbrella execution | `process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md` |
| Phase 01 foundation | `process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md` |
| Phase 02 payment contracts | `process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md` |
| Phase 03 ASC credit evidence | `process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md` |
| Phase 04 AI gateway/executor | `process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md` |
| Phase 05 indexer/read model | `process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md` |
| Phase 06 web UI | `process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md` |
| Phase 07 integrated deployment/demo | `process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md` |
| Shared ownership registry | `process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md` |

## Read-Order Rules

1. Start with the root context router.
2. Load this group for plan or scope questions.
3. Load the feature plan that owns the files being changed.
4. Read the full test router and relevant deeper test context before writing
   or running tests.
5. If a change crosses a phase boundary, update the owning plan supplement
   and the blast-radius registry before implementation.
6. Do not mark a phase verified from a planned command. A command is evidence
   only after it is run and its output is recorded.

## Plan Conventions

- Plans use explicit `SIMPLE`/`COMPLEX` scope and numbered tasks.
- Every implementation task follows RED → verify failure → minimal change →
  green → refactor, with a focused verification command.
- Phase 01 owns shared domain primitives, canonical configuration, AICD, test
  context, and preflight scaffolding. Downstream phases consume those outputs.
- Phase 07 owns live-lane orchestration and deployment manifests, but the
  canonical network config remains a Phase 01 contract.
- Shared file ownership and test blast radius are recorded before edits.
- A user confirmation is required before a phase is marked `VERIFIED` or a
  live testnet lane mutates state.

## Update Triggers

Update this group and the affected plan supplement when:

- a new package, service, contract, route, or context group is introduced;
- a shared type, hash field, asset mapping, network constant, or error code
  changes;
- a test command, runner, toolchain version, or CI gate changes;
- a task moves between phases or an ownership boundary changes;
- a live-lane constraint, provider region, or deployment fact is verified.

The current repository is still before implementation bootstrap. Planned paths
in the phase documents are not evidence that those files already exist.
