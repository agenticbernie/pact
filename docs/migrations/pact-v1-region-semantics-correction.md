# Region Semantics Correction — Decision (2026-09-19) — PLAN ONLY

Date: 2026-09-19 (UTC) · Branch: `main` · Scope: local code + tests only.
Status: DECISION ONLY. No deploy, secret change, H-lane run, OpenAI call,
DB mutation, commit, or push is authorized. Implementation follows strictly
via TDD against this decision.

## 1. Authoritative facts (confirmed, not inferred)

- The real Supabase project/database lives in East US (North Virginia):
  project region `us-east-1`.
- Secret `PACT_EXPECTED_REGION` exists and is set to `us-east-1` — CORRECT
  and must not be touched.
- No `SB_REGION` secret exists. The Supabase runtime injects
  `SB_REGION=ap-southeast-1` (edge-runtime location metadata).
- Health therefore reports `configuredRegion=ap-southeast-1` (observed
  runtime echoed as "configured") vs `expectedRegion=us-east-1`
  (authoritative) — a naming/semantics defect, NOT a Singapore project.
- Classification of the old defect: `REGION_SEMANTICS_MISMATCH`
  (mislabelled observed value), NOT an infrastructure migration. No
  project move occurred or is needed.

## 2. Root cause (exact)

`resolveRegionConfig` (`supabase/functions/_shared/region-config.ts:12`)
derives `configuredRegion` from the OBSERVED value
(`observedRegion ?? "unknown"`, `:25`), and compositions forward it into
the health shape. Readers (and two committed tests) therefore treat the
edge-runtime location as the project's configured region. Companion
defect: `configuredRegion !== actualRegion` comparisons
(`agent-executor/index.ts`, `ai-gateway/index.ts`, AND the session
entrypoint `createSessionEntrypointHandler` — found during GREEN when the
new session test exposed it) were vacuous (composition always fed
observed==observed) but would become LIVE false-mismatch gates the moment
`configuredRegion` is corrected — all three are removed in the same patch,
with `regionsMatch`
(validity-only, no equality) remaining as the true guard.

## 3. Corrected semantics

- `PACT_EXPECTED_REGION` (fallback: legacy local/test
  `SUPABASE_FUNCTION_REGION`) is the AUTHORITATIVE project region. Name
  it so: `expectedRegion` stays, `observedRegion` becomes
  `observedRuntimeRegion`, and `configuredRegion` (health-facing) becomes
  `expectedRegion ?? "unknown"`.
- `SB_REGION` is observed runtime metadata: validated for presence/shape
  (missing/malformed still fails protected work closed via
  `regionsMatch`), NEVER project truth, never compared for equality.
- `PACT_EXPECTED_REGION=us-east-1` + `SB_REGION=ap-southeast-1` is the
  HEALTHY production shape: protected work proceeds, health reports
  authoritative `us-east-1`. Missing `PACT_EXPECTED_REGION` still fails
  closed exactly as today.
- No `ap-southeast-1` literal is added anywhere; `SB_REGION` is not
  removed; no secret is created, read, or changed.

## 4. Health contract (backward compatible)

The seven-key shape is UNCHANGED (no key added/renamed/removed — H
evidence, edge readers, and exact-key tests depend on it). Only the
`configuredRegion` VALUE semantics change: authoritative project region
(or `"unknown"`) instead of observed runtime region. Migration impact:
consumers that read `configuredRegion` as edge location must re-read it
as project region — that re-reading IS the fix; `expectedRegion` keeps
its meaning. Observed runtime stays available internally (and in unit
tests) under its explicit name but is no longer exposed as "configured".

## 5. Invariants preserved

- Arc chain `5042002`, OpenAI provider, `gpt-5.6-luna` pin,
  `allowFallback:false`, H1/H2 contracts, lane/controller/owner bindings,
  read-only transport, auth-before-work: all untouched.
- Session has no region logic (verified by source map) and is unaffected.
- Missing/malformed region inputs fail closed on the same paths as today.
- No database schema change; no new env names; no new API codes.

## 6. Test migration (documented, not fake-green)

Two committed tests encode the buggy value
(`runtime-composition-correction` G34-health + `health.vitest.test.ts`
G17: `configuredRegion:"ap-southeast-1"` next to
`expectedRegion:"us-east-1"`). They are updated to the corrected
expectation (`configuredRegion:"us-east-1"`) as the TDD GREEN, plus a new
`region-semantics-correction.vitest.test.ts` proving: no false mismatch
for the production pair, authoritative health value, explicit observed
naming, fail-closed on missing/malformed, per-function composition
health, unchanged envelope. All other suites must stay green unmodified;
any further fallout is fixed by the same semantics (never by weakening
assertions).
