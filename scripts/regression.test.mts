import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { encode as encodeCbor } from "ox/Cbor";
import { encodeAbiParameters, encodeFunctionData } from "viem";
import { parsePactQrPayload, paymentAmountError, createOrderId } from "../web/src/lib/pact-schema.ts";

// Never read local secrets, start the solver, or send blockchain transactions.
process.env.PACT_LOAD_ENV = "0";
process.env.PRIVATE_KEY = `0x${"11".repeat(32)}`;
process.env.PASSKEY_ALLOWED_ORIGINS = "http://localhost:3000";
const { RelayerStore } = await import("../relayer/src/db/store.ts");
const { createRelayerHttpServer } = await import("../relayer/src/server/api.ts");
const { PasskeyService } = await import("../relayer/src/services/passkeys.ts");
const { parseUsdcAmount, calculateFeeAtomic, Priority } = await import("../relayer/src/types/pact.ts");
const { validateSponsoredCalls } = await import("../relayer/src/services/bundler.ts");
const { PactSolver } = await import("../relayer/src/services/solver.ts");
const { CONTRACTS, fujiPublicClient, arbSepoliaPublicClient, baseSepoliaPublicClient } = await import("../relayer/src/config/chains.ts");
const { PACT_ESCROW_ABI, MOCK_USDC_ABI } = await import("../relayer/src/abi/contracts.ts");
const merchant = `0x${"22".repeat(20)}` as const;
const sender = `0x${"33".repeat(20)}` as const;
const lock = `0x${"44".repeat(32)}` as const;
const invoice = { protocol: "pact", version: "1.0", merchant, targetChainId: 421614, targetToken: "USDC", orderId: "invoice-1", amount: "3.50", timestamp: Math.floor(Date.now() / 1000) };

for (const amount of [undefined, "0", "0.00"]) test(`static QR preserves open amount ${String(amount)}`, () => {
  const parsed = parsePactQrPayload(JSON.stringify({ ...invoice, amount }));
  assert.equal(Number(parsed.amount), 0);
  assert.equal(parsed.editable, true);
});
test("wallet-address QR prompts for amount instead of silently charging 1 USDC", () => {
  assert.equal(parsePactQrPayload(merchant).amount, "0");
});
test("supported EIP-681 address chains are retained", () => {
  assert.equal(parsePactQrPayload(`ethereum:${merchant}@43113`).targetChainId, 43113);
});
for (const raw of [`ethereum:${merchant}@1`, `ethereum:${merchant}@845320`, `ethereum:${merchant}?value=100`, `ethereum:${merchant}@43113/transfer?address=${sender}`, `0x${"00".repeat(20)}`]) test(`unsafe wallet QR is rejected: ${raw}`, () => assert.throws(() => parsePactQrPayload(raw)));
for (const patch of [{ amount: "-1" }, { amount: "garbage" }, { amount: "1e2" }, { amount: "1.1234567" }, { targetChainId: 1 }, { targetToken: "ETH" }, { version: "9" }, { merchant: `0x${"00".repeat(20)}` }, { timestamp: Date.now() + 600_000 }]) test(`invalid QR does not silently default: ${JSON.stringify(patch)}`, () => assert.throws(() => parsePactQrPayload(JSON.stringify({ ...invoice, ...patch }))));
test("legacy millisecond timestamps normalize to seconds", () => assert.equal(parsePactQrPayload(JSON.stringify({ ...invoice, timestamp: 1_700_000_000_000 })).timestamp, 1_700_000_000));
test("fixed invoices are not editable", () => assert.equal(parsePactQrPayload(JSON.stringify(invoice)).editable, false));
test("order IDs do not repeat in the old 1000-second collision window", () => assert.equal(new Set(Array.from({ length: 500 }, () => createOrderId())).size, 500));
for (const value of ["", "-1", "NaN", "Infinity", "1e1", "0.50", "50.000001", "1.1234567"]) test(`payment validation rejects ${value || "empty input"}`, () => assert.ok(paymentAmountError(value)));
for (const value of ["1", "3.50", "1.123456", "50.00"]) test(`payment validation accepts ${value}`, () => assert.equal(paymentAmountError(value), null));
for (const value of ["1.0000009", "1e2", "-1", "Infinity", "", " 1"]) test(`backend rejects non-exact USDC input ${value || "empty input"}`, () => assert.throws(() => parseUsdcAmount(value)));
test("fees and amounts preserve six decimal places", () => {
  assert.equal(parseUsdcAmount("3.123456"), 3_123_456n);
  assert.equal(calculateFeeAtomic(3_500_000n, Priority.SPEED), 10_500n);
  assert.equal(calculateFeeAtomic(3_500_000n, Priority.COST), 5_000n);
});

function seed(store: InstanceType<typeof RelayerStore>, options: { id?: `0x${string}`; orderId?: string; createdAt?: number } = {}) {
  store.saveQuote({ hashLock: lock, secret: "never-expose-this-preimage", orderId: options.orderId || "invoice-1", merchant, targetChainId: 421614, amountAtomic: "3500000", lightningFeeAtomic: "10500", economyFeeAtomic: "5000", deadline: Math.floor(Date.now() / 1000) + 900 });
  return store.upsertIntentFromEvent({ intentId: options.id || `0x${"55".repeat(32)}`, sender, tokenIn: CONTRACTS.avalancheFuji.mockUsdc, tokenOut: CONTRACTS.arbitrumSepolia.mockUsdc, receiver: merchant, amountIn: 3_500_000n, feePaid: 10_500n, priority: Priority.SPEED, targetChainId: 421614, hashLock: lock, deadline: Math.floor(Date.now() / 1000) + 900 }).record;
}

test("order lookup can be bound to its exact hash lock and recipient", () => {
  const store = new RelayerStore(":memory:");
  try {
    seed(store);
    assert.ok(store.getIntentByOrderId("invoice-1", { hashLock: lock, merchant }));
    assert.equal(store.getIntentByOrderId("invoice-1", { hashLock: `0x${"66".repeat(32)}` }), null);
    assert.equal(store.getIntentByOrderId("invoice-1", { merchant: sender }), null);
  } finally { store.close(); }
});
test("destination transaction outbox persists exact signed bytes until confirmed", () => {
  const store = new RelayerStore(":memory:");
  const hash = `0x${"88".repeat(32)}`;
  const raw = `0x${"aa".repeat(64)}`;
  try {
    store.saveDestinationTransaction(hash, 421614, raw);
    assert.equal(store.getDestinationTransaction(hash)?.chain_id, 421614);
    assert.equal(store.getDestinationTransaction(hash)?.raw_tx, raw);
    const pending = store.getUnresolvedDestinationTransactions();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].tx_hash, hash);
    assert.equal(pending[0].chain_id, 421614);
    assert.equal(pending[0].raw_tx, raw);
    store.deleteDestinationTransaction(hash);
    assert.equal(store.getDestinationTransaction(hash), null);
    assert.deepEqual(store.getUnresolvedDestinationTransactions(), []);
  } finally { store.close(); }
});

test("reusable QR lookup finds unique child payments only after settlement", () => {
  const store = new RelayerStore(":memory:");
  try {
    const record = seed(store, { orderId: "STATIC-shop-unique-payment" });
    assert.equal(store.getIntentByOrderId("STATIC-shop", { prefix: true, merchant, after: 0 }), null);
    store.updateIntentState(record.intent_id, "SETTLED");
    assert.ok(store.getIntentByOrderId("STATIC-shop", { prefix: true, merchant, after: 0 }));
    assert.equal(store.getIntentByOrderId("STATIC-sho", { prefix: true, merchant }), null);
  } finally { store.close(); }
});
test("daily reports apply the requested date range and exclude expired escrow", () => {
  const store = new RelayerStore(":memory:");
  try {
    const record = seed(store);
    store.updateIntentState(record.intent_id, "EXPIRED");
    assert.equal(store.getMerchantSettlements(merchant).count, 0);
    store.updateIntentState(record.intent_id, "SETTLED");
    assert.equal(store.getMerchantSettlements(merchant, Date.now() - 1000, Date.now() + 1000).count, 1);
    assert.equal(store.getMerchantSettlements(merchant, Date.now() + 10000).count, 0);
    assert.equal(store.getMerchantSettlements(merchant).totalVolumeAtomic, "3500000");
  } finally { store.close(); }
});

test("public API redacts secrets and rejects malformed inputs", async () => {
  const store = new RelayerStore(":memory:");
  const record = seed(store, { orderId: "=SUM(1+1)" });
  store.updateIntentState(record.intent_id, "SETTLED");
  const server = createRelayerHttpServer(store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ["/api/v1/intents", `/api/v1/intents/${record.intent_id}`, `/api/v1/orders/${encodeURIComponent(record.order_id!)}`, `/api/v1/merchants/${merchant}/settlements`]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(text.includes("never-expose-this-preimage"), false);
      assert.equal(/"secret"\s*:/.test(text), false);
      assert.equal(response.headers.get("access-control-allow-credentials"), null);
    }
    for (const path of ["/api/v1/intents?limit=-1", "/api/v1/intents?limit=NaN", "/api/v1/intents?limit=10000", `/api/v1/merchants/${merchant}/settlements?from=NaN`, "/api/v1/merchants/not-an-address/settlements"]) assert.equal((await fetch(base + path)).status, 400);
    assert.equal((await fetch(base + "/api/v1/quote", { method: "POST", body: "not-json" })).status, 400);
    assert.equal((await fetch(base + "/api/v1/quote", { method: "POST", body: "x".repeat(70_000) })).status, 413);
    assert.equal((await fetch(base + "/api/v1/quote?amount=1.0000009")).status, 400);
    const csv = await (await fetch(base + `/api/v1/merchants/${merchant}/settlements?format=csv`)).text();
    assert.ok(csv.includes("'=SUM(1+1)"));
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); store.close(); }
});

test("quotes cannot offer unavailable Economy liquidity", async () => {
  const clients = [fujiPublicClient, arbSepoliaPublicClient, baseSepoliaPublicClient];
  const originals = clients.map((client) => client.readContract);
  for (const client of clients) Object.assign(client, { readContract: async () => 0n });
  const store = new RelayerStore(":memory:");
  const server = createRelayerHttpServer(store);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/quote?amount=3.50`);
    const data = await response.json();
    assert.equal(data.routes.lightning.available, false);
    assert.equal(data.routes.economy.available, false);
    assert.equal(data.routes.lightning.fee, "0.0105");
    assert.equal(data.routes.lightning.totalPayableDisplayUsd, "3.5105");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve())); store.close();
    clients.forEach((client, index) => Object.assign(client, { readContract: originals[index] }));
  }
});

test("expired escrow remains refundable until a real on-chain refund occurs", async () => {
  const original = fujiPublicClient.readContract;
  Object.assign(fujiPublicClient, { readContract: async ({ functionName }: { functionName: string }) => functionName === "isRefunded" ? false : { isFulfilled: false } });
  const store = new RelayerStore(":memory:");
  try {
    store.upsertIntentFromEvent({ intentId: `0x${"77".repeat(32)}`, sender, tokenIn: CONTRACTS.avalancheFuji.mockUsdc, amountIn: 3_500_000n, feePaid: 10_500n, targetChainId: 421614, receiver: merchant, tokenOut: CONTRACTS.arbitrumSepolia.mockUsdc, priority: Priority.SPEED, hashLock: lock, deadline: 1 });
    const result = await new PactSolver(store).processIntent(`0x${"77".repeat(32)}`);
    assert.equal(result?.state, "EXPIRED");
    assert.equal(store.getStateCounts().REFUNDED, 0);
    assert.equal(store.getRecoverableIntents().length, 1);
  } finally { Object.assign(fujiPublicClient, { readContract: original }); store.close(); }
});

const executeAbi = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "execMode", type: "bytes32" }, { name: "executionCalldata", type: "bytes" }], outputs: [] }] as const;
const single = (target: `0x${string}`, data: `0x${string}`, value = 0n) => encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [`0x${"00".repeat(32)}`, `${target}${value.toString(16).padStart(64, "0")}${data.slice(2)}`] });
const batch = (calls: readonly { target: `0x${string}`; value: bigint; callData: `0x${string}` }[]) => encodeFunctionData({ abi: executeAbi, functionName: "execute", args: [`0x${"01"}${"00".repeat(31)}`, encodeAbiParameters([{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }], [calls])] });
test("sponsorship permits only structurally decoded Pact calls", () => {
  const faucet = encodeFunctionData({ abi: MOCK_USDC_ABI, functionName: "faucet" });
  assert.doesNotThrow(() => validateSponsoredCalls(single(CONTRACTS.avalancheFuji.mockUsdc, faucet), sender));
  assert.throws(() => validateSponsoredCalls(single(merchant, faucet), sender));
  assert.throws(() => validateSponsoredCalls(single(CONTRACTS.avalancheFuji.mockUsdc, faucet, 1n), sender));
  const transfer = encodeFunctionData({ abi: MOCK_USDC_ABI, functionName: "transfer", args: [merchant, 1n] });
  assert.throws(() => validateSponsoredCalls(single(CONTRACTS.avalancheFuji.mockUsdc, transfer), sender));
  const withdraw = encodeFunctionData({ abi: PACT_ESCROW_ABI, functionName: "claimEscrow", args: [lock, "secret"] });
  assert.throws(() => validateSponsoredCalls(single(CONTRACTS.avalancheFuji.pactEscrow, withdraw), sender));
  const amount = 3_500_000n;
  const fee = 10_500n;
  const approve = encodeFunctionData({ abi: MOCK_USDC_ABI, functionName: "approve", args: [CONTRACTS.avalancheFuji.pactEscrow, amount + fee] });
  const createIntent = encodeFunctionData({ abi: PACT_ESCROW_ABI, functionName: "createIntent", args: [CONTRACTS.avalancheFuji.mockUsdc, amount, 421614n, merchant, CONTRACTS.arbitrumSepolia.mockUsdc, 0, lock, BigInt(Math.floor(Date.now() / 1000) + 900)] });
  assert.doesNotThrow(() => validateSponsoredCalls(batch([{ target: CONTRACTS.avalancheFuji.mockUsdc, value: 0n, callData: approve }, { target: CONTRACTS.avalancheFuji.pactEscrow, value: 0n, callData: createIntent }]), sender));
  const install = encodeFunctionData({ abi: [{ type: "function", name: "installModule", stateMutability: "payable", inputs: [{ name: "moduleType", type: "uint256" }, { name: "module", type: "address" }, { name: "initData", type: "bytes" }], outputs: [] }], functionName: "installModule", args: [1n, `0x${"66".repeat(20)}`, "0x"] });
  assert.doesNotThrow(() => validateSponsoredCalls(batch([{ target: CONTRACTS.avalancheFuji.mockUsdc, value: 0n, callData: approve }, { target: CONTRACTS.avalancheFuji.pactEscrow, value: 0n, callData: createIntent }, { target: sender, value: 0n, callData: install }]), sender));
  const overApproval = encodeFunctionData({ abi: MOCK_USDC_ABI, functionName: "approve", args: [CONTRACTS.avalancheFuji.pactEscrow, amount + fee + 1n] });
  assert.throws(() => validateSponsoredCalls(batch([{ target: CONTRACTS.avalancheFuji.mockUsdc, value: 0n, callData: overApproval }, { target: CONTRACTS.avalancheFuji.pactEscrow, value: 0n, callData: createIntent }]), sender));
  const wrongSetup = encodeFunctionData({ abi: [{ type: "function", name: "installModule", stateMutability: "payable", inputs: [{ name: "moduleType", type: "uint256" }, { name: "module", type: "address" }, { name: "initData", type: "bytes" }], outputs: [] }], functionName: "installModule", args: [2n, `0x${"66".repeat(20)}`, "0x"] });
  assert.throws(() => validateSponsoredCalls(batch([{ target: CONTRACTS.avalancheFuji.pactEscrow, value: 0n, callData: createIntent }, { target: sender, value: 0n, callData: wrongSetup }]), sender));
});

test("passkey registration, login signatures, and replay protection", () => {
  const store = new RelayerStore(":memory:");
  const service = new PasskeyService(store);
  const origin = "http://localhost:3000";
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const id = Buffer.from("test-credential-id");
  const options = service.options("register", { username: "Test account", rpID: "localhost" }, origin) as { userId: string; options: { challenge: string } };
  const client = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.options.challenge, origin }));
  const rpHash = createHash("sha256").update("localhost").digest();
  // COSE EC2 key: {1:2, 3:-7, -1:1, -2:x, -3:y}; numeric keys need numeric CBOR encoding.
  const x = Buffer.from(jwk.x!, "base64url"); const y = Buffer.from(jwk.y!, "base64url");
  const cose = Buffer.concat([Buffer.from("a5010203262001215820", "hex"), x, Buffer.from("225820", "hex"), y]);
  const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
  const auth = Buffer.concat([rpHash, Buffer.from([0x45, 0, 0, 0, 0]), Buffer.alloc(16), length, id, cose]);
  const attestation = encodeCbor({ fmt: "none", attStmt: {}, authData: new Uint8Array(auth) }, { as: "Bytes" });
  const body = { rpID: "localhost", userId: options.userId, cred: { id: id.toString("base64url"), type: "public-key", response: { clientDataJSON: client.toString("base64url"), attestationObject: Buffer.from(attestation).toString("base64url"), publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64url") } } };
  try {
    assert.deepEqual(service.verify("register", body, origin), { verified: true });
    assert.throws(() => service.verify("register", body, origin));
    const loginOptions = service.options("login", { rpID: "localhost" }, origin) as { challenge: string };
    const loginClient = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: loginOptions.challenge, origin }));
    const loginAuth = Buffer.concat([rpHash, Buffer.from([5, 0, 0, 0, 1])]);
    const signed = Buffer.concat([loginAuth, createHash("sha256").update(loginClient).digest()]);
    const login = { rpID: "localhost", cred: { id: id.toString("base64url"), type: "public-key", response: { clientDataJSON: loginClient.toString("base64url"), authenticatorData: loginAuth.toString("base64url"), signature: sign("sha256", signed, privateKey).toString("base64url") } } };
    const result = service.verify("login", login, origin) as { verification: { verified: boolean } };
    assert.equal(result.verification.verified, true);
    assert.throws(() => service.verify("login", login, origin));
    const forgedOptions = service.options("login", { rpID: "localhost" }, origin) as { challenge: string };
    login.cred.response.clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: forgedOptions.challenge, origin })).toString("base64url");
    assert.throws(() => service.verify("login", login, origin), /signature/);
    assert.throws(() => service.options("login", { rpID: "other-site.example" }, origin));
  } finally { store.close(); }
});
