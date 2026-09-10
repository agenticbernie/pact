# Phase 02 PVL V2 Findings — Layer 1 + Layer 2

Date: 2026-09-09
Plan: process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md
Research: process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_RESEARCH_09-09-26.md
Mode: Simple (single plan file; no container/infra/worker lifecycle; one code package)
Method: inline single-threaded validation with real files and real command output
(no validate-agent subagent type in this environment). No RPC, deploy, transaction,
provider, or secret operations performed.

## V1 pre-check evidence

- Structural validator: exit 0, 0 failures, 0 warnings (491 lines).
- Baseline: `typecheck` exit 0; domain suite 6 files / 56 tests green;
  `forge fmt --check` exit 0 (vacuous — no sources yet, recorded as such);
  context-discovery audit exit 0.
- Scout: 6 plan-created paths absent as expected; 3 prerequisites
  (`contracts/foundry.toml`, `packages/domain`, `package.json`) exist.
- Toolchain observed: forge 1.7.1, anvil 1.7.1, commit 4072e48 — matches the
  session toolchain contract exactly. No svm cache: solc 0.8.30 download occurs
  at first build in EXECUTE (NOT RUN here).
- Existing contract: placeholder only. Inner PVL: phase-program check skipped.

## Layer 1 — Dimension verdicts

| Dimension | Verdict | Findings | Evidence |
|---|---|---|---|
| Infra/setup fit | CONCERN | Created paths absent but planned (documented creation). Toolchain present; solc download pending first build (bounded: EXECUTE Task 1; a download problem surfaces there, not here). | path loop; `forge/anvil --version`; svm listing; `forge config` (solc 0.8.30, osaka default noted by research D2) |
| Test coverage | CONCERN | Tier assignments exist for every blast-radius area (suite, invariants, Anvil hybrid, readback probe, regression). Micro-gaps, none structural: no `forge/anvil --version` assertion gates; no explicit `forge build` gate; no `--ffi=false` pin (no ffi cheatcodes planned; default runs without ffi); fuzzing only via invariant runs. | tier matrix greps (6 mentions full suite + invariant path; 3 anvil; 2 script; 3 export) |
| Breaking changes | PASS | New public surface, no live consumers. Phase 01 outputs consumed read-only (vectors, descriptors, loaders). R1 cross-phase touch (`foundry.toml` additive key) recorded for the Phase 01 supplement chain. R2 realignment explicitly rejected. Research-vs-plan-vs-supplement consistent. | registry rows; supplement conflicts section; R1–R12 presence greps (12/12) |
| Security surface | PASS | STRIDE review in plan; D1–D10 challenged in research; withdraw + wiring setters + renounce-lock each carry named revert tests; no secrets; no live calls. Residual EVM-level risk routed to U1 hybrid gate. | plan Security Review; research invariants 1–9; supplement R3–R5/R7 |

## Layer 2 — Per-section feasibility

| Section | Feasible | Gaps | Conflicts | Highest-risk edit |
|---|---|---|---|---|
| Task 1 types/errors/interfaces | yes | C-V2b (solc download) | none | first build pulls solc 0.8.30 |
| Task 2 merchant + pool | yes | none structural | none | recipient-forwarding reentrancy (covered by D9 + guard + snapshot tests) |
| Task 3 lifecycle + credit hook | yes | none structural | none | agent-mapping edge cases (double-create, close-clears) — tests specified |
| Task 4 pay + invariants | yes | C-V2c (paired-matrix explicitness already in R6) | none | preflight/pay drift (paired tests specified) |
| Task 5 deploy + SDK | yes | none structural | none | wiring triangle + chain guard (tests + assertion specified) |
| Acceptance criteria | yes | none | none | AC-09 hybrid via Anvil is the correct strategy |
| Risks / edge pack | yes | residual U1 only | none | EVM-level support verified at Phase 07 deploy |
| Tiers / touchpoints / contracts | yes | none | none | consistent with registry rows |
| Blast radius | yes | R1 noted | none | single additive key in a Phase 01 file |
| Verification / exit gate | yes | C-V2c micro-gaps | none | version/build/ffi explicitness |

Feasibility probes: none emitted. Every unknown is an explicit hybrid gate (U1–U5) or a
NOT-RUN pre-implementation gate below.

## Exact-forge-gate assessment (session-mandated list)

| Gate | In plan | Evidence |
|---|---|---|
| `forge --version` | NOT in plan (note) | observed locally 1.7.1/4072e48; recommend EXECUTE records versions in report |
| `anvil --version` | NOT in plan (note) | observed locally 1.7.1; same recommendation |
| `forge fmt --check` | yes, exact | ran pre-implementation: exit 0, vacuous (no sources) |
| `forge build` | implied, not explicit (note) | NOT RUN (would fetch solc + write cache); first run is EXECUTE Task 1 |
| `forge test` / `-vvv` / `--match-path` | yes, exact with expected results | NOT RUN (no sources exist); RED-first runs begin EXECUTE Task 1.1/2.2 |
| `--ffi=false` | NOT pinned (note) | no ffi cheatcodes planned; default runner does not use ffi |
| invariant execution | yes, exact path | NOT RUN; runs green-confirmation deferred to EXECUTE/EVL |
| deployment chain guard | yes (Task 5.3 + scenario) | NOT RUN; local Anvil lane in EXECUTE Task 5 |
| artifact/export verification | yes (Task 5.4/5.5 fields + SDK import + typecheck) | NOT RUN; produced in EXECUTE Task 5 |

Nothing above is claimed green. NOT RUN items are pre-implementation by construction.

## Checklist disposition (session items 1–11)

1. Tasks 1–5 scoped and ordered — yes (5 depends on 1–4 outputs).
2. R1–R12 mapped (task, file, acceptance, test, AICD, gate) — yes, 12/12 present.
3. No contradictions (plan, supplement, research, Phase 01, umbrella) — yes.
4. Authority/fund-flow boundaries enforceable and testable — yes.
5. Invariants explicit and falsifiable — yes (9 research invariants; plan matrix).
6. Negative + invariant tests specified — yes.
7. No MVP scope expansion — yes (withdraw/renounce-lock are spec-grounded hardening).
8. U1–U5 routed to Phase 03/07 — yes.
9. Blast radius + ownership valid — yes.
10. Referenced paths resolve — yes (12/12 key paths).
11. Validators clean — yes (plan, context, scan, diff).

## Open gaps (CONCERNs, zero failing verdicts)

- C-P2a: plan-created paths absent (correct pre-EXECUTE state; first increments are RED tests).
- C-P2b: solc 0.8.30 download pending first EXECUTE build.
- C-P2c: gate explicitness notes (`--version` assertions, explicit `build`, `--ffi=false`).
- C-P2d: R1 cross-phase `foundry.toml` touch pending EXECUTE application.

## What This Coverage Does NOT Prove

No Forge test, build, deployment, RPC identity, or testnet evidence exists or is claimed.
`forge fmt` green is vacuous pre-implementation. Chain identity (102031) is documented
from official sources with liveness unprobed. Solc/OS toolchain versions observed, not
exercised. Green confirmation of every NOT-RUN gate is deferred to EXECUTE/EVL.

## Net gate

Net gate: CONDITIONAL — CONCERNs only (C-P2a through C-P2d), zero failing dimensions,
zero failing sections.

Machine check: run `node .claude/skills/vc-validate-findings/scripts/validate-findings-output.mjs process/features/pact/active/pact-mvp_08-09-26/phase-02-pvl-v2-findings_09-09-26.md` (expect exit 0).
