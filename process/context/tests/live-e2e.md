---
name: context:live-e2e
description: Pact Advance Testnet preflight, deployment verification, model access, and evidence-lane checks.
keywords: live, advance, testnet, rpc, deployment, preflight, evidence, asc, model, region
related: [context:all-tests]
date: 09-09-26
---

# Advance Testnet and Live Evidence

## Scope

This document covers the hybrid lane that verifies Pact against Creditcoin EVM
Advance Testnet and the configured OpenAI region/model. It is owned by Phase 07
and is separate from local automated tests. Reading this file does not grant
permission to broadcast transactions or mutate testnet state.

## Required Gates

- target network is explicitly `advance-testnet`;
- the canonical network config and deployment manifest pass parity checks;
- chain ID, RPC identity, contract bytecode, owner/agent wiring, and ASC
  verifier identity are verified;
- model access and permitted region pass without provider/model substitution;
- disposable wallet labels and server-side secret names are present without
  exposing values;
- preflight is read-only before any approved broadcast;
- evidence is redacted and links only to target-chain transactions/logs.

## Planned Commands

    node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
    node scripts/preflight-live-lane.mjs --network advance-testnet --dry-run
    node scripts/verify-model-access.mjs --network advance-testnet
    node scripts/rehearse-live-demo.mjs --network advance-testnet --dry-run
    node scripts/check-no-secrets.mjs

The non-dry-run rehearsal requires an explicit live-lane approval. It must
record transaction hashes, receipt status, matching indexed events, and
explorer links, while never claiming settlement from a single signal.

## Current Blockers

The network config, deployment manifest, live scripts, exact Advance Testnet
identity, ASC verifier details, and provider access are not materialized or
verified at setup time. No live testnet action has been run.

## Update Triggers

Refresh when chain identity, deployment addresses, model/region access, ASC
decoder, evidence schema, live command, or approval boundary changes.
