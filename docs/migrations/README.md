# Pact v1 — Arc + Neon migration docs

Product identity: Pact v1 unchanged. No Pact v2. See the migration plan for scope.

| File | Purpose |
|---|---|
| `pact-v1-arc-neon-current-state-audit.md` | BƯỚC 1: architecture, capabilities, coupling inventories, risks, file lists |
| `pact-v1-arc-network-facts.md` | BƯỚC 2: Arc Testnet facts (official docs.arc.io), UNKNOWN/BLOCKER table |
| `pact-v1-neon-backend-facts.md` | BƯỚC 2: Neon backend facts (official neon.com), UNKNOWN/BLOCKER table |
| `pact-v1-arc-neon-migration-plan.md` | BƯỚC 3: Tracks A–D, dependency graph, rollback, no-go, definition of done |
| `pact-v1-arc-a1-deployment-foundation.md` | A1: Arc config + Osaka profile + dry-run boundary (config only, no live lane) |
| `pact-v1-arc-a2-read-only-preflight.md` | A2: live read-only preflight (chain 5042002 confirmed, fee floor holds, explorer canonical, faucet UNKNOWN) |
| `pact-v1-arc-a3-deployment-evidence.md` | A3: read-only deployment receipts, runtime state, addresses, and artifact reconciliation |
| `pact-v1-arc-a3-artifact-reconciliation.md` | A3 addendum: full artifact/receipt matrix, bytecode comparison, classification, and closeout |
| `pact-v1-arc-verified-credit-decision.md` | Verified-credit scope decision: IN SCOPE, DESIGN PENDING, LIVE EXECUTION NOT APPROVED |
| `pact-v1-arc-verified-credit-implementation-plan.md` | Arc-native verified-credit design, audit, test matrix, and live gates |
| `pact-v1-arc-verified-credit-operating-policy.md` | Verified-credit operating bounds: 0.1/0.01 USDC, 20-minute expiry, role separation |
| `pact-v1-arc-credit-live-preflight.md` | Read-only live preflight checklist stopping before every mutation |
| `pact-v1-arc-p0-verified-credit-live-preflight.md` | P0 evidence: GREEN (role separation + gas readiness verified; mutators not executed) |
| `pact-v1-arc-first-payment-evidence.md` | First allowed payment closeout: VERIFIED (receipt, events, deltas match; read-only) |
| `pact-v1-arc-rejected-payment-evidence.md` | Rejected payment closeout: VERIFIED (status 0, CreditExceeded, zero state mutation; read-only) |
| `pact-v1-arc-migration-closeout-index.md` | Arc migration closeout index: READY FOR GRANT/DEMO REVIEW (synthesis only; no mutation) |

## Current target status (BƯỚC 4.5)

**Arc migration closeout index: READY FOR GRANT/DEMO REVIEW
(`pact-v1-arc-migration-closeout-index.md`, documentation-only synthesis;
no live mutation in the index task).**
**P0 verified-credit live preflight: GREEN (historical; role separation +
gas readiness verified before live lanes).**
Prior live lanes (separate approvals, evidenced on-chain): `setAscAuthority`
executed, card 1 created + activated, bounded verified credit applied.
First allowed payment: VERIFIED (tx `0xd795f877…e9eb`, block 62952008,
receipt + `PaymentSettled`/`MerchantPaymentReceived` + exact state deltas;
read-only closeout 2026-09-19).
Rejected payment: VERIFIED (tx `0xde8ea691…db35`, block 62954597,
status 0, `CreditExceeded`/`OVER_TX_LIMIT`, zero state mutation;
read-only closeout 2026-09-19).**

## Current target status (BƯỚC 4.5)

**Verified-credit model: APPROVED IN PRINCIPLE.
Operating bounds: DEFINED.
Local validation: GREEN (see gates below).
Live authority provisioning: NOT APPROVED.
Card setup: BLOCKED.
Payment execution: BLOCKED.**

**Verified-credit Arc MVP: IN SCOPE, DESIGN PENDING, LIVE EXECUTION NOT APPROVED.**

**First controlled payment: PLAN CREATED, EXECUTION NOT APPROVED.**

- Target network: **Arc Testnet** (chain 5042002, USDC gas). Boundary:
  `packages/domain/src/networks.ts` (`arc-testnet` entry, `verified:false`;
  deployment path rejects unverified fail-closed).
- Target backend: **Neon** (Lakebase Postgres + Functions). Boundary:
  `supabase/functions/_shared/persistence-backend.ts` (default
  `supabase-postgrest`; `neon-*` reserved NOT_IMPLEMENTED). Skeleton: `neon/`.
- AI provider now: **pure OpenAI API**, server-side only. Boundary:
  `assertSupportedProviderId` in `provider-port.ts` (`openai` only;
  `neon-ai-gateway` rejected fail-closed). No gateway wiring, no gateway env refs.
- Creditcoin/ASC: **legacy / compatibility surface under evaluation**.
  Frozen files: `contracts/src/PactCreditASC.sol`, `PactCreditSource.sol`,
  `services/asc-proof-worker/`, `config/asc/`, `config/networks/advance-testnet.json`.
  No deletions, no behavior edits.
- Security invariants: unchanged (one-send, store-txHash-before-wait, receipt
  reconciliation, no second-submit, AI never edits policy, strict schema, fail closed).
- A1 status (2026-09-19): Arc config (`config/networks/arc-testnet.json`,
  `verified:false`), Osaka profile (`[profile.arc]`, build + 101 tests green),
  dry-run (`yarn dry-run:arc`, exit 3 fail-closed). No live lane run.
- A2 status (2026-09-19): READ-ONLY PREFLIGHT GREEN — chain 5042002 live-confirmed,
  blocks advancing sub-second, fee floor 20 Gwei holds, explorer canonical
  `explorer.testnet.arc.io` (config updated), faucet reachable but flow UNKNOWN,
  `verified` stays `false`, zero mutations.
- A3 status (2026-09-19): CLOSED for deployment identity/runtime evidence —
  historical broadcast artifact `transactions` metadata has an additive
  `ARTIFACT_LABELING_MISMATCH`; receipts, bytecode, source verification, and
  manifest are reconciled. The canonical network config remains `verified:false`
  for the broader live-lane authorization boundary.
