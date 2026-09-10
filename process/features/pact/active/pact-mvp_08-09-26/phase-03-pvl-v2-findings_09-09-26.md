# Phase 03 PVL V2 Findings — Layer 1 + Layer 2

Date: 2026-09-09
Plan: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md
Research: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_RESEARCH_09-09-26.md
Mode: Simple (single plan file; no container/infra/worker lifecycle; new package is greenfield TS)
Method: inline single-threaded validation with real files and real command output
(no validate-agent subagent type in this environment). No RPC, deploy, transaction,
provider, or secret operations performed.

## V1 pre-check evidence

- Structural validator: exit 0, 0 failures, 0 warnings (508 lines).
- Baseline: `typecheck` exit 0; domain suite 6 files / 56 tests green; full Forge
  suite 8 suites / 64 tests green; context-discovery audit exit 0.
- Scout: 7 plan-created paths absent as expected; 4 prerequisites exist
  (controller source, domain package, both pinned GluWa packages).
- Existing contract: placeholder only. Inner PVL: phase-program check skipped.

## Layer 1 — Dimension verdicts

| Dimension | Verdict | Findings | Evidence |
|---|---|---|---|
| Infra/setup fit | CONCERN | Created paths absent but planned (documented creation). R-F tsconfig coverage is specified, application is EXECUTE work. No container/infra/worker lifecycle touched. | path loop (7 absent, 4 present) |
| Test coverage | CONCERN | Tiers cover every area (source, harness, worker, AICD, hybrid lane, probe). Harness matrix lists 10 negative cases; worker suite lists 6; R-A–R-H each carry tests. Explicitness note C-P3b below. | tier matrix + edge-pack greps; R-field audit (8/8 substance) |
| Breaking changes | PASS | No Phase 01/02 file modified by the plan; R-E/R-F specify future supplements with ownership recorded; domain `evidence.ts` is additive; SDK consumed read-only. | registry rows; supplement conflicts section |
| Security surface | PASS | STRIDE in plan; chain-binding residual explicitly modeled without faked handler tests; withdraw-style new surface absent here; no secrets; no live calls. | plan Security Review; research threat model; R-H |

## Layer 2 — Per-section feasibility

| Section | Feasible | Gaps | Conflicts | Highest-risk edit |
|---|---|---|---|---|
| Task 1 source emitter | yes | none structural | none | pin verification is record-only (pins already held) |
| Task 2 ASC + harness | yes | none structural | none | etched-mock fidelity (fixture-true-only discipline) |
| Task 3 worker adapter | yes | R-F application | none | ProofBuilder mapping (R-A type-level guard) |
| Task 4 evidence + AICD | yes | none structural | none | redaction hostile fixtures (specified) |
| Task 5 hybrid-or-blocker | yes | U-gated by design | none | lane approval + attestation waits (~8 min typical) |
| Acceptance criteria | yes | AC-04 live half hybrid | none | correct strategy assignment |
| Risks / edge pack | yes | residual chain model | none | documented, not widened |
| Tiers / touchpoints / contracts | yes | none | none | consistent with registry rows |
| Blast radius | yes | R-E noted | none | cross-phase specification only |
| Verification / exit gate | yes | C-P3b notes | none | explicitness, not substance |

Feasibility probes: none emitted. Every unknown is an explicit hybrid gate (U1–U5)
or a NOT-RUN pre-implementation gate below.

## Non-negotiable design checks (session-mandated)

1. Verifier precompile: plan states `0xFD2` constant, no bytecode expectation, mock
   Anvil-only, never prod — verified in supplement text. Compliant.
2. Decoder inlined: no address/deployment modeled; the single `0x04B9` mention is
   inside an explicit do-not-copy rejection — compliant, not a violation.
3. Proof mapping: `isLeft` canonical (4 mentions); 1:1 mapping specified; no chainKey
   inference anywhere; handler/reconcile pattern preserved. Compliant.
4. Chain binding: no handler-level rejection test claimed (plan Task 2.1 list
   contains none — verified); worker allowlist units + manifest chainKey equality
   specified (R-H); Sepolia key explicitly hybrid-gated. Compliant.
5. Operational bounds: 3 attempts / 5s / state-check / +35% / 50-block halving /
   20-min cap / hybrid-only — all present (5 mentions). Compliant.
6. Authority: ASC-only hook unchanged; no treasury path; registration + allowlist
   explicit with tests; multi-action and monotonic gate recorded rejected. Compliant.

## R-A–R-H field audit

Substance present 8/8 (task, file, acceptance, test, AICD, gate, failure/hard-stop).
Labels vary (`File:` vs `Files:`); R-F and R-H failure lines are implicit rather than
labeled. Recorded as C-P3b explicitness note with the exact normalization text ready
for a supplement touch-up — no semantic gap.

## Exact-gate assessment (future gates, all NOT RUN by construction)

Local Anvil mock, proof construction/decoding, malformed rejection, `isLeft`
behavior, expiry/freshness, replay (evidence + query), unauthorized callers,
worker allowlist, registration binding, reconcile loop, gas fallback, chunking —
each has an exact future command in the plan (Forge match-paths, worker Vitest
paths, typecheck, AICD validator). Hybrid lane (live proof, manifest, chainKey
confirmation) is approval-gated with exact evidence listed. Nothing future is
claimed green.

## Checklist disposition (session items 1–11 adapted)

1. Tasks 1–5 scoped and ordered — yes. 2. R-A–R-H mapped — yes (C-P3b notes only).
3. No contradictions (plan, supplement, research, Phase 01/02, umbrella) — yes.
4. Authority/fund-flow enforceable and testable — yes. 5. Invariants explicit and
falsifiable — yes. 6. Negative + replay + allowlist tests specified — yes.
7. No scope expansion — yes. 8. U1–U5 routed — yes. 9. Blast radius valid — yes.
10. Referenced paths resolve — yes. 11. Validators clean — yes.

## Open gaps (CONCERNs, zero failing verdicts)

- C-P3a: plan-created paths absent (correct pre-EXECUTE state; RED-first increments).
- C-P3b: R-field label normalization + explicit R-F/R-H failure lines (ready text,
  awaits V4 supplement-or-accept decision).
- C-P3c: R-E cross-phase application pending by design (gates Task 5 hybrid only).
- C-P3d: Sepolia key + hybrid unknowns pending by design (U1–U5 routing verified).

## What This Coverage Does NOT Prove

No Forge, worker, deployment, RPC identity, liveness, denomination, chainKey value,
or testnet evidence exists or is claimed. Attestation latency, gas behavior, and
faucet availability are documented from official sources, unprobed. Green
confirmation of every NOT-RUN gate is deferred to EXECUTE/EVL.

## Net gate

Net gate: CONDITIONAL — CONCERNs only (C-P3a through C-P3d), zero failing dimensions,
zero failing sections.

Machine check: run `node .claude/skills/vc-validate-findings/scripts/validate-findings-output.mjs process/features/pact/active/pact-mvp_08-09-26/phase-03-pvl-v2-findings_09-09-26.md` (expect exit 0).
