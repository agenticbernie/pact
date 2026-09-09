# Pact MVP Spec + AICD Architecture Design

**Date:** 2026-09-08
**Status:** Draft for user review
**Project:** Pact
**Target environment:** Creditcoin EVM-compatible testnet, referred to in the project as **Advance Testnet**
**Primary ecosystem protocol:** Attestcoin Protocol / Attestcoin Smart Contracts (ASC)
**Decision gate:** Product and architecture design approved before implementation planning

> This document defines the Pact MVP and its Architecture-in-Code Definition (AICD). It deliberately does not contain an implementation task list. The implementation plan starts only after this document is reviewed and approved.

## Summary

Pact gives an AI Agent a programmable virtual spending card. A person configures the card once: who the agent is, how much it may spend, which merchants it may use, which asset it may spend, and when the card expires. The agent can then understand a natural-language request, turn it into a structured payment intent, and settle a real testnet payment without asking the person to sign every transaction. Smart contracts—not the AI model, database, or UI—enforce the spending policy.

The MVP runs its payment and policy authority on the Creditcoin EVM-compatible testnet, uses the Attestcoin Protocol to verify a testnet credit-evidence event from a source chain, and shows a verifiable transaction receipt. The card is a testnet virtual-card experience only: it is not a Visa/Mastercard card, has no fiat value, and does not process real-world card payments.

## User Stories / Jobs To Be Done

1. **As a card owner,** I want to create a virtual card for an AI Agent with explicit limits, so that the agent can spend autonomously without receiving unrestricted access to my wallet.

2. **As a card owner,** I want to restrict the card to approved merchants and one settlement asset, so that an unexpected prompt or compromised agent cannot redirect funds to an arbitrary destination.

3. **As an AI Agent,** I want to convert a natural-language request into a structured payment intent, so that I can perform a payment without guessing contract addresses or bypassing card policy.

4. **As a card owner,** I want a verified credit-evidence event to establish the agent's available credit, so that the spending capacity has a cryptographically verifiable source instead of being a value stored only in a database.

5. **As a card owner,** I want every successful payment to produce an on-chain receipt, so that I can independently verify what was paid, to whom, and when.

6. **As a card owner,** I want invalid or excessive payments to fail clearly, so that I can understand why the agent was blocked and confirm that no funds moved.

7. **As a hackathon judge,** I want to see one live end-to-end success and one live guardrail failure, so that Pact's value is demonstrated through real testnet state rather than a simulated success screen.

## What The User Wants (Behavioral Outcomes)

### Card setup

- The owner connects a wallet on the configured Advance Testnet.
- The owner creates or opens a Pact virtual card.
- The owner assigns one agent wallet and configures a total cap, per-transaction cap, allowlisted merchants, asset, and expiry.
- The interface clearly labels the card as testnet-only.
- The owner can activate, suspend, resume, or close the card.

### Credit evidence

- A testnet source contract records a credit-evidence event.
- A proof worker obtains the proof data for that event.
- The Pact ASC verifies the source transaction and emitter on Creditcoin.
- A successfully verified evidence record updates the card's verified credit.
- An invalid emitter, invalid receipt, replayed evidence, or unsupported action cannot update the card.

### Autonomous payment

- The owner or judge enters a plain-language request.
- Pact displays the amount, merchant, asset, purpose, and confidence extracted by the AI provider.
- Pact performs a read-only preflight check for fast feedback.
- The agent signer submits a payment only when the intent is structurally valid and the card is eligible.
- The card controller checks the policy again on-chain.
- The pool transfers the configured testnet asset to the registered merchant atomically.
- The interface reports success only after a confirmed receipt and exposes an explorer link.

### Rejection and recovery

- A request above the card's available credit, above its per-transaction cap, to an unapproved merchant, after expiry, or while suspended is rejected.
- An AI provider failure or malformed output stops the flow before any contract call.
- A card owner can suspend the card from the UI.
- A duplicate nonce cannot settle twice.
- A failed or reverted transaction does not reduce available credit or increase merchant balance.

## Flow / State Diagram

### End-to-end happy path

~~~text
Owner wallet
    |
    v
Create card + policy ----------------------------------+
    |                                                   |
    v                                                   |
Source-chain credit event                               |
    |                                                   |
    v                                                   |
Proof worker -> Pact ASC verifies evidence              |
    |                                                   |
    v                                                   |
Verified credit available                               |
    |                                                   |
    v                                                   |
Natural-language request                                |
    |                                                   |
    v                                                   |
AI structured intent -> schema validation                |
    |                                                   |
    +--> invalid/provider error: stop, no contract call  |
    |                                                   |
    v                                                   |
Off-chain preflight                                     |
    |                                                   |
    +--> rejected: explain reason, no token transfer     |
    |                                                   |
    v                                                   |
Agent signer -> PactCardController                      |
                         |                              |
                         v                              |
              PactCreditPool -> MerchantSimulator       |
                         |                              |
                         v                              |
              PaymentSettled event -> indexer -> UI     |
~~~

### Card lifecycle

~~~text
ISSUED -> ACTIVE -> SUSPENDED -> ACTIVE
   |        |           |
   |        +-----------+----> CLOSED
   +--------------------------> CLOSED
ACTIVE -----------------------> EXPIRED (time-derived)
~~~

CLOSED is terminal. EXPIRED is terminal for spending; the implementation may represent it as a derived state from expiresAt rather than a separate storage transition.

### Payment lifecycle

~~~text
INTENT_CREATED -> PREFLIGHT_APPROVED -> SUBMITTING -> SETTLED
       |                  |                |
       +-> DECLINED       +-> DECLINED     +-> FAILED
~~~

PREFLIGHT_APPROVED is not financial authority. The contract's result is authoritative.

## Acceptance Criteria (Testable Outcomes)

Each criterion is mapped to a named scenario and an execution strategy. Live-testnet scenarios use disposable testnet wallets and are not production financial tests.

### Product and wallet behavior

**AC-01 — Network safety**
The application refuses card setup and payment execution when the connected wallet is not on the configured Advance/Creditcoin EVM testnet.

- **proven by:** SC-NETWORK-001 wrong-chain guard
- **strategy:** Hybrid

**AC-02 — Card creation**
A connected owner can create and activate one Pact virtual card with an assigned agent, configured limits, an allowlist, an asset, and an expiry, and the resulting state is readable from the target chain.

- **proven by:** SC-CARD-001 create-and-activate-card
- **strategy:** Hybrid

**AC-03 — Emergency suspension**
After the owner suspends a card, a payment request from its assigned agent is rejected and no settlement occurs.

- **proven by:** SC-CARD-002 suspend-blocks-payment
- **strategy:** Fully-Automated

### Credit evidence and Attestcoin

**AC-04 — Verified evidence**
A credit-evidence event emitted by the registered source contract can be proven through the Attestcoin flow and updates the card's verified credit on Creditcoin.

- **proven by:** SC-ASC-001 valid-source-evidence
- **strategy:** Hybrid

**AC-05 — Source binding**
Evidence from an unregistered source emitter, a failed source transaction, an unsupported action, or a previously processed evidence ID is rejected.

- **proven by:** SC-ASC-002 emitter-and-replay-protection
- **strategy:** Fully-Automated

### AI and agent execution

**AC-06 — Structured intent**
A valid natural-language request produces an intent containing a known card, merchant ID, positive amount, configured asset, bounded purpose, confidence, provider, model, and expiry.

- **proven by:** SC-AI-001 valid-intent-schema
- **strategy:** Hybrid

**AC-07 — Malformed or unavailable AI**
Malformed model output, provider unavailability, unsupported region, or unavailable configured model produces a visible error and no blockchain transaction.

- **proven by:** SC-AI-002 fail-closed-provider-errors
- **strategy:** Fully-Automated

**AC-08 — Provider attribution**
Every stored and displayed intent identifies the actual provider and model used; the MVP never silently switches to another provider.

- **proven by:** SC-AI-003 provider-model-attribution
- **strategy:** Fully-Automated

### Payment policy and settlement

**AC-09 — Successful settlement**
An allowed intent results in one confirmed target-chain transaction that transfers the configured native testnet asset from the pool to the registered merchant, increments card spend, and emits a payment event containing the intent hash.

- **proven by:** SC-PAY-001 allowed-atomic-settlement
- **strategy:** Hybrid

**AC-10 — Policy enforcement**
The card controller rejects payments when the card is inactive, the caller is not the assigned agent, the merchant is not allowlisted, the asset is wrong, the amount exceeds the per-transaction limit, or available credit is insufficient.

- **proven by:** SC-PAY-002 policy-rejection-matrix
- **strategy:** Fully-Automated

**AC-11 — Expiry and deadline**
An expired card or expired payment deadline cannot settle, even if the off-chain preflight previously passed.

- **proven by:** SC-PAY-003 time-boundary-rejection
- **strategy:** Fully-Automated

**AC-12 — Replay prevention**
Reusing a card nonce or payment identifier cannot transfer funds a second time.

- **proven by:** SC-PAY-004 nonce-replay
- **strategy:** Fully-Automated

**AC-13 — Atomic failure**
If the merchant transfer fails, card spend, pool balance, and merchant balance remain unchanged.

- **proven by:** SC-PAY-005 revert-preserves-state
- **strategy:** Fully-Automated

### Receipts and UI

**AC-14 — Receipt truthfulness**
The UI displays Settled only after a confirmed receipt with a successful status and a matching indexed PaymentSettled event; otherwise it shows pending, declined, or failed.

- **proven by:** SC-INDEX-001 receipt-state-machine
- **strategy:** Hybrid

**AC-15 — Idempotent indexing**
Reprocessing the same transaction log does not create duplicate payment records or duplicate spend in the read model.

- **proven by:** SC-INDEX-002 event-idempotency
- **strategy:** Fully-Automated

**AC-16 — Human-readable demo path**
On a mobile-sized viewport and a desktop viewport, a reviewer can identify the active card, policy result, payment state, decline reason, and explorer link without reading implementation details.

- **proven by:** SC-UI-001 responsive-demo-path
- **strategy:** Agent-Probe

**AC-17 — AICD traceability**
Every deployed component and critical flow in the architecture definition has a unique ID, declared authority, declared forbidden authority, deployment target, and at least one linked acceptance scenario or live evidence record.

- **proven by:** SC-AICD-001 architecture-validator
- **strategy:** Fully-Automated

## Out Of Scope

- Visa, Mastercard, fiat rails, real PAN/CVV processing, card-network authorization, or real-world merchant acquiring.
- Real credit underwriting, credit scoring, KYC/AML, interest, repayment, collections, chargebacks, or lending compliance.
- Production custody, MPC, HSM, multisig treasury governance, or mainnet funds.
- Multiple AI providers, automatic provider fallback, multiple model routing, or country expansion beyond the configured MVP provider policy.
- Multiple settlement assets, multi-chain settlement, bridges, or an independent Pact blockchain.
- Arbitrary merchant addresses supplied by an AI model.
- Multi-card-per-agent management in the first release if it complicates evidence binding; the default MVP path uses one active card per agent.
- Advanced analytics, notifications, mobile-native applications, team roles, billing, and marketplace features.

## Constraints

### Product constraints

- The MVP must be a working testnet product, not a UI-only prototype.
- Core payment, policy, credit state, and settlement data must be real on-chain data.
- Mock/seed data is allowed only for demo catalog labels, merchant descriptions, prompt scenarios, and non-authoritative UI metadata.
- Every testnet-only screen must make the lack of fiat value explicit.
- The owner configures policy once; the happy-path agent payment must not require a human signature for every transaction.

### Blockchain constraints

- Target settlement and policy chain: Creditcoin EVM-compatible testnet, project deployment label advance-testnet.
- Smart contracts are Solidity/EVM contracts.
- Attestcoin ASC is the evidence-verification layer on Creditcoin; it is not a second settlement chain.
- The MVP uses one configured native testnet CTC asset for pool funding and merchant settlement. The exact symbol/address and chain ID are deployment configuration, not hard-coded UI assumptions.
- The target network's ASC verifier precompile and decoder library must be verified during deployment. The official CC3 examples use the native verifier precompile at 0xFD2 and an EvmV1Decoder library; the deployment manifest must confirm values for the selected testnet.
- Contract policy checks are authoritative. Database state, AI output, preflight results, and UI state are not authoritative.

### AI and regional constraints

- MVP provider: OpenAI.
- MVP model default: gpt-5.6-luna, configured through OPENAI_MODEL; deployment must verify that the account can access this model.
- No silent model or provider substitution.
- Browser and Cloudflare Worker code never receives the OpenAI API key.
- Public edge request path: Cloudflare Worker -> regional Supabase Edge Function -> OpenAI Responses API.
- The Supabase function must be invoked in the configured region, expose an execution-region diagnostic, and fail closed on provider errors.
- The regional relay is an operational routing choice, not a bypass of provider territory policy.

### Process constraints

- AICD is the version-controlled architecture source of truth.
- The generated architecture diagram must come from AICD, not be maintained as an unrelated hand-edited diagram.
- No implementation plan or code is included until this document is reviewed and approved.

## Open Questions

No product or architecture question blocks the design approval.

The following are implementation-time verification checks, not scope decisions:

1. Confirm the exact Advance testnet RPC URL, chain ID, native symbol, explorer URL, ASC verifier precompile, and decoder library address before deployment.
2. Confirm access to the configured gpt-5.6-luna model before enabling the live AI path. If unavailable, stop the AI path rather than silently substituting another model.
3. Confirm the selected source-chain key and proof-builder availability for the live evidence rehearsal.

## Background / Research Findings

- The BUIDL CTC 2026 Fall event is sponsored by Creditcoin/Credit Labs and is intended to expand the Creditcoin ecosystem through testnet deployments. The project therefore targets Creditcoin instead of introducing an unrelated L1 or settlement chain.
- Creditcoin's current architecture is EVM-compatible, allowing Solidity contracts and standard EVM wallet/RPC tooling.
- The Attestcoin Protocol provides cross-chain readability through ASC contracts. The reference implementation uses ASCBase, EvmV1Decoder, a source-emitter binding, a proof-builder service, and the Creditcoin native verifier precompile.
- The official Attestcoin examples demonstrate a source-chain event being proven and then applied to state in an ASC contract on Creditcoin. Pact adapts that pattern from loan status to verifiable agent credit evidence.
- The official examples use @gluwa/asc-contracts, @gluwa/usc-sdk, an EVM decoder library, and a proof builder. These are feasibility references for the implementation plan; the current document does not yet prescribe implementation tasks.
- User intent captured during design: “MVP là MVP, không phải prototype mà được quyền mock những loại data khả thi để dùng data thật thay vì mock.”
- User intent captured during design: the AI Agent uses OpenAI, with GPT-5.6-Luna as the standard model; Supabase Edge Functions act as a regional relay and Cloudflare Workers are the public edge layer.

References:

- [BUIDL CTC 2026 Fall](https://dorahacks.io/hackathon/buidl-ctc-2026-fall/detail)
- [Creditcoin developer documentation](https://docs.creditcoin.org/)
- [Creditcoin / Attestcoin overview](https://creditcoin.org/)
- [Official Attestcoin protocol examples](https://github.com/gluwa/attestcoin-protocol-examples)
- [OpenAI supported countries](https://developers.openai.com/api/docs/supported-countries)
- [Supabase regional function invocation](https://supabase.com/docs/guides/functions/regional-invocation)

---

# Architecture Design

## 1. Architecture decision summary

### 1.1 Protocol selection

Pact uses the following protocol stack:

| Concern | Decision |
|---|---|
| Settlement/policy blockchain | Creditcoin EVM-compatible testnet |
| Project network label | advance-testnet |
| Contract model | Solidity smart contracts on EVM |
| Cross-chain evidence | Attestcoin Protocol / ASC on Creditcoin |
| MVP source chain | Ethereum Sepolia-compatible source contract |
| MVP settlement asset | One configured native testnet CTC asset |
| AI provider | OpenAI |
| AI model default | gpt-5.6-luna |

Advance Testnet is treated as the Pact deployment label until the exact RPC/chain identity is confirmed. The protocol field remains creditcoin-evm; if the event uses a different official network name, only the deployment manifest changes, not the product or contract model.

### 1.2 Why this chain architecture

- It aligns Pact with the BUIDL CTC ecosystem instead of diluting the project across an unrelated chain.
- It lets the judges inspect policy state, proof application, merchant settlement, and receipts on a Creditcoin testnet explorer.
- It uses Attestcoin where it adds unique value: verifying the source of the agent's credit capacity.
- It keeps the payment path on one target chain, avoiding a bridge for every purchase.
- It uses EVM/Solidity tooling that is practical for a hackathon MVP.

Pact does not create a new blockchain, use Ethereum as the settlement chain, or depend on a bridge for the payment transaction.

## 2. System topology

~~~mermaid
flowchart TB
    OWNER[Owner Wallet / Pact Web App]
    EDGE[Cloudflare Worker]
    AI[Supabase Regional AI Gateway]
    EXEC[Agent Executor]
    SOURCE[Pact Credit Source on Sepolia]
    PROOF[ASC Proof Worker]
    ASC[PactCreditASC on Creditcoin]
    CORE[PactCardController]
    POOL[PactCreditPool]
    MERCHANT[MerchantSimulator]
    INDEXER[Event Indexer + Read Model]

    OWNER --> EDGE
    EDGE --> AI
    AI --> EXEC
    EXEC --> CORE
    CORE --> POOL
    POOL --> MERCHANT
    SOURCE --> PROOF
    PROOF --> ASC
    ASC --> CORE
    CORE --> INDEXER
    INDEXER --> OWNER
~~~

### 2.1 Component responsibilities

| Component | Authority | Must not be able to do | Runtime target |
|---|---|---|---|
| Pact Web App | Display state; collect owner actions; show receipts | Sign agent payments; set limits; claim success without evidence | Static web deployment |
| Cloudflare Worker | Public routing, request validation, rate limiting, correlation IDs | Hold OpenAI keys, private keys, or settle funds | Cloudflare edge |
| Supabase AI Gateway | Call configured OpenAI provider; validate structured intent; record provider metadata | Call payment contract; mutate credit; sign transactions | Regional Supabase Edge Function |
| Agent Executor | Run preflight; sign allowed payment using restricted testnet agent key; await receipt | Change policy; transfer pool funds directly; select arbitrary recipient | Secure server-side function |
| ASC Proof Worker | Monitor source events; request proof; relay proof transaction; retry idempotently | Decide credit without ASC verification; change card policy | Secure worker/function |
| PactCreditASC | Verify source-chain evidence and update verified credit | Transfer payment funds; bypass source-emitter binding | Creditcoin contract |
| PactCardController | Own card state and policy; authorize atomic payment | Trust AI/database/UI as authority; increase verified credit | Creditcoin contract |
| PactCreditPool | Hold settlement asset; pay registered merchants when called by controller | Accept arbitrary callers; decide policy | Creditcoin contract |
| MerchantSimulator | Receive and record testnet settlement; expose merchant ID | Change card policy; authorize a card | Creditcoin contract |
| Event Indexer | Build a queryable read model from chain events | Authorize payments; fabricate receipts | Supabase scheduled worker |

## 3. Trust boundaries

### Boundary A — Browser to public edge

The browser is untrusted. It can request intents and display state but cannot be trusted for amount, merchant address, card status, balance, or payment success.

### Boundary B — Public edge to AI gateway

Cloudflare validates input and adds a correlation ID. Supabase is the only component allowed to hold OPENAI_API_KEY. The AI gateway returns a structured intent, never a transaction authorization.

### Boundary C — AI gateway to agent executor

The executor accepts only a validated intent reference and re-reads card and merchant state. It does not trust free-form AI text, client-supplied recipient addresses, or database balances.

### Boundary D — Off-chain executor to blockchain

The executor may submit a transaction with the restricted agent signer. The controller re-checks all policy conditions on-chain. The signer has gas only; pool assets are held by PactCreditPool.

### Boundary E — Source chain to ASC

The proof worker is a relayer, not a trust authority. The ASC verifies receipt status, event signature, registered source emitter, evidence identity, and replay status before changing verified credit.

## 4. On-chain contract architecture

### 4.1 PactCreditSource — source-chain evidence emitter

Deployment: one supported source testnet, default Ethereum Sepolia-compatible network.

Purpose: create a real, inspectable testnet event representing a credit provider granting a capacity to an agent.

Conceptual interface:

~~~text
recordCredit(evidenceId, beneficiaryAgent, creditAmount, expiresAt)
CreditGranted(evidenceId, beneficiaryAgent, creditAmount, expiresAt)
~~~

Rules:

- Only the configured testnet source operator can create evidence.
- evidenceId must be unique.
- creditAmount must be positive.
- expiresAt must be in the future.
- The contract has no authority on the Creditcoin payment pool.

This is a testnet evidence issuer, not a claim of real-world credit underwriting.

### 4.2 PactCreditASC — Attestcoin evidence verifier

Deployment: Creditcoin target testnet.

The contract follows the ASC readability pattern demonstrated by the official examples:

- Inherit ASCBase.
- Use EvmV1Decoder to decode the proven EVM transaction.
- Register the exact source-chain PactCreditSource emitter.
- Accept one explicit action, CreditGranted.
- Validate successful source receipt and event signature.
- Validate the registered emitter address.
- Reject an evidence ID that has already been processed.
- Call the controller's restricted credit-evidence hook after verification. The decoded beneficiary agent is mapped to its single active MVP card.

Conceptual result:

~~~text
PactCreditASC.execute(proofData, CREDIT_GRANTED_ACTION)
    -> verify source transaction through ASC native verifier
    -> decode CreditGranted event
    -> verify source emitter and evidence ID
    -> PactCardController.applyVerifiedCreditForAgent(...)
~~~

The proof worker uses the configured Attestcoin proof-builder service and @gluwa/usc-sdk-compatible proof data. The worker may retry after a timeout, but it must deduplicate by source transaction/evidence ID.

### 4.3 PactCardController — policy and payment authority

Responsibilities:

- Create and manage cards.
- Assign one agent wallet to each MVP card.
- Maintain the one-active-card-per-agent mapping used by the MVP evidence path.
- Store policy and spend state.
- Receive verified-credit updates from PactCreditASC.
- Validate and settle payment requests.
- Emit card and payment events.

Conceptual card state:

~~~text
cardId
owner
agent
asset
ownerConfiguredCap
verifiedCredit
verifiedCreditExpiry
spent
perTransactionLimit
expiresAt
status
policyVersion
~~~

Derived value:

~~~text
effectiveLimit = min(ownerConfiguredCap, verifiedCredit)
availableCredit = effectiveLimit - spent
~~~

Owner-only operations:

~~~text
createCard(...)
activateCard(cardId)
suspendCard(cardId)
resumeCard(cardId)
closeCard(cardId)
updatePolicy(cardId, ...)
~~~

ASC-only operation:

~~~text
applyVerifiedCreditForAgent(agent, evidenceId, amount, expiresAt)
~~~

Agent-only operation:

~~~text
pay(cardId, merchantId, amount, asset, nonce, deadline, intentHash)
~~~

pay must verify:

1. msg.sender equals the assigned agent.
2. Card status is ACTIVE.
3. Current time is before card expiry and payment deadline.
4. Asset matches the card asset.
5. Merchant is registered and allowlisted for this card.
6. Amount is positive and does not exceed the per-transaction limit.
7. spent + amount does not exceed effectiveLimit.
8. The nonce/payment identifier has not been used.
9. The pool has sufficient settlement balance.

Only after all checks pass does the controller update spend state and call the pool. A failed transfer must revert the entire transaction.

### 4.4 PactCreditPool — settlement treasury

The pool holds one configured native testnet CTC asset for the MVP.

Conceptual interface:

~~~text
fundPool() payable onlyOwner
settleNative(merchantAddress, amount) onlyCardController
availableBalance() view
~~~

Security rules:

- Only the controller may settle a merchant payment.
- The agent wallet never holds or directly controls pool funds.
- Pool withdrawal is owner-only and is a testnet administration function, not a user-facing payment feature.
- Reentrancy protection and checks-effects-interactions ordering are required.

### 4.5 MerchantSimulator — registered test merchant

The merchant simulator is a real target-chain contract, not a database-only mock.

It provides:

- Stable merchant IDs.
- Registered merchant recipient addresses.
- Active/inactive status.
- A receive function that records total received and emits a merchant receipt event.

The AI model receives a merchant ID from the allowed catalog. It never chooses a raw destination address.

## 5. Credit-evidence flow

~~~mermaid
sequenceDiagram
    participant S as Source Contract
    participant W as Proof Worker
    participant A as PactCreditASC
    participant C as Card Controller
    participant I as Indexer

    S->>S: Emit CreditGranted
    W->>S: Read source transaction
    W->>W: Request Merkle/continuity proof
    W->>A: Submit proof and action
    A->>A: Verify receipt, event, emitter, replay status
    A->>C: Apply verified credit
    C-->>I: Emit CreditVerified/CardCreditUpdated
    I-->>I: Update read model
~~~

Evidence requirements:

- Source transaction hash.
- Source chain key.
- Source contract address.
- Evidence ID.
- Credit amount and expiry.
- Proof submission transaction hash.
- Creditcoin confirmation block.

The UI should show evidence provenance separately from the card's virtual-card visual.

## 6. Payment flow

~~~mermaid
sequenceDiagram
    participant U as User/Agent Request
    participant E as Cloudflare Edge
    participant G as AI Gateway
    participant X as Agent Executor
    participant C as Card Controller
    participant P as Credit Pool
    participant M as Merchant

    U->>E: Natural-language request
    E->>G: Validated request + requestId
    G-->>E: Structured AgentIntent
    E->>X: Intent reference
    X->>C: Read card/merchant state
    X->>C: Read-only preflight
    X->>C: Signed pay transaction
    C->>P: Atomic settlement call
    P->>M: Transfer native testnet asset
    C-->>X: PaymentSettled receipt
    X-->>E: Confirmed result
    E-->>U: Receipt and explorer link
~~~

### 6.1 Payment identity and replay protection

Every intent has an off-chain intentId and canonical intentHash. Every chain payment has a card-scoped nonce and a paymentId derived from canonical payment fields. The contract records used nonces/payment IDs. If the executor times out after broadcasting, it queries by nonce/payment ID before attempting any retry.

### 6.2 Preflight versus authority

The preflight endpoint mirrors contract policy to make the UI responsive. It may return would_settle or a decline reason. It does not mutate state and does not make the final decision. The transaction itself is the only settlement authority.

## 7. Off-chain architecture

### 7.1 Public edge

Cloudflare Worker responsibilities:

- Validate request size and basic shape.
- Apply rate limiting.
- Add requestId and forward tracing headers.
- Reject requests that lack a valid owner/agent session or demo authorization.
- Call Supabase functions.
- Never contain OPENAI_API_KEY, agent private keys, or pool credentials.

### 7.2 Regional AI gateway

Supabase Edge Function responsibilities:

- Execute in the configured region, default us-east-1 for the MVP routing decision.
- Read OPENAI_API_KEY and OPENAI_MODEL from server-side secrets.
- Call the OpenAI Responses API.
- Constrain output to the AgentIntent schema.
- Resolve the selected card and agent from the authenticated request/session rather than trusting model-supplied card or agent identifiers.
- Validate the merchant ID against the Pact catalog and the selected card's allowlist.
- Bind the asset to the selected card configuration; the model cannot choose an arbitrary asset or recipient address.
- Normalize amount into base units only after resolving the configured asset.
- Store provider, model, request ID, latency, and redacted error category.
- Return an intent or a fail-closed error.

Structured intent:

~~~text
AgentIntent {
  intentId
  agentId
  cardId
  merchantId
  amountBaseUnits
  asset
  purpose
  confidence
  provider
  model
  createdAt
  expiresAt
  intentHash
}
~~~

The intent contains no private key, PAN, CVV, arbitrary recipient address, or executable contract calldata. Card ID, agent ID, asset, and merchant recipient resolution are server-bound values; they are not trusted merely because they appear in model output.

### 7.3 Agent executor

The executor is a separate privileged boundary from the AI gateway.

Responsibilities:

- Load a validated intent by intentId.
- Read authoritative card, merchant, pool, and network state from the target chain.
- Perform a read-only preflight.
- Sign pay with a dedicated testnet agent key.
- Wait for a receipt and classify the result.
- Avoid duplicate submissions after network timeouts.

Secrets:

- AGENT_SIGNER_PRIVATE_KEY exists only in the executor's server-side secret store.
- The agent signer is funded with gas only.
- It is restricted by the card controller's msg.sender == card.agent check and by per-card limits.

### 7.4 ASC proof worker

The proof worker is separate from the payment executor so a proof delay or source-chain outage cannot grant the payment signer new authority.

Configuration includes:

~~~text
SOURCE_CHAIN_RPC_URL
SOURCE_CHAIN_KEY
SOURCE_CREDIT_SOURCE_ADDRESS
PROOF_BUILDER_URL
CREDITCOIN_RPC_URL
PACT_CREDIT_ASC_ADDRESS
ASC_RELAYER_PRIVATE_KEY
~~~

The worker keeps a durable cursor and evidence dedupe key. It records each proof attempt, result, and target-chain transaction hash.

### 7.5 Read model and indexer

The indexer polls the target chain from the last processed block and upserts events by (chainId, txHash, logIndex).

It indexes:

- CardCreated.
- CardActivated, CardSuspended, CardResumed, CardClosed.
- CreditVerified / CardCreditUpdated.
- PaymentSettled.
- Merchant receipt events.
- Proof submission and failure metadata.

The read model improves UI queries but can never authorize a payment or override on-chain state.

## 8. Data model

### 8.1 Authoritative on-chain data

| Entity | Authoritative fields |
|---|---|
| Card | Owner, agent, policy, status, expiry, verified credit, spent, nonce usage |
| Merchant | Merchant ID, recipient, active status |
| Credit evidence | Evidence ID, source binding, verified amount, expiry, processed status |
| Payment | Card, merchant, amount, asset, nonce, intent hash, settlement event |
| Pool | Native asset balance and controller authorization |

### 8.2 Off-chain read model

Minimum logical records:

- agent_profiles: agent ID, wallet address, display name, status.
- cards_read_model: card ID, owner, agent, latest indexed policy/status.
- intents: intent ID, card ID, parsed fields, provider/model, intent hash, status.
- payments: payment ID, intent ID, card ID, merchant ID, tx hash, status, decline reason.
- credit_evidence: evidence ID, source tx hash, proof tx hash, target block, status.
- chain_events: chain ID, tx hash, log index, event type, block number, payload hash.
- system_logs: request ID, component, latency, error category, redacted metadata.
- deployment_config: chain ID, RPC/explorer identifiers, contract addresses, version.

No table is allowed to act as a balance authority. No private keys, raw PAN/CVV, OpenAI key, or source prompt containing secrets is stored.

## 9. API boundaries

The exact route naming is implementation-plan territory; the behavior boundary is fixed here.

### Public/read endpoints

~~~text
GET  /v1/config
GET  /v1/cards/:cardId
GET  /v1/cards/:cardId/activity
GET  /v1/payments/:paymentId
POST /v1/agent/intents
POST /v1/payments/preflight
POST /v1/payments/execute
~~~

### Rules

- Read endpoints may use the indexed read model but should expose the latest confirmed chain block.
- POST /v1/agent/intents cannot authorize a payment.
- POST /v1/payments/preflight cannot mutate state.
- POST /v1/payments/execute accepts only a validated intent reference and re-checks chain state.
- Owner card-management transactions are wallet-authorized contract calls or signed commands; the public API cannot impersonate the owner.

## 10. AICD source of truth

### 10.1 Repository layout

~~~text
architecture/
├── pact.system.aicd.yaml
├── pact.contracts.aicd.yaml
├── pact.policies.aicd.yaml
├── pact.trust-boundaries.aicd.yaml
├── pact.ui.aicd.yaml
├── pact.deployment.aicd.yaml
├── pact.evidence.aicd.yaml
└── generated/
    └── pact-architecture.mmd
~~~

The files above are the planned AICD artifacts. This document is the human-readable design source; the implementation phase will materialize the machine-readable definitions and their validator.

### 10.2 AICD object model

Every definition uses the following concepts:

~~~text
system
component
interface
flow
policy
invariant
deployment
evidence
~~~

Required fields:

~~~text
id
type
authority
cannot
interfaces
deployment
evidence
~~~

### 10.3 Illustrative AICD definition

~~~yaml
version: "0.1"
kind: PactArchitecture

system:
  id: pact
  name: Pact
  purpose: Programmable spending control for autonomous AI agents
  protocol: creditcoin-evm
  target_network: advance-testnet
  settlement_asset: native-testnet-ctc
  evidence_protocol: attestcoin-asc

components:
  - id: pact-card-controller
    type: smart-contract
    platform: creditcoin-evm
    authority:
      - create_card
      - enforce_card_policy
      - settle_allowed_payment
    cannot:
      - trust_ai_output_as_authority
      - increase_verified_credit_without_asc
      - accept_unregistered_merchant
    deployment: advance-testnet
    evidence:
      - SC-PAY-001
      - SC-PAY-002

  - id: pact-credit-asc
    type: attestcoin-smart-contract
    platform: creditcoin-evm
    authority:
      - verify_source_credit_evidence
      - apply_verified_credit
    cannot:
      - settle_payment
      - bypass_source_emitter_binding
    deployment: advance-testnet
    evidence:
      - SC-ASC-001
      - SC-ASC-002

  - id: pact-ai-gateway
    type: regional-provider-gateway
    authority:
      - generate_structured_intent
      - enforce_provider_region_policy
    cannot:
      - settle_payment
      - mutate_credit_limit
      - sign_card_transaction
    deployment: supabase-edge-us-east-1
    evidence:
      - SC-AI-001
      - SC-AI-002

flows:
  - id: live-allowed-payment
    from: pact-ai-gateway
    through:
      - agent-executor
      - pact-card-controller
      - pact-credit-pool
      - merchant-simulator
    produces:
      - PaymentSettled
    evidence:
      - SC-PAY-001
      - SC-INDEX-001

policies:
  - id: card-spend-policy
    requires:
      - active_card
      - assigned_agent
      - allowlisted_merchant
      - matching_asset
      - within_per_transaction_limit
      - within_effective_credit
      - unexpired_card
      - unused_nonce

invariants:
  - id: ai-is-not-financial-authority
    statement: AI output can propose an intent but cannot authorize settlement.
    proven_by: SC-AI-002

  - id: receipt-required-for-success
    statement: UI success requires a confirmed PaymentSettled receipt.
    proven_by: SC-INDEX-001
~~~

### 10.4 AICD validator rules

The validator must fail when:

- IDs are duplicated or references point to missing IDs.
- A flow points to an undeclared component.
- A component has authority without a corresponding cannot boundary where relevant.
- A contract component has no target deployment.
- A critical policy has no linked invariant and acceptance scenario.
- A UI success state is not linked to an on-chain receipt/evidence event.
- A real-data path has no evidence reference.
- A secret-bearing component is deployed to the browser or public edge.
- The generated diagram contains a component missing from AICD.

## 11. UI/UX design

### 11.1 Direction

The UI direction is **Autonomous Spending Control Room**: a calm financial operations interface with a virtual-card focal point and an explicit agent execution timeline. It should feel operational and trustworthy, not like a generic crypto wallet.

Design constraints:

- Mobile-first at 320px+, then tablet and desktop layouts.
- Warm off-white and charcoal base with a restrained burnt-orange accent.
- Be Vietnam Pro for interface text and IBM Plex Mono for amounts, nonces, hashes, and addresses.
- Minimum 44px touch targets.
- Normal text contrast at least WCAG AA.
- Input text at least 16px on mobile.
- Motion communicates agent progress and transaction state; prefers-reduced-motion disables nonessential motion.
- No neon glow, misleading bank-card styling, or visual treatment that implies fiat settlement.

### 11.2 MVP screens

1. **Connect and setup** — wallet/network status, create card, assign agent, configure policy.
2. **Command Center** — active card, available credit, agent status, latest payment, suspend action.
3. **Virtual Card** — testnet-only card visual plus policy and evidence provenance.
4. **Agent Console** — natural-language request, parsed intent, policy checks, execution timeline.
5. **Payment Receipt** — settlement status, merchant, amount, block/time, tx hash, explorer link.

### 11.3 Important UI states

~~~text
NETWORK_MISMATCH
NO_CARD
CARD_INACTIVE
AGENT_OFFLINE
AI_PROVIDER_UNAVAILABLE
INTENT_INVALID
PREFLIGHT_DECLINED
TX_PENDING
SETTLED
TX_FAILED
CARD_SUSPENDED
~~~

The UI must distinguish preflight approved from on-chain settled.

## 12. Observability and operations

### 12.1 Correlation fields

~~~text
requestId
intentId
paymentId
cardId
evidenceId
nonce
txHash
chainId
~~~

### 12.2 Required logs

- AI provider/model, selected region, provider request ID, latency, and redacted failure category.
- Supabase execution region and expected-region comparison.
- Agent signer address, chain ID, nonce, gas estimate, tx hash, and receipt status.
- Proof worker source tx, evidence ID, proof attempt count, target tx hash, and final status.
- Indexer cursor, block range, event key, and dedupe result.
- Payment decline reason and contract error classification.

### 12.3 Metrics

~~~text
intent_parse_success_rate
provider_error_rate
unexpected_region_count
payment_settlement_success_rate
payment_decline_rate_by_reason
transaction_confirmation_latency
proof_completion_latency
indexer_lag
agent_gas_balance
~~~

### 12.4 Operational fail-closed rules

- Wrong chain: stop.
- Wrong Supabase execution region: log and stop the AI path.
- Provider unavailable/model unavailable: no intent, no payment.
- Unknown contract address or chain ID: stop deployment/runtime.
- Unknown merchant ID: reject intent.
- Receipt timeout after broadcast: reconcile by payment ID/nonce before retrying.
- Indexer lag: show pending/uncertain state, never show settled solely from a client response.

## 13. Security invariants

1. AI is a proposal generator, not a financial authority.
2. The browser cannot sign autonomous agent payments.
3. The public edge cannot access payment or provider secrets.
4. The agent wallet cannot call the pool directly.
5. The controller cannot raise verified credit without the ASC authority path.
6. Merchant addresses come from a registered on-chain merchant ID, never from raw LLM output.
7. Card spend is updated only inside the successful atomic settlement transaction.
8. Replay protection is enforced on-chain.
9. UI success requires a confirmed receipt and indexed event.
10. All testnet keys are disposable and must be clearly separated from any mainnet wallet.

## 14. Test strategy

### Fully automated

- Solidity unit and invariant tests for card lifecycle, policy matrix, nonce replay, time boundaries, atomic revert, pool authorization, merchant registration, and ASC source binding.
- Schema validation tests for AI output.
- Provider error and no-chain-call tests.
- Indexer deduplication and cursor tests.
- AICD reference and coverage validator.

### Hybrid

- Deploy contracts to the target testnet.
- Run a real source evidence event and ASC proof submission.
- Create a real card and verify its state.
- Run an allowed payment and verify merchant balance, receipt, event, and explorer link.
- Verify regional gateway headers and real provider access in the deployment environment.

### Agent probe/manual

- Responsive UI review at mobile and desktop sizes.
- Verify plain-language decline copy.
- Verify the testnet-only disclosure is visible before payment.
- Verify explorer links open to the correct chain and transaction.
- Verify reduced-motion behavior and keyboard focus states.

## 15. Hackathon demo path

### Pre-demo preparation

- Contracts are deployed and addresses are pinned in deployment configuration.
- Merchant is registered on-chain.
- Pool is funded with native testnet CTC.
- Agent wallet has gas only.
- One valid credit evidence event has been verified through ASC. Its source and target transaction hashes are visible in the evidence panel.
- Supabase AI gateway has a valid server-side OpenAI secret and configured model.
- A known allowed and known blocked prompt are ready.

### Live sequence

1. Show Pact's active testnet virtual card and verified-credit provenance.
2. Enter an allowed request for an allowlisted merchant.
3. Show the structured intent and policy checks.
4. Let the agent submit the transaction without a per-payment wallet popup.
5. Open the explorer receipt and show the merchant's received balance/event.
6. Enter an over-limit or unallowlisted request.
7. Show the policy rejection and Funds moved: 0.
8. Suspend the card and show that a subsequent payment is blocked.

The demo's strongest proof point is not the card visual; it is the combination of autonomous execution, on-chain policy enforcement, real testnet settlement, and a verifiable rejection path.

## 16. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Advance network label differs from official RPC identity | Deployment mismatch | Pin chain ID/RPC/explorer in deployment manifest and fail closed |
| gpt-5.6-luna unavailable to the account | AI path unavailable | Startup capability check; no silent fallback |
| ASC proof latency or source-chain outage | Credit evidence delayed | Prepare one real verified evidence record before demo; worker retries idempotently |
| Testnet faucet/RPC instability | Demo interruption | Rehearse with funded disposable wallets and keep a last-known real receipt clearly labeled as recorded evidence, not a new live settlement |
| Agent key compromise | Unauthorized testnet calls | Disposable key, gas-only wallet, on-chain policy caps, rapid rotation |
| LLM outputs arbitrary merchant/address | Misrouting risk | Merchant ID allowlist and address resolution outside the model |
| Database/indexer inconsistency | Misleading UI | Contract remains authority; receipt/event gating and idempotent indexer |
| Native asset transfer failure | Payment failure | Atomic revert, pool balance preflight, reentrancy guard, explicit failure state |

## 17. Definition of design complete

This design is complete when the reviewer agrees that:

- Pact's product boundary is a programmable testnet virtual card for AI Agents.
- Creditcoin EVM is the settlement/policy blockchain.
- Attestcoin ASC is the evidence-verification protocol on that chain.
- Payment settlement is real and atomic on the target testnet.
- AI, database, edge, and UI layers cannot override on-chain policy.
- MVP screens and demo path are limited to the approved scope.
- Acceptance scenarios prove both successful settlement and safe rejection.
- AICD can represent every component, flow, policy, invariant, deployment, and evidence link.

Once this document is approved, the next artifact is an implementation plan that decomposes the work into contract, proof, backend, indexer, UI, test, deployment, and demo milestones.
