# H2 Arc Owner≠Agent Scoping Supplement + PVL (2026-09-19) — PLAN ONLY

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: H2 read-only preflight only.
Status: DESIGN ONLY. Authorizes no seed, deployment, OpenAI/RPC call,
transaction, signer use, commit, or push. Implementation follows strictly
via TDD (Step 4 of the task) against this design; any deviation is recorded,
never silent. H1/G9, H3, G22, contracts, Arc evidence, and CTC legacy are
out of scope and preserved.

Approved decision consumed as given: in the Arc lane, `owner != agent` is
allowed for H2 because Arc card 1 has a deployer-owner and a burner-agent.
Role separation and payment authority must survive the relaxation.

## 1. Current mismatch (audit)

`handleReadOnlyPreflight` (`supabase/functions/agent-executor/index.ts`)
enforces single-wallet identity at three sites:

- `:350-351` intent lookup passes `ownerAddress = sessionWallet` AND
  `agentId = sessionWallet` → requires `intent.agent == sessionWallet` and
  (via the `cards!inner` owner relation in `intent-store.ts:142-158`)
  `card.owner == sessionWallet`.
- `:362` card lookup passes `ownerAddress = sessionWallet` (+
  `agentId = intent.agentId`) → requires `card.owner == sessionWallet`
  and `card.agent == intent.agent`.
- Combined: `sessionWallet == card.owner == intent.agent == card.agent`.

Session wallet itself is sound: `requireSession` (HMAC wallet-bound,
`_shared/session-token.ts:30`) + persisted `findSession` (`index.ts:267,274`)
run before any protected work — auth-before-work is preserved and not
redesigned here. Controller verification (`eth_chainId` + static
`preflightPay`/`readCard`, `chain-client.ts`) stays authoritative for the
decision and is not bypassed. There is NO owner-authorization source today;
the single-wallet assumption is implicit. The widening point is between
intent fetch and the card/lane checks: resolve and validate an explicit
owner authorization there, then proceed to the unchanged chain read.

## 2. Supplement design (10 approved rules)

1. Owner and agent are distinct roles. The Arc lane binds card 1 to owner
   (deployer) and agent (burner) as recorded at the card's creation event.
2. The agent must equal `card.agent` on-chain (static `readCard` projection).
3. The session wallet must equal the agent (`requireSession` + persisted
   session, unchanged).
4. The owner is validated through an explicit `OwnerAuthorization` bound to
   the card's recorded owner AND its creation provenance
   (`sourceBlock`/`sourceTxHash` equal the card row's), the lane
   (chain/asset/controller), the card (`cardId`), the agent, the policy
   version, and the allowlist hash. Session presence is NEVER owner
   authorization.
5. Controller, card ID, chain ID, asset, and policy bind one Arc lane
   (existing lane checks, unchanged, plus authorization-lane match).
6. Card state is re-checked read-only before the decision (existing static
   read + preflight, unchanged and still required).
7. The agent cannot self-grant: an authorization with `issuedBy == agent`
   (or `issuedBy != owner`) is rejected, as is any authorization whose
   owner disagrees with the card row.
8. No payment authority beyond the deployed controller: the authorization
   carries no amount, recipient, nonce, or deadline and cannot widen the
   static-call surface.
9. Every mismatch fails closed to the existing codes (`CARD_NOT_ELIGIBLE`
   for binding failures, `PREFLIGHT_DECLINED` for missing records/outcome).
   No new API code is introduced.
10. `owner == agent` remains valid (single-operator disposable lane) but is
    no longer a hard requirement for Arc H2. Legacy CTC lane keeps the old
    exact behavior: no authorization consulted, single-wallet enforced.

## 3. OwnerAuthorization schema

```ts
type OwnerAuthorization = {
  ownerAddress: string;   // EVM 0x, must equal card.owner (row) 
  agentId: string;        // EVM 0x, must equal intent.agent == sessionWallet
  cardId: string;         // must equal intent/card
  chainId: number;        // must equal lane chain (5042002)
  asset: string;          // must equal lane asset (arc-testnet-usdc)
  controller: string;     // EVM 0x, must equal lane controller
  issuedBy: string;       // EVM 0x, must equal ownerAddress, never agentId
  policyVersion: number;  // must equal card/intent policy
  allowlistHash: string;  // 0x bytes32, must equal card row
  sourceBlock: number;    // must equal card row (creation event anchor)
  sourceTxHash: string;   // 0x64hex, must equal card row
  expiresAtMs: number;    // must be future at decision time
};
```

Validation order (first failure wins, fail-closed):
format → expiry → agent/session binding → owner/row agreement →
lane (chain/asset/controller/card) match → provenance (block/tx) match →
policy/allowlist match → issuedBy rule. Missing registry entry behaves as
"no authorization" (decline), never as approval.

Trust anchor (non-synthetic): the entry reproduces the card's on-chain
creation facts (owner/agent/block/tx as recorded in Arc evidence) and is
cross-checked against the seeded card row AND the lane constants at every
read. It cannot be transplanted (block/tx/card/chain mismatch fails) and
cannot be self-issued (issuedBy rule). Operator approval of the registry
content is recorded in deployment evidence, same trust class as the
controller address constant.

## 4. Injectable seam

```ts
type OwnerAuthorizationRegistry = {
  findAuthorization(input: {
    ownerAddress: string; agentId: string; cardId: string; chainId: number;
  }): Promise<OwnerAuthorization | null>;
};
```

`ReadOnlyComposition` gains optional `ownerAuthorizations`. Absent registry
in the Arc lane = fail closed for split roles (single-wallet still passes).
Legacy lane never consults the registry. Default lane registry for Arc card 1
is constructed from §6 facts; tests inject variants (missing/wrong/expired/
self-issued). No new DB table, no migration: the registry is lane
configuration with per-request cross-checks, not a credential store.

## 5. PVL (per-decision validation record) schema

Built by a pure `buildH2ValidationRecord(...)` alongside the decision and
stripped before the HTTP response (envelope unchanged:
`requestId/intentId/decision/reasonCode?/chainId/checkedAt`):

```ts
type H2ValidationRecord = {
  principal: string;        // session wallet (agent)
  owner: string;            // card owner (row)
  agent: string;            // intent/card agent
  sessionWallet: string;
  cardId: string;
  controller: string;       // lane controller
  chainId: number;
  asset: string;
  ownerAuthorization:       // provenance, never secrets
    | { mode: "single-wallet" }
    | { mode: "authorized"; issuedBy: string; sourceBlock: number; sourceTxHash: string; expiresAtMs: number };
  policyVersion: number;
  allowlistHash: string;
  decision: "would_settle" | "declined";
  reasonCode?: string;
  evaluatedAt: string;      // UTC ISO
  intentExpiresAt: string;
  sourceBlock: number;
  sourceTxHash: string;
  intentHash: string;       // persisted intent hash (protocol record)
};
```

PVL field rule: every value is either lane constant, persisted-row fact, or
chain-read fact — no synthetic approvals, no session-presence-as-authority.

## 6. Arc card-1 registry facts (provenance)

Owner (deployer) `0xb8bd…0c14d52`, agent (burner) `0xdc26…d631682`,
card `1`, controller `0x7a47…fc423`, chain `5042002`, creation block
`62948913` / tx `0x5bb8…79fb` (closeout §8). Registry default reproduces
exactly these; any drift between registry, row, and lane fails closed.

## 7. Acceptance (local)

Positive: split-role + valid authorization → pass; session==agent → pass;
lane binding → pass; active/allowlisted card → pass; supplement+PVL →
usable decision (PVL complete, HTTP envelope unchanged). Negative: missing/
wrong/expired/self-issued authorization, session≠agent, agent≠card-agent,
controller/chain/asset/policy/allowlist/block/tx mismatch, CTC-lane read of
Arc rows → fail closed with existing codes. Regression: legacy CTC
single-wallet byte-identical; card-7 fixtures kept; H1 behavior unchanged;
H3/G22 untouched.

## 8. Files to change / preserve

Change (additive): new `_shared/owner-authorization.ts` (types, registry,
pure validator, PVL builder), `agent-executor/index.ts` (seam threading +
branch, PVL strip), new `test/h2-owner-scoping.vitest.test.ts`, decision
report update. Preserve: contracts, migrations, Arc evidence, CTC legacy
behavior/tests, H1 gateway, 15-code surface, `allowFallback:false`,
read-only transport, H3/G22.

## 9. Design amendment — intent-keyed authorization lookup (pre-implementation)

The §4 seam keyed lookup by `(ownerAddress, agentId, cardId, chainId)`,
but H2 knows only `intentId` before any read (server-bound design: no
client card/owner authority). Resolving the owner first is impossible
without an owner-scoped read — chicken-and-egg. Amended flow (G32 methods
byte-identical, no new store method):

1. Single-wallet attempt first: `getById(intentId, owner=session,
   agent=session)` → hit → mode `single-wallet` (legacy-compatible).
2. On miss, Arc lane with registry: `findAuthorization({intentId,
   agentId=sessionWallet, chainId})` — agent-scoped, owner unknown yet.
   Null → decline `PREFLIGHT_DECLINED`.
3. Re-read with the AUTHORIZED owner:
   `getById(intentId, owner=auth.ownerAddress, agent=sessionWallet)` —
   still a G32-shaped owner+agent scoped read (predicate carries the
   authorized owner, verified post-read). Null → decline.
4. Full §3 validation (owner/row agreement, lane, provenance, policy,
   allowlist, issuedBy, expiry) → chain read → static preflight → decision.

The registry entry therefore carries `intentId` alongside §3 fields; the
trust anchor is unchanged (creation-event facts cross-checked against the
seeded row and lane constants). Legacy lane never reaches step 2.
