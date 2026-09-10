# HYBRID GATE PACK — Phase 03 Task 5B (requires explicit user approval)

Status: PREPARED 2026-09-09 · NOT APPROVED · NOT EXECUTED.
R-E supplement: ✅ VERIFIED (readiness semantics below depend on it).
Any deviation from this pack without a new approval voids the lane.

## 1. Purpose and boundary

Prove exactly one Sepolia `CreditGranted` event through `PactCreditASC.execute`
on Advance Testnet (chain 102031) and record exactly one redacted manifest.
The lane may: read public endpoints, fund disposable wallets via public faucets,
deploy `PactCreditSource` on Sepolia, emit one `recordCredit`, build one proof,
submit one `execute`, read back state, write the manifest. The lane may NOT:
touch mainnet, reuse keys afterwards, persist secrets, modify any approved
artifact beyond the manifest, or run a second live proof.

## 2. Prerequisites (all must hold before step 0)

- R-E ✅ VERIFIED (it is — 2026-09-09).
- Phase 03 Tasks 1–4 + 5A green on the lane machine (`forge test`, worker suite).
- Rehearsal script `scripts/asc/rehearse-credit-evidence.mjs` does NOT exist yet:
  writing it per plan 5.1–5.2 (env-name dry-run first) is lane step 1, local-only.
- Operator confirms three fresh disposable EOAs exist with no prior history.

## 3. Chain identity split (read first — the two chains are never interchangeable)

1. Advance/CC3 TARGET chain — deployment, target provider, deployment guard, and
   target-chain allowlist:
   - chain ID: **102031**
   - RPC: `https://rpc.cc3-testnet.creditcoin.network`
   - explorer: `https://creditcoin-testnet.blockscout.com/`
   - Proof builder: `https://prover.cc3-testnet.creditcoin.network`
   - All four values documented 2026-09-09; liveness unprobed until the lane.
2. Sepolia SOURCE chain — event emission and proof origin only:
   - chain ID: **11155111**
   - RPC: operator-provided public endpoint (record which one in the manifest)
   - Used ONLY to match the supported source-chain entry returned by
     `getSupportedChains()` (§4). Nothing is ever deployed to Sepolia except the
     disposable `PactCreditSource` for this lane.
3. Source chainKey — resolved, never hardcoded:
   - Resolved from `getSupportedChains()` on the Advance/CC3 target (§4).
   - Abort on zero matches or multiple matches.
   - No candidate values are listed or implied anywhere in this pack.

`11155111` is a source-chain identifier only. It is never the Advance/CC3 target
chain, never a deployment target, and never an allowlist member for target reads.
`102031` is never used to resolve or match a source chainKey.

## 4. ChainKey resolution procedure (read-only, no mutation)

Sepolia's ASC chainKey is UNKNOWN. Resolve first against the SOURCE chain ID only:

```bash
node -e "import('@gluwa/usc-sdk').then(async (s) => {
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.CREDITCOIN_RPC_URL);
  const info = new s.chainInfo.PrecompileChainInfoProvider(provider);
  const chains = await info.getSupportedChains();
  console.log(JSON.stringify(chains.filter((c) => c.chainId === 11155111)));
})"
```

Record the single matching `chainKey`. Abort the lane if zero or multiple match.
The submitted chainKey must equal the registered one; both go in the manifest.

## 5. Verifier / decoder / denomination evidence to record

- Verifier: `0xFD2` constant per pinned `asc-contracts@0.2.1`
  (`NativeQueryVerifierLib`); no bytecode expected — record the constant + package
  version, never a bytecode probe.
- Decoder: compile-time (zero external functions, grep-verified); record package
  version + foundry lock entry. The example `0x04B9…` address is forbidden.
- tCTC denomination: assumed 18 (EVM-native standard) until the manifest records
  a canonical source; manifest must state the assumption explicitly if unconfirmed.

## 6. Liveness / faucet evidence (read-only until funded)

- Sepolia: public faucet path of operator's choice (Google faucet referenced in
  official tutorial); record faucet used + funding tx hash.
- Advance: the 10,000 tCTC wallet is funder-only — it funds the three burner
  addresses manually through MetaMask. Its key is never requested, injected, or
  brought near this session. Thirdweb/Discord faucets are fallback paths; record
  whichever path is used.
- Funding order: operator first shares the three burner ADDRESSES, funds them
  (SepoliaETH for deployer, tCTC/gas for relayer as needed), then the lane reads
  back all balances on both chains before any submission; abort if any funding is
  missing (bounded blocker, not a retry loop).

## 7. Disposable wallets (operator-generated, env transport only)

The operator generates three fresh EOAs locally (`cast wallet new`): source
operator, ASC relayer, agent beneficiary. The operator shares only the three
ADDRESSES (for §6 funding) and injects the two required private keys
(`ASC_RELAYER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`) directly into the lane shell
env. Keys are never requested in chat, never printed, never persisted, never
touch disk/repo/logs. Post-lane: state destruction of key material and a
rotation statement (these keys must never be reused) in the manifest.

Operator shell setup (values by operator only; paste nothing secret into chat —
type these directly in the lane shell):

```bash
export CREDITCOIN_RPC_URL="<advance-rpc-102031>"
export SOURCE_CHAIN_RPC_URL="<sepolia-rpc-11155111>"
export PROOF_BUILDER_URL="<confirmed-builder-url>"
export AGENT_WALLET_ADDRESS="<fresh-agent-address>"
export RELAYER_WALLET_ADDRESS="<fresh-relayer-address>"
export DEPLOYER_WALLET_ADDRESS="<fresh-deployer-address>"
export ASC_RELAYER_PRIVATE_KEY="<fresh-relayer-key>"
export DEPLOYER_PRIVATE_KEY="<fresh-deployer-key>"
# Derived/output later in-lane (never preset): SOURCE_CHAIN_KEY,
# SOURCE_CREDIT_SOURCE_ADDRESS, PACT_CREDIT_ASC_ADDRESS.
node scripts/asc/print-proof-input.mjs  # presence check; derived/output names report missing until produced
```

## 8. Environment variables — classified input contract (corrected)

| Variable | Class | Notes |
|---|---|---|
| `CREDITCOIN_RPC_URL` | operator public input | Advance/CC3 target RPC (chain 102031). Value supplied by operator. |
| `SOURCE_CHAIN_RPC_URL` | operator public input | Sepolia source RPC (chain 11155111). Value supplied by operator. |
| `PROOF_BUILDER_URL` | operator public input — MISSING | Authoritative source: operator-confirmed builder endpoint (documented default `https://prover.cc3-testnet.creditcoin.network`, liveness unprobed). Never invented. |
| `AGENT_WALLET_ADDRESS` | operator public input | Fresh burner address (beneficiary). Address only. |
| `RELAYER_WALLET_ADDRESS` | operator public input | Fresh burner address for funding + submission. Address only. |
| `DEPLOYER_WALLET_ADDRESS` | operator public input | Fresh burner address for source deploy. Address only. |
| `ASC_RELAYER_PRIVATE_KEY` | operator secret input | Fresh disposable burner. Injected directly into the lane shell env by the operator. Never printed, persisted, or requested in chat. |
| `DEPLOYER_PRIVATE_KEY` | operator secret input | Fresh disposable burner. Same handling as above. |
| `SOURCE_CHAIN_KEY` | DERIVED | Resolved in-lane via §4. Never required before resolution; never hardcoded. |
| `SOURCE_CREDIT_SOURCE_ADDRESS` | deployment output (or pre-existing public address) | Produced by the in-lane Sepolia deploy; if pre-existing, address only. Marked missing until produced. |
| `PACT_CREDIT_ASC_ADDRESS` | deployment output (or pre-existing public address) | Produced by the in-lane Advance deploy, loaded from the deployment manifest/broadcast record; if pre-existing, address only. |
| `FUNDER_PRIVATE_KEY` | NOT REQUIRED | The 10,000 tCTC wallet stays funder-only: it funds the three burner addresses manually through MetaMask. Its key is never requested, never injected, never near this session. |

Minimal operator-provided set to open the lane: the 6 public inputs above
(2 RPCs, 1 builder URL, 3 burner addresses) plus the 2 burner secrets injected
directly to env. Nothing else. Step-0 presence is enforced by
`scripts/asc/print-proof-input.mjs` (`checkStepZero`): the 8 operator inputs
block when missing; derived values and deployment outputs report as pending and
never block; `FUNDER_PRIVATE_KEY` is never consulted.

## 9. Local verified config (untracked, never committed)

The checked-in `config/networks/advance-testnet.json` stays placeholder
(`verified:false`). For the lane, the operator prepares an UNTRACKED copy
(recommended path outside the repo, e.g. `/tmp/pact-advance-verified.json`) with
confirmed values and `verified:true`, then:

```bash
node scripts/preflight-testnet.mjs --config /tmp/pact-advance-verified.json
```

Required result: exit 0. Any other exit aborts the lane before any chain contact
beyond the preflight's own `eth_chainId` read. Template shape (values by operator):

```json
{
  "protocol": "creditcoin-evm",
  "label": "advance-testnet",
  "rpcUrl": "<confirmed-https-rpc>",
  "chainId": 102031,
  "explorerUrl": "<confirmed-https-explorer>",
  "nativeAsset": { "id": "native-testnet-ctc", "evmAddress": "0x0000000000000000000000000000000000000000", "symbol": "CTC", "decimals": 18 },
  "asc": { "verifierPrecompile": "0x0000000000000000000000000000000000000FD2", "evmV1DecoderLibrary": "0x0000000000000000000000000000000000000000" },
  "verified": true
}
```

## 10. Exact lane sequence (placeholders in angle brackets, values only at runtime)

1. Write `scripts/asc/rehearse-credit-evidence.mjs` per plan 5.1–5.2; run its
   dry-run (env names only) — no provider contact.
2. Resolve chainKey (§4, source ID 11155111 only); confirm burner addresses
   shared; fund wallets (§6 manual MetaMask flow); record balances.
3. Preflight exit 0 (§9, target chain 102031). Abort otherwise.
4. Deploy `PactCreditSource` on Sepolia (chain 11155111); record address as
   `SOURCE_CREDIT_SOURCE_ADDRESS`.
5. `recordCredit(<evidenceId>, <agent>, <amount>, <expiry>)`; record source tx + block.
6. Worker proof build for the source tx (bounded waits; attestation cap 20 min, twice max).
7. Deploy `PactCreditASC` on Advance (chain 102031; constructor: controller
   address); owner calls `setAscAuthority(<deployed ASC>)` on the controller;
   `registerSourceCreditContract(<resolvedKey>, <source>)`.
8. Submit `execute(<CREDIT_GRANTED=0>, …)` on chain 102031; wait confirmations;
   read back `CreditVerified` + `controller.availableCredit`.
9. Write manifest per `config/asc/evidence-manifest.schema.json` (add submitted-vs-
   registered chainKey equality + denomination assumption state).
10. Cleanup (§11); secret scan + `git status` clean-of-secrets verification.

## 11. Expected outputs per step

Consensus-failure-free run: source receipt status 1 on chain 11155111; builder
`ProofResult.success`; `execute` receipt status 1 on chain 102031 with
`CreditVerified`; available credit equals credited amount (capped by owner cap);
manifest validates against the schema with `sourceChainKey` equal to the §4
resolved value (resolved against 11155111 only, never 102031) and target chain
102031; secret scan 0.

## 12. Rollback / cleanup

No on-chain rollback exists (disposable testnet state by design). Cleanup: spend or
return leftover tCTC/SepoliaETH where faucet terms allow; destroy key material;
record final balances + destruction statement. Any lane failure → bounded blocker
artifact per plan 5.5 (exact error, safe next action); local gates stay green; never
a mock-green manifest.

## 13. No-production-key evidence (checked before close)

Fresh key generation timestamps postdate this pack; `git status` shows no key material;
secret scan 0 findings; env-only transport attested by operator; no mainnet chain ID
(1, 10, 56, 137, 42161, …) appears in any lane command or manifest.

## 14. Hard-stop conditions

Preflight non-zero; chainKey unresolved/multiple; builder unreachable twice;
faucet unfunded; attestation stall beyond cap twice; any mainnet ID anywhere;
any secret-shaped value near the repo; any step outside §§1–13 without new approval;
`availableCredit` mismatch after confirmed receipt (treat as investigation hold,
not retry).

## 15. Approval block (user completes to open the lane)

- Approved by: ______________ Date (UTC): __________ Scope confirmed (§§1–13): yes/no
- Chain split confirmed (target 102031 vs source 11155111, §3): yes/no
- chainKey resolved from `getSupportedChains()` against 11155111 (value recorded, never hardcoded): _____ / abort recorded: yes/no
- Input contract confirmed (§8): 6 public inputs set / 2 burner secrets env-injected by operator / funder key never requested: yes/no
- Burner addresses funded manually via MetaMask funder-only wallet: yes/no
- On approval, the lane runs under EXECUTE discipline with per-step output logging.
