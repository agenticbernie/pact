# Release notes — card issuance and settlement panel

**Date:** 2026-10-09
**Branch:** `dev-createcard` (base `origin/dev` @ `88744f8`)
**Commits:** `536c6be` (card issuance flow + payment panel), `8e60a72` (type fixes)

## Summary

The console can now issue and activate a Pact spending card for an agent, and review
and submit a settlement from the card detail view. Every policy rule is evaluated
client-side as a pure function before a wallet is asked to sign; the chain and the
indexed read model remain the source of truth.

## Added

- **Issue a card** — `apps/web/src/pages/CreateCardPage.tsx`, route `/cards/new`, plus
  nav wiring (`AppNav.tsx`, `App.tsx`, `DashboardPage.tsx`). Validates the agent
  address (EIP-55 checksum), spending cap, per-transaction limit (≤ cap), a future
  expiry, and a catalog-only merchant allowlist *before* any wallet prompt; then runs
  `createCard` → `activateCard`, reports each step, and re-checks the read model for
  indexing.
- **Card policy core** — `apps/web/src/lib/card-policy.ts`: pure validation for the
  issuance draft and the settlement eligibility summary, with
  `card-policy.test.ts` (21 tests).
- **Controller ABI fragments + drift guard** — `apps/web/src/lib/controller-abi.ts` and
  `controller-abi.test.ts` (4 tests): every transcribed fragment must derive the same
  selector/topic hash as the generated SDK ABI.
- **Chain helpers** — `apps/web/src/lib/chain.ts`: injected-wallet connect, controller
  bytecode check, `createCard`/`activateCard`, on-chain card read, and preflight.
- **Settlement panel** — `apps/web/src/components/PaymentPanel.tsx` on the card detail
  view: mandatory policy summary plus intent submission (`api/write.ts`).
- **Read/write API types** — `apps/web/src/api/types.ts`, `apps/web/src/api/write.ts`.

## Fixed

- `8e60a72` — the expiry `DateTimeInput` now passes Astryx's branded
  `ISODateTimeString` instead of a plain `string`.
- `8e60a72` — the ABI test narrows ethers `Fragment` with
  `instanceof FunctionFragment` / `EventFragment` (the base `Fragment` has no
  `selector`/`topicHash`).

## Verification

- `yarn workspace @pact/web tsc --noEmit` — clean (run in the `web` compose service).
- `yarn workspace @pact/web test` — 41/41 pass (format 7, card-policy 21,
  controller-abi 4, status 9).
- Preview at `/cards/new` with an owner session: the form renders (no connect gate);
  an empty submit raises all five field errors; a malformed agent address shows the
  address-format message and clears the "missing" one; no console errors after the
  edits.

## Not verified automatically

- **Valid-form submit → wallet-step transition.** The preview tab carries no injected
  wallet, so the flow cannot reach a signed `createCard`/`activateCard`. Driving the
  expiry `DateTimeInput` through the preview harness hangs, so the end-to-end submit
  path was not exercised here. Verify with a browser wallet on Arc testnet.
- **On-chain issuance and settlement** (owner signs the card transactions; the agent
  lane settles) are outside what the preview browser can exercise.

## Known limitations / notes

- **Preview has no wallet extension:** the console's connect gate cannot sign inside the
  sandbox preview, so an owner session must be supplied out of band to view the
  authenticated screens.
- **Workspace integration credits are exhausted** (a billing limit, not a code defect):
  `POST /v1/agent/intents` returns `PROVIDER_UNAVAILABLE` until credits reset
  (2026-11-01 UTC) or the plan is upgraded.

## Upgrade and rollback

See `docs/runbook/console-deploy-rollback.md`.
