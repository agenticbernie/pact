---
name: context:browser-automation
description: Pact Playwright navigation, local browser fixtures, and demo-path automation checks.
keywords: playwright, browser, automation, e2e, navigation, fixture, demo, network
related: [context:all-tests, context:browser-tests]
date: 09-09-26
---

# Browser Automation

## Scope

This is the Playwright-specific route for local browser automation. Read
`browser-tests.md` first for product assertions, then use this file for server
startup, fixtures, navigation, and trace/evidence handling.

## Planned Surface

- `playwright.config.ts`;
- `e2e/fixtures/local-runtime.ts`;
- `e2e/allowed-payment.spec.ts`;
- `e2e/blocked-payment.spec.ts`;
- `e2e/network-guard.spec.ts`;
- `e2e/receipt-truth.spec.ts`.

These files are not present at setup time.

## Planned Flow

1. Start the local stack with deterministic fixture data.
2. Open the web app at a narrow and desktop viewport.
3. Verify testnet disclosure, setup, allowed payment, receipt truth, blocked
   payment, and suspend/retry behavior.
4. Save traces/screenshots only after redaction checks; stop the local stack.

The automated lane may fake provider/chain responses through test fixtures, but
it must preserve the same response shapes and state transitions as production.

## Update Triggers

Refresh when Playwright config, fixture setup, required routes, viewport matrix,
or artifact redaction rules change.
