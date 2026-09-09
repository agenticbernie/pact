---
name: context:container-e2e
description: Pact local service orchestration and container-level verification boundaries.
keywords: container, docker, local, e2e, supabase, anvil, orchestration, runtime
related: [context:all-tests]
date: 09-09-26
---

# Container and Local Runtime E2E

## Current State

No Docker or container definition is present, and no local runtime orchestration
script exists yet. Pact does not currently qualify for a separate container
context group based on repository source; this file is a test-context route
because the Phase 01/07 plans explicitly reserve a local stack gate.

## Planned Boundary

The local stack will combine an Anvil chain, local Supabase/Postgres, the
regional function, the edge worker, and the Vite web app. Local fixtures must
be isolated from production URLs and secrets. Testnet mutation is not part of
this lane.

## Planned Commands

    node scripts/start-local-stack.mjs
    yarn test:e2e
    node scripts/stop-local-stack.mjs

The start/stop scripts must fail clearly if a required process cannot start and
must clean up owned child processes after the test run.

## Update Triggers

Update this file when a container definition, local service, port contract,
startup dependency, teardown rule, or local E2E command is added or changed.
