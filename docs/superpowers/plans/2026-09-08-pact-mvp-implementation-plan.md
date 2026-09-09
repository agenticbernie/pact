# Pact MVP Implementation Plan

> **For agentic workers:** The authoritative implementation plan is the phase-program set referenced below. Use superpowers:subagent-driven-development or superpowers:executing-plans to execute one checklist task at a time.

**Goal:** Implement the approved Pact MVP as real testnet software with on-chain policy authority, ASC credit evidence, OpenAI intent generation, autonomous settlement, and truthful UI receipts.

**Architecture:** The plan is intentionally split into seven gated phases because the product crosses Solidity, Attestcoin proofs, regional AI infrastructure, Supabase data, Cloudflare edge, browser UX, and live testnet verification.

**Tech Stack:** Solidity/Foundry/OpenZeppelin/ASC, TypeScript/Yarn/ethers, Supabase, Cloudflare Workers, React/Vite, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-09-08-pact-mvp-aicd-design.md

## Global Constraints

- Treat the approved design as authoritative.
- Follow the Superpowers TDD loop and the Vibecode R → I → P → PVL → E → EVL → UP phase loop.
- Use real testnet state for payment, policy, credit evidence, and receipts; mock only non-authoritative demo metadata.
- Keep all keys disposable and server-side; never silently fall back from OpenAI gpt-5.6-luna.
- Do not run live/cost-bearing deployment or provider actions without the active phase contract and its safety gate.

## Canonical plan set

- Umbrella: process/features/pact/active/pact-mvp_08-09-26/pact-mvp-umbrella_PLAN_08-09-26.md
- Phase 01: process/features/pact/active/pact-mvp_08-09-26/phase-01-foundation_PLAN_08-09-26.md
- Phase 02: process/features/pact/active/pact-mvp_08-09-26/phase-02-payment-contracts_PLAN_08-09-26.md
- Phase 03: process/features/pact/active/pact-mvp_08-09-26/phase-03-asc-credit-evidence_PLAN_08-09-26.md
- Phase 04: process/features/pact/active/pact-mvp_08-09-26/phase-04-ai-gateway-executor_PLAN_08-09-26.md
- Phase 05: process/features/pact/active/pact-mvp_08-09-26/phase-05-indexer-read-model_PLAN_08-09-26.md
- Phase 06: process/features/pact/active/pact-mvp_08-09-26/phase-06-web-ui_PLAN_08-09-26.md
- Phase 07: process/features/pact/active/pact-mvp_08-09-26/phase-07-integrated-deployment-demo_PLAN_08-09-26.md
- Blast-radius registry: process/features/pact/active/pact-mvp_08-09-26/phase-blast-radius-registry.md

The phase-program folder is the source of truth for execution. This file is a Superpowers entrypoint so an executor can discover the umbrella and direct phase plans from the default docs/superpowers/plans location.

