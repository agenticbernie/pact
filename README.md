# Pact

Pact is a testnet-only programmable virtual spending card for one AI Agent.
The MVP targets Creditcoin EVM Advance Testnet, uses native testnet CTC,
records Attestcoin ASC credit evidence, and routes OpenAI intent generation
through a regional Supabase relay behind a Cloudflare Worker. It does not
handle production funds, fiat settlement, physical cards, PAN, or CVV.

## Project Status

The repository is in Phase 01 foundation bootstrap on branch
`feat/pact-mvp`. The approved product/AICD design and Superpowers plan live
under `docs/superpowers/`; the executable phase plans and Vibecode context
live under `process/`.

## Start Here

1. Read `process/context/all-context.md`.
2. Read `process/context/planning/all-planning.md` for plan ownership.
3. Read `process/context/tests/all-tests.md` before testing or validation.
4. Follow the active Pact plans under
   `process/features/pact/active/pact-mvp_08-09-26/`.

The implementation manifest, application source, contracts, test runners, and
deployment scripts are planned Phase 01 outputs and are not present yet.

## Agents

| Agent | Role |
|---|---|
| `vc-code-reviewer` | Vibecode project workflow agent |
| `vc-code-simplifier` | Vibecode project workflow agent |
| `vc-debugger` | Vibecode project workflow agent |
| `vc-execute-agent` | Vibecode project workflow agent |
| `vc-fast-mode-agent` | Vibecode project workflow agent |
| `vc-git-manager` | Vibecode project workflow agent |
| `vc-innovate-agent` | Vibecode project workflow agent |
| `vc-plan-agent` | Vibecode project workflow agent |
| `vc-quick-fix-agent` | Vibecode project workflow agent |
| `vc-research-agent` | Vibecode project workflow agent |
| `vc-spec-agent` | Vibecode project workflow agent |
| `vc-tester` | Vibecode project workflow agent |
| `vc-ui-ux-designer` | Vibecode project workflow agent |
| `vc-update-process-agent` | Vibecode project workflow agent |
| `vc-validate-agent` | Vibecode project workflow agent |

## 33 Skills

`vc-agent-browser` · `vc-agent-strategy-compare` · `vc-audit-context` · `vc-audit-plans` · `vc-audit-vc` · `vc-autopilot` · `vc-autoresearch` · `vc-context-discovery` · `vc-debug` · `vc-docs-seeker` · `vc-feasibility-test` · `vc-frontend-design` · `vc-generate-closeout` · `vc-generate-context` · `vc-generate-phase-program` · `vc-generate-plan` · `vc-generate-spec` · `vc-intent-clarify` · `vc-plan-discovery` · `vc-predict` · `vc-problem-solving` · `vc-publish` · `vc-review-situation` · `vc-risk-evidence-pack` · `vc-scenario` · `vc-scout` · `vc-security` · `vc-sequential-thinking` · `vc-setup` · `vc-test-coverage-plan` · `vc-update` · `vc-validate-findings` · `vc-web-testing`

## Safety Boundary

Use local fixtures and dry runs by default. Never put secret values in source,
fixtures, context, manifests, browser bundles, logs, or evidence. Only the
explicitly approved Phase 07 live lane may mutate Advance Testnet state.
