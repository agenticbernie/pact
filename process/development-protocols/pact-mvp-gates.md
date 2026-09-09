---
name: protocol:pact-mvp-gates
description: "Pact MVP gate routing: exact gate commands, preconditions, and fail-closed rules per phase."
date: 09-09-26
metadata:
  node_type: memory
  type: protocol
  read_order: 10
  required: false
  read_when: "running Pact phase gates, regression checks, or deployment/demo lanes"
---

# Pact MVP Gate Routing

Phase 01 output. Routes every later agent to the exact gate commands, their
preconditions, and what each command does not prove. All Yarn commands run
through Corepack (`corepack yarn`); the pin is `1.22.22`.

## Foundation gate (Phase 01 exit; rerun for every regression)

```bash
corepack yarn typecheck
corepack yarn lint
corepack yarn test
corepack yarn validate:aicd
node scripts/check-no-secrets.mjs
node scripts/preflight-testnet.mjs --config config/networks/advance-testnet.json
git diff --check
```

Expected while Advance values are unconfirmed: everything green except
preflight, which exits `2` with reason `unverified` (fail-closed, no RPC
attempted). That exit is the correct evidence, not a defect.

## Per-phase gates

| Phase | Fully-automated gates | Hybrid / agent-probe |
|---|---|---|
| 01 foundation | domain Vitest suite, typecheck, lint, AICD validator + fixture, secret scan, preflight fixtures | preflight live identity (red until verified); routing + evidence-pack review |
| 02 payment contracts | `forge fmt --check`, `forge test --root contracts -vvv`, invariant suite, Anvil deploy dry-run, domain + AICD regression | local readback |
| 03 ASC evidence | ASC harness tests, proof retry/dedupe tests, domain + AICD regression | one live evidence rehearsal or blocker artifact |
| 04 AI gateway/executor | schema/provider/auth/executor tests, no-chain-call failure tests, edge-to-function smoke | regional header + model-access preflight |
| 05 indexer/read model | migration reset, idempotency/cursor tests | latest-block exposure review |
| 06 web UI | unit + accessibility tests, `build:web` | mobile/desktop probe, reduced-motion + focus review |
| 07 deployment/demo | CI green, manifest parity check, Playwright path | live allowed + blocked + suspended rehearsal |

## Fail-closed rules (all phases)

- Wrong chain, unverified config, or missing bytecode: stop, never guess.
- Provider/model unavailable: no intent, no payment, no silent substitution.
- No receipt plus matching indexed event: never show settled.
- No secret-shaped value in source, fixtures, bundles, logs, or evidence.
- A planned command is evidence only after it runs and its output is recorded.

## Ownership

- `scripts/preflight-testnet.mjs` is owned by Phase 01. Later phases wrap it
  read-only; they do not rename or overwrite it.
- `config/networks/advance-testnet.json` is the canonical network input.
  Deployment manifests parity-check against it.
- Root commands keep Phase 01 semantics; additions go through a plan
  supplement that records ownership.
