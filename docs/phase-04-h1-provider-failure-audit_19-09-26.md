# H1 Provider Failure Audit — Read-Only (2026-09-19)

Scope: classify the H1 `400 PROVIDER_UNAVAILABLE` (corr `h1-arc-owner-1`,
latency `2915ms`, no intent persisted) using ONLY static code mapping and
prior redacted observations. No OpenAI recall, no retry, no secret/model/
deploy change, no H-lane run. No body, key, token, or raw payload printed
— none was observed (server returns mapped codes only).

## 1. Extracted facts (from the lane record, no new calls)

- HTTP status (lane): `400`; mapped code: `PROVIDER_UNAVAILABLE`;
  response keys `[code,message,requestId,retryable]`; `intentId` absent
  (nothing persisted); attempts: exactly 1 lane attempt, 0 lane retries.
- Pre-provider gates all passed (no 401/503/400-card codes): session
  auth, region validity, and owner-scoped card lookup succeeded, so the
  failure is strictly inside the provider call.
- Server-internal retry: the provider retries ONCE only on 502/503/429,
  so billable exposure is ≤1 lane attempt plus at most one server-side
  retry on those statuses.
- Function-log access: NO Edge-Function log surface exists from this
  shell (CLI has list/deploy only; no token for Management log APIs;
  none sought). `providerRequestId`/mapped-status server logs were NOT
  read. No secret-adjacent value was handled.

## 2. Code mapping (the classifier)

`openai-provider.ts statusToCode`: `429 → RATE_LIMITED`;
`404` or body containing `model_not_found`/`model-unavailable` →
`PROVIDER_MODEL_UNAVAILABLE`; EVERYTHING else non-2xx (400/401/403/
500/502/503) → `PROVIDER_UNAVAILABLE`. Output-shape failures map to
`PROVIDER_OUTPUT_INVALID` (not observed). Fetch throws map to
`PROVIDER_UNAVAILABLE` via the gateway fallback. Missing `apiKey`
sends NO Authorization header (guaranteed provider 401 → same code).

## 3. Classification (5 categories)

1. **401/403 key/permission — POSSIBLE (leading).** Maps to the observed
   code. Key NAME is set remotely (digest present) but no successful
   provider call from these functions has ever been recorded, so value
   validity/scope is UNKNOWN; a missing value degrades to the identical
   401 shape. Cannot be excluded from outside.
2. **404/model_not_found — RULED OUT** as the mapped shape (would surface
   as `PROVIDER_MODEL_UNAVAILABLE`; model pin `gpt-5.6-luna` verified
   locally pre-lane).
3. **429 quota/rate-limit — RULED OUT** (would surface as `RATE_LIMITED`).
4. **5xx/network — POSSIBLE.** Maps to the observed code (with one
   server-internal retry on 502/503). The 2915ms latency is consistent
   with an outbound error round-trip (possibly ×2) plus cold start.
5. **Constructor/runtime dependency missing — RULED OUT.** Latency proves
   a real outbound attempt occurred (instant local failure would be
   ~ms-scale); provider construction, pin assert, schema, and fetch
   transport all demonstrably ran.

## 4. Corroboration correction

Health `modelAvailable:false` carries NO signal: it is a hardcoded
`false` at the health call site (`ai-gateway/index.ts`), not a live
capability probe. Prior reads of it as provider evidence were wrong;
recorded here so no future lane relies on it.

## 5. Disambiguation (not performed — outside this lane)

Server logs (providerRequestId + mapped status + latency, per the
provider's redacted-logging design) pinpoint 401-vs-5xx exactly; read
them via Dashboard (operator action). Alternatively a key-validity probe
is a new approval, never this lane. Between (1) and (4) the evidence is
tied; (2)(3)(5) are excluded.
