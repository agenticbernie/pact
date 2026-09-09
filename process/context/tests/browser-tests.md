---
name: context:browser-tests
description: Pact React UI, wallet state, accessibility, responsive layout, and receipt-state verification.
keywords: browser, ui, ux, react, vite, wallet, accessibility, responsive, playwright, receipt
related: [context:all-tests]
date: 09-09-26
---

# Browser and UI Tests

## Scope

This document covers the Pact web control room: wallet/network setup, virtual
card state, verified-credit panel, agent prompt flow, policy timeline, blocked
states, suspend/resume actions, truthful receipts, responsive layout, and
keyboard/accessibility behavior.

## Planned Source Surface

- `apps/web/src/` for React routes, state, API adapters, wallet integration,
  and UI components;
- `apps/web/test/` and colocated `*.test.tsx` files for Vitest and Testing
  Library coverage;
- `test/accessibility.test.tsx` and `test/formatters.test.ts` for shared UI
  assertions;
- `e2e/` and `playwright.config.ts` for local full-flow browser checks.

No web source or browser test file exists at setup time.

## Planned Commands

    yarn vitest run apps/web/test apps/web/src
    yarn build:web
    yarn test:e2e

Use fixtures only inside automated tests. The product UI must call the real
local API/chain surfaces when run as an integrated demo.

## Required Assertions

- The testnet/no-fiat disclosure is visible before setup and payment.
- Wrong-chain and disconnected-wallet states prevent owner actions.
- Card, credit evidence, policy checks, and agent identity are readable without
  exposing a raw editable payout address or secret.
- Allowed prompts show canonical intent and policy checks before execution;
  over-limit, unallowlisted, suspended, malformed, and provider-error paths do
  not open an owner signature popup or claim settlement.
- Pending, failed, uncertain, and settled receipts are distinct; settled
  requires both receipt and indexed-event signals.
- The 320px viewport has no horizontal overflow, keyboard focus is visible, and
  reduced-motion behavior is respected.

## Update Triggers

Refresh this file when routes, UI test runner, wallet provider, accessibility
tool, receipt state machine, or browser command changes.
