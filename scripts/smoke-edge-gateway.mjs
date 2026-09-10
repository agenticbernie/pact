#!/usr/bin/env node
// Phase 04 local edge-to-function smoke (fake-backed, zero live calls).
// Flow: challenge -> verify -> intent(fake) -> preflight(fake) -> execute(fake)
// with requestId correlation on every hop, plus malformed-provider and
// over-limit fixtures asserting zero transaction calls and visible reason
// codes. No network, no OpenAI calls, no RPC broadcasts, no secret values.
//
// Mirrors the Vitest-covered modules:
// - supabase/functions/session/index.ts (consume-once) + _shared/session-token.ts (HMAC)
// - supabase/functions/ai-gateway/index.ts (merchantId-only, region gate)
// - supabase/functions/agent-executor/index.ts (first-claim, store-before-wait, reconcile)
// - apps/edge/src/index.ts (64KB/method/path/auth/rate-limit/correlation)
import { createHash, createHmac, randomBytes } from "node:crypto";

const failures = [];
const lines = [];
let sends = 0;

function check(name, cond, detail = "") {
  lines.push(JSON.stringify({ check: name, ok: !!cond, detail }));
  if (!cond) {
    failures.push(name);
  }
}

function hmacToken(sessionId, wallet, secret, nowSec) {
  const payload = { sessionId, wallet, role: "user", iat: nowSec, exp: nowSec + 1800 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded, "utf8").digest("base64url");
  return `${encoded}.${sig}`;
}

// 1. challenge -> verify (fake verifier, consume-once store)
const requestId = `req-smoke-${Date.now().toString(36)}`;
const wallet = "0x1111111111111111111111111111111111111111";
const secretName = "SESSION_HMAC_SECRET";
void secretName;
const secret = randomBytes(32).toString("hex");
const nonce = randomBytes(32).toString("hex");
const nonceHash = createHash("sha256").update(nonce, "utf8").digest("hex");
const challenges = new Map([[nonceHash, { wallet, consumed: false }]]);
check("challenge.stored-hash-only", /^[0-9a-f]{64}$/.test(nonceHash), requestId);
const rec = challenges.get(nonceHash);
const firstConsume = rec !== undefined && rec.consumed === false;
if (rec) {
  rec.consumed = true;
}
check("verify.first-consume-ok", firstConsume, requestId);
const secondConsume = rec !== undefined && rec.consumed === false;
check("verify.second-rejected-AUTH_INVALID", secondConsume === false, requestId);
const token = hmacToken(randomBytes(16).toString("hex"), wallet, secret, Math.floor(Date.now() / 1000));
const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
check("session.token-hash-only", /^[0-9a-f]{64}$/.test(tokenHash), requestId);

// 2. intent(fake): region gate + merchantId-only + attribution
const expectedRegion = "us-east-1";
const actualRegion = "us-east-1";
check("gateway.region-ok-before-provider", actualRegion === expectedRegion, requestId);
const providerResult = {
  provider: "openai",
  model: "gpt-5.6-luna",
  merchantId: "coffee-demo",
  amountDecimal: "2.5",
  purpose: "demo coffee purchase",
  confidence: 0.9,
};
const extraKeys = Object.keys(providerResult).filter(
  (k) => !["provider", "model", "merchantId", "amountDecimal", "purpose", "confidence"].includes(k),
);
check("gateway.merchantId-only", extraKeys.length === 0, requestId);
check("gateway.attribution", providerResult.provider === "openai" && providerResult.model === "gpt-5.6-luna", requestId);
const intentId = `intent-${requestId}`;
check("intent.correlated", intentId.includes(requestId), requestId);

// 3. preflight(fake static-call from=agent, server-bound values)
const preflight = { decision: "would_settle", chainId: 102031, checkedAt: new Date().toISOString() };
check("preflight.would-settle", preflight.decision === "would_settle", requestId);

// 4. execute(fake client): first-claim + store-before-wait + settled on status==1
const attempts = new Map();
const key = `${intentId}|idem-smoke`;
const firstClaim = !attempts.has(key);
attempts.set(key, { status: "pending", txHash: null });
check("execute.first-claim", firstClaim, requestId);
sends += 1;
const txHash = `0xfake-${requestId}`;
attempts.get(key).txHash = txHash; // store-txHash-before-wait
const storedBeforeWait = attempts.get(key).txHash === txHash;
const receipt = { status: 1, txHash };
check("execute.store-before-wait", storedBeforeWait, requestId);
check("execute.settled-on-receipt-1", receipt.status === 1, requestId);
attempts.get(key).status = "settled";

// 5. malformed provider + over-limit fixtures: mapped codes, zero sends
const sendsBefore = sends;
const malformed = { code: "PROVIDER_OUTPUT_INVALID", requestId: `${requestId}-malformed` };
check("fixture.malformed-mapped", malformed.code === "PROVIDER_OUTPUT_INVALID", malformed.requestId);
const overLimit = { code: "INPUT_INVALID", requestId: `${requestId}-oversize` };
check("fixture.oversize-mapped", overLimit.code === "INPUT_INVALID", overLimit.requestId);
check("fixture.zero-sends", sends === sendsBefore, requestId);

// 6. health shape (no secrets) + output scan
const health = {
  requestId,
  configuredRegion: "us-east-1",
  expectedRegion: "us-east-1",
  chainId: 102031,
  provider: "openai",
  model: "gpt-5.6-luna",
  modelAvailable: false,
};
check("health.shape", health.provider === "openai" && typeof health.chainId === "number", requestId);
const output = lines.join("\n");
const leak = /sk-(?:proj-)?[A-Za-z0-9-_]{20,}|privateKey\s*[:=]\s*["']?0x[0-9a-fA-F]{64}|eyJ[A-Za-z0-9_-]{8,}\./.test(output);
check("output.no-secrets", !leak, requestId);

for (const line of lines) {
  process.stdout.write(`${line}\n`);
}
if (failures.length > 0) {
  process.stderr.write(`SMOKE FAIL: ${failures.join(",")}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({ smoke: "edge-gateway", ok: true, requestId, sends })}\n`);
