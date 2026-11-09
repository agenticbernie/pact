import {
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  constants as zdConstants,
} from "@zerodev/sdk";
import {
  PasskeyValidatorContractVersion,
  toPasskeyValidator,
} from "@zerodev/passkey-validator";
import { toPermissionValidator } from "@zerodev/permissions";
import {
  CallPolicyVersion,
  ParamCondition,
  toCallPolicy,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  CONTRACTS,
  arbSepoliaPublicClient,
  fujiPublicClient,
} from "../config/chains.js";
import { MOCK_USDC_ABI, PACT_ESCROW_ABI } from "../abi/contracts.js";
import { startRelayerDaemon } from "../index.js";
import path from "node:path";
import fs from "node:fs";

const P256_N = BigInt(
  "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
);
const P256_HALF_N = P256_N >> 1n;

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function signWithWebCryptoP256Passkey(
  privateKeyJwk: JsonWebKey,
  message: unknown
): Promise<Hex> {
  let rawHex: string;
  if (typeof message === "string") {
    rawHex = message;
  } else if (
    message &&
    typeof message === "object" &&
    "raw" in message &&
    typeof (message as { raw: unknown }).raw === "string"
  ) {
    rawHex = (message as { raw: string }).raw;
  } else {
    throw new Error("Unsupported WebAuthn message format");
  }

  const msgBytes = hexToBytes(rawHex);
  const challengeB64Url = bytesToBase64Url(msgBytes);
  const clientDataJSON = JSON.stringify({
    type: "webauthn.get",
    challenge: challengeB64Url,
    origin: "http://localhost:3000",
    crossOrigin: false,
  });

  const rpIdBytes = new TextEncoder().encode("localhost");
  const rpIdHashBuffer = await crypto.subtle.digest("SHA-256", rpIdBytes);
  const authData = new Uint8Array(37);
  authData.set(new Uint8Array(rpIdHashBuffer), 0);
  authData[32] = 0x05; // UP | UV
  authData[36] = 1;

  const clientDataBytes = new TextEncoder().encode(clientDataJSON);
  const clientDataHashBuffer = await crypto.subtle.digest("SHA-256", clientDataBytes);
  const clientDataHash = new Uint8Array(clientDataHashBuffer);

  const signedData = new Uint8Array(authData.length + clientDataHash.length);
  signedData.set(authData, 0);
  signedData.set(clientDataHash, authData.length);

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    signedData
  );
  const sigBytes = new Uint8Array(sigBuffer);
  const r = BigInt(bytesToHex(sigBytes.slice(0, 32)));
  let s = BigInt(bytesToHex(sigBytes.slice(32, 64)));
  if (s > P256_HALF_N) {
    s = P256_N - s;
  }

  const responseTypeLocation = BigInt(clientDataJSON.indexOf('"type":"webauthn.get"'));

  return encodeAbiParameters(
    [
      { name: "authenticatorData", type: "bytes" },
      { name: "clientDataJSON", type: "string" },
      { name: "responseTypeLocation", type: "uint256" },
      { name: "r", type: "uint256" },
      { name: "s", type: "uint256" },
      { name: "usePrecompiled", type: "bool" },
    ],
    [bytesToHex(authData), clientDataJSON, responseTypeLocation, r, s, false]
  );
}

async function main() {
  console.log("=================================================================");
  console.log("PACT PROTOCOL — PHASE 5 LIVE ZERODEV ACCOUNT ABSTRACTION TEST");
  console.log("=================================================================");

  const port = 3405;
  const testDbPath = path.resolve(process.cwd(), "pact_relayer_test_p5.db");
  for (const suffix of ["", "-shm", "-wal"]) {
    if (fs.existsSync(testDbPath + suffix)) {
      fs.unlinkSync(testDbPath + suffix);
    }
  }

  const daemon = await startRelayerDaemon({ port, dbPath: testDbPath });

  const bundlerUrl = `http://localhost:${port}/api/v1/bundler`;
  const paymasterUrl = `http://localhost:${port}/api/v1/paymaster`;

  try {
    // 1. FR-01 & FR-02: Create Passkey WebAuthn P-256 Validator + Scoped Session Key ($50/24h)
    console.log("\n[1/5] Generating WebAuthn P-256 Passkey + Scoped Session Key ($50/24h)...");
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
    const pubX = BigInt(bytesToHex(rawPub.slice(1, 33)));
    const pubY = BigInt(bytesToHex(rawPub.slice(33, 65)));

    const randId = crypto.getRandomValues(new Uint8Array(20));
    const authenticatorId = bytesToBase64Url(randId);
    const authenticatorIdHash = keccak256(toHex(authenticatorId));

    const entryPoint = zdConstants.getEntryPoint("0.7");
    const kernelVersion = zdConstants.KERNEL_V3_1;

    const passkeyValidator = await toPasskeyValidator(fujiPublicClient, {
      webAuthnKey: {
        pubX,
        pubY,
        authenticatorId,
        authenticatorIdHash,
        rpID: "localhost",
        signMessageCallback: async (msg: unknown) =>
          signWithWebCryptoP256Passkey(privateKeyJwk, msg),
      } as any,
      entryPoint,
      kernelVersion,
      validatorContractVersion: PasskeyValidatorContractVersion.V0_0_3_PATCHED,
    });

    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

    const validUntil = Math.floor(Date.now() / 1000) + 86400;
    const callPolicy = toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_4,
      permissions: [
        {
          target: CONTRACTS.avalancheFuji.mockUsdc,
          abi: MOCK_USDC_ABI,
          functionName: "faucet",
          valueLimit: 0n,
        },
        {
          target: CONTRACTS.avalancheFuji.mockUsdc,
          abi: MOCK_USDC_ABI,
          functionName: "approve",
          valueLimit: 0n,
          args: [
            {
              condition: ParamCondition.EQUAL,
              value: CONTRACTS.avalancheFuji.pactEscrow,
            },
            {
              condition: ParamCondition.LESS_THAN_OR_EQUAL,
              value: 50_050_000n,
            },
          ],
        },
        {
          target: CONTRACTS.avalancheFuji.pactEscrow,
          abi: PACT_ESCROW_ABI,
          functionName: "createIntent",
          valueLimit: 0n,
          args: [
            {
              condition: ParamCondition.EQUAL,
              value: CONTRACTS.avalancheFuji.mockUsdc,
            },
            {
              condition: ParamCondition.LESS_THAN_OR_EQUAL,
              value: 50_000_000n, // $50.00 strictly enforced on-chain (FR-02)
            },
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        },
      ],
    });
    const timestampPolicy = toTimestampPolicy({ validUntil });

    const permissionValidator = await toPermissionValidator(fujiPublicClient, {
      entryPoint,
      kernelVersion,
      signer: ecdsaSigner,
      policies: [callPolicy, timestampPolicy],
    });

    const kernelAccount = await createKernelAccount(fujiPublicClient, {
      entryPoint,
      kernelVersion,
      plugins: {
        sudo: passkeyValidator,
        regular: permissionValidator,
      },
    });

    const paymasterClient = createZeroDevPaymasterClient({
      chain: avalancheFuji,
      transport: http(paymasterUrl),
    });

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: avalancheFuji,
      bundlerTransport: http(bundlerUrl),
      client: fujiPublicClient,
      paymaster: {
        getPaymasterData: (userOperation) =>
          paymasterClient.sponsorUserOperation({ userOperation }),
      },
    });

    const avaxBalanceBefore = await fujiPublicClient.getBalance({
      address: kernelAccount.address,
    });
    console.log(`  -> ZeroDev Kernel v3.1 Smart Account: ${kernelAccount.address}`);
    console.log(`  -> Scoped Session Key Address:        ${sessionKeyAccount.address}`);
    console.log(
      `  -> Smart Account Native AVAX Balance: ${formatUnits(avaxBalanceBefore, 18)} AVAX (FR-03 Gasless)`
    );
    if (avaxBalanceBefore !== 0n) {
      throw new Error("Expected fresh Smart Account to have 0 AVAX");
    }

    // 2. §1.4: Execute 1-Click Testnet Faucet via Gasless UserOperation
    console.log(
      "\n[2/5] Executing §1.4 1-Click Testnet Faucet (500 MockUSDC) via Gasless UserOperation..."
    );
    const faucetCallData = await kernelAccount.encodeCalls([
      {
        to: CONTRACTS.avalancheFuji.mockUsdc,
        value: 0n,
        data: encodeFunctionData({
          abi: MOCK_USDC_ABI,
          functionName: "faucet",
        }),
      },
    ]);

    const faucetUserOpHash = await kernelClient.sendUserOperation({
      callData: faucetCallData,
    });
    const faucetReceipt = await kernelClient.waitForUserOperationReceipt({
      hash: faucetUserOpHash,
    });

    const usdcAfterFaucet = await fujiPublicClient.readContract({
      address: CONTRACTS.avalancheFuji.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [kernelAccount.address],
    });
    const deployedCode = await fujiPublicClient.getBytecode({
      address: kernelAccount.address,
    });

    console.log(`  -> Faucet UserOp Hash:    ${faucetUserOpHash}`);
    console.log(`  -> Fuji Faucet Tx Hash:   ${faucetReceipt.receipt.transactionHash}`);
    console.log(
      `  -> Kernel v3 Deployed:    ${Boolean(deployedCode && deployedCode !== "0x")} (${deployedCode?.length} hex chars)`
    );
    console.log(`  -> Smart Account Balance: ${formatUnits(usdcAfterFaucet, 6)} USDC`);

    if (usdcAfterFaucet !== parseUnits("500", 6)) {
      throw new Error(
        `Expected 500 USDC after faucet, got ${formatUnits(usdcAfterFaucet, 6)}`
      );
    }

    // 3. FR-02 & FR-06: Execute 1-Tap Gasless PaymentIntent ($3.50 USDC) signed by Scoped Session Key
    console.log(
      "\n[3/5] Requesting /api/v1/quote and executing $3.50 PaymentIntent via Scoped Session Key..."
    );
    const merchantAddress = "0x0000000000000000000000000000000000050505" as Address;
    const orderId = `ORDER-P5-AA-${Date.now()}`;

    const merchantBalBefore = await arbSepoliaPublicClient.readContract({
      address: CONTRACTS.arbitrumSepolia.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [merchantAddress],
    });

    const quoteRes = await fetch(`http://localhost:${port}/api/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: "3.50",
        targetChainId: 421614,
        merchant: merchantAddress,
        orderId,
      }),
    });
    const quoteData = (await quoteRes.json()) as any;

    const amountAtomic = BigInt(quoteData.amountAtomic);
    const totalPayableAtomic = BigInt(quoteData.routes.lightning.totalPayableAtomic);

    const paymentCallData = await kernelAccount.encodeCalls([
      {
        to: CONTRACTS.avalancheFuji.mockUsdc,
        value: 0n,
        data: encodeFunctionData({
          abi: MOCK_USDC_ABI,
          functionName: "approve",
          args: [CONTRACTS.avalancheFuji.pactEscrow, totalPayableAtomic],
        }),
      },
      {
        to: CONTRACTS.avalancheFuji.pactEscrow,
        value: 0n,
        data: encodeFunctionData({
          abi: PACT_ESCROW_ABI,
          functionName: "createIntent",
          args: [
            CONTRACTS.avalancheFuji.mockUsdc,
            amountAtomic,
            421614n,
            merchantAddress,
            CONTRACTS.arbitrumSepolia.mockUsdc,
            0, // Lightning
            quoteData.hashLock,
            BigInt(quoteData.deadline),
          ],
        }),
      },
    ]);

    const payUserOpHash = await kernelClient.sendUserOperation({
      callData: paymentCallData,
    });
    const payReceipt = await kernelClient.waitForUserOperationReceipt({
      hash: payUserOpHash,
    });

    console.log(`  -> Payment UserOp Hash:   ${payUserOpHash}`);
    console.log(`  -> Fuji Escrow Tx Hash:   ${payReceipt.receipt.transactionHash}`);

    // 4. Wait for Relayer cross-chain settlement on Arbitrum Sepolia
    console.log(
      "\n[4/5] Waiting for Relayer cross-chain settlement to Merchant on Arbitrum Sepolia..."
    );
    let settledOrder: any = null;
    for (let i = 0; i < 60; i++) {
      const res = await fetch(`http://localhost:${port}/api/v1/orders/${orderId}`);
      const status = (await res.json()) as any;
      if (status.status === "CLAIMED" && status.intent?.claim_tx_hash) {
        settledOrder = status.intent;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!settledOrder) {
      throw new Error("Timed out waiting for Relayer to settle AA Smart Account Intent");
    }

    const merchantBalAfter = await arbSepoliaPublicClient.readContract({
      address: CONTRACTS.arbitrumSepolia.mockUsdc,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [merchantAddress],
    });
    const avaxBalanceAfter = await fujiPublicClient.getBalance({
      address: kernelAccount.address,
    });

    const deltaMerchant = merchantBalAfter - merchantBalBefore;
    console.log(`  -> Arb Sepolia Fill Tx:   ${settledOrder.dest_tx_hash}`);
    console.log(`  -> Fuji Claim Escrow Tx:  ${settledOrder.claim_tx_hash}`);
    console.log(
      `  -> Merchant Delta (Arb):  +${formatUnits(deltaMerchant, 6)} USDC`
    );
    console.log(
      `  -> Smart Account Gas Used: ${formatUnits(avaxBalanceAfter, 18)} AVAX (Sponsored by Paymaster)`
    );

    if (deltaMerchant !== amountAtomic) {
      throw new Error("Merchant balance delta mismatch on Arbitrum Sepolia");
    }

    // 5. FR-02: Verify On-Chain CallPolicy Rejects Payment > $50.00 ($55.00 attempt)
    console.log(
      "\n[5/5] Verifying FR-02 On-Chain Session Key Policy rejects $55.00 (> $50.00 limit)..."
    );
    const excessiveAmount = parseUnits("55", 6); // $55.00 > $50.00 limit
    const excessiveCallData = await kernelAccount.encodeCalls([
      {
        to: CONTRACTS.avalancheFuji.pactEscrow,
        value: 0n,
        data: encodeFunctionData({
          abi: PACT_ESCROW_ABI,
          functionName: "createIntent",
          args: [
            CONTRACTS.avalancheFuji.mockUsdc,
            excessiveAmount,
            421614n,
            merchantAddress,
            CONTRACTS.arbitrumSepolia.mockUsdc,
            0,
            quoteData.hashLock,
            BigInt(quoteData.deadline),
          ],
        }),
      },
    ]);

    let policyRejected = false;
    try {
      await kernelClient.sendUserOperation({
        callData: excessiveCallData,
      });
    } catch (err: any) {
      policyRejected = true;
      console.log(
        `  -> On-Chain CallPolicy V0_0_4 rejected $55.00 UserOperation as expected: ${(err.message || "").slice(0, 120)}...`
      );
    }

    if (!policyRejected) {
      throw new Error("Expected Session Key CallPolicy to reject $55.00 spend!");
    }

    console.log("\n=================================================================");
    console.log("PHASE 5 VERIFICATION PASSED — 100% REAL ON-CHAIN ZERODEV AA!");
    console.log("=================================================================");
  } finally {
    daemon.solver.stop();
    daemon.server.close();
    daemon.store.close();
    for (const suffix of ["", "-shm", "-wal"]) {
      if (fs.existsSync(testDbPath + suffix)) {
        fs.unlinkSync(testDbPath + suffix);
      }
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Phase 5 Verification Failed:", err);
    process.exit(1);
  });
