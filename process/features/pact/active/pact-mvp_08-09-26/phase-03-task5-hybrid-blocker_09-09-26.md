# Bounded Blocker — Phase 03 Task 5B Hybrid Lane (NOT executed)

Date: 2026-09-09 · Lane: APPROVED (sign-off recorded) · Live actions taken: ZERO.
Input contract: CORRECTED (see below) — the original 10-name demand is superseded.
This artifact exists because plan 5.5 requires an honest blocker instead of a
mock-green manifest when the lane cannot run. No verified credit was created,
no transaction was sent, no endpoint was contacted.

## Corrected missing set (input contract remediation, same date)

The original demand listed 10 names including a funder key. Corrected classification:

- Still missing (operator public inputs): `CREDITCOIN_RPC_URL` (102031),
  `SOURCE_CHAIN_RPC_URL` (11155111), `PROOF_BUILDER_URL` (authoritative source:
  operator-confirmed endpoint), `AGENT/RELAYER/DEPLOYER_WALLET_ADDRESS` (fresh
  burner addresses for manual MetaMask funding).
- Still missing (operator secrets, env-only, never chat): `ASC_RELAYER_PRIVATE_KEY`,
  `DEPLOYER_PRIVATE_KEY` (fresh disposable burners).
- No longer required: `FUNDER_PRIVATE_KEY` (funder stays funder-only via MetaMask),
  `SOURCE_CHAIN_KEY` (derived in-lane), `SOURCE_CREDIT_SOURCE_ADDRESS` and
  `PACT_CREDIT_ASC_ADDRESS` (deployment outputs).
- Lane resumes at pack §4 on supply; nothing to reconcile.

## Exact error

Missing operator-provided lane environment. All 10 required names absent from
both the process environment and any local env file (only `.env.example`
with empty values exists, as designed):

- `SOURCE_CHAIN_RPC_URL`, `SOURCE_CHAIN_KEY`, `SOURCE_CREDIT_SOURCE_ADDRESS`
- `PROOF_BUILDER_URL`, `CREDITCOIN_RPC_URL`, `PACT_CREDIT_ASC_ADDRESS`
- `ASC_RELAYER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `AGENT_WALLET_ADDRESS`
- Funder key for the 10,000 tCTC funder-only wallet (name per operator convention)

Without endpoints, chainKey material, disposable keys, and the funder key,
not even lane step 1 (read-only chainKey resolution) can run — there is no
provider to query and no wallet to fund. Faking any of these values would
violate the lane's hard stops.

## Safe next action

Operator supplies the 10 values via process env (never files in the repo),
then re-invokes the lane. The lane resumes at pack §4 (chainKey resolution);
no prior live state exists to reconcile. To abort the lane entirely instead,
delete this artifact's successors: none exist — nothing was created.

## Local gates (still green, unaffected)

Phase 03 Tasks 1–4 + 5A outputs stand as verified: Forge 101/101, worker
suites green, preflight fail-closed, secret scan clean. This blocker changes
no code, no config, and no prior evidence.

## Lane attempts (append-only; newest last)

- Attempt 1 (2026-09-09, approved lane, corrected contract): Step-0 staged gate
  (`print-proof-input.mjs`, exit 2) reports 8/8 operator inputs missing in the
  lane shell — 6 public + 2 secrets, all absent. Stopped before any provider
  contact per hard stops. Live actions taken: ZERO. Awaiting the 8 values
  (6 public in any channel, 2 burner secrets via env only).
- Attempt 2 (retry, env expected ready): Step-0 gate still reports 8/8 missing.
  The retry shell inherits only the base environment — no operator values are
  visible here (no env file present; only `.env.example` exists). Stopped before
  any provider contact. Live actions taken: ZERO. Remedy: export the 8 names in
  a shell this session inherits (6 public values may also be pasted; 2 burner
  secrets via env only, never chat), then re-invoke.
- Attempt 3 (2026-09-10, env supplied; prep + live lane EXECUTED, superseded by manifest):
  Step-0 8/8 set; chainKey 1 resolved via `getSupportedChains()` against 11155111
  only; 102031-only rehearsal guard fixed RED→GREEN; untracked verified config
  preflight exit 0 (102031); Sepolia deployer funding 0.05 ETH + Advance
  deployer/relayer funding verified read-only; single-proof lane executed
  (source deploy + recordCredit block 11672872 → proof chainKey 1 header match →
  Advance wiring + execute block 5461852 → CreditVerified + availableCredit 1e18);
  manifest `config/deployments/asc-evidence-rehearsal.json` schema-valid; EVL PASS
  read-only (no builder re-query, no broadcast in EVL). Live actions: exactly one
  proof; no second proof. UNKNOWNs preserved: tCTC 18-decimal denomination
  assumed; post-lane builder liveness unknown; no exhaustive chain-wide mutation
  audit; faucet/explorer/triangle/key-destruction items operator-attested.
  Denomination and key destruction NOT claimed as independently verified. This
  blocker remains as append-only history; the manifest is the execution record.
