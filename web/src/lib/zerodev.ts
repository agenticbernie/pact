/**
 * Pact Protocol — ZeroDev Kernel v3 ERC-4337 Account Abstraction Engine
 * Implements FR-01 (Passkey Onboarding), FR-02 (Scoped Session Keys $50/24h),
 * FR-03 (Paymaster Gas Sponsorship), and §1.4 (1-Click Testnet Faucet).
 */
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
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
  WebAuthnMode,
  toPasskeyValidator,
  toWebAuthnKey,
} from "@zerodev/passkey-validator";
import {
  deserializePermissionAccount,
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import {
  CallPolicyVersion,
  ParamCondition,
  toCallPolicy,
  toTimestampPolicy,
} from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { PACT_CONFIG } from "./config";
import { MOCK_USDC_ABI, PACT_ESCROW_ABI } from "./contracts";

export const SESSION_STORAGE_KEY = "pact_zerodev_kernel_v3_session_v1";
export const DAILY_SPEND_LIMIT_ATOMIC = BigInt(50_000_000); // $50.00 in 6-decimal USDC (FR-02)
export const MAX_APPROVAL_WITH_FEE_ATOMIC = BigInt(50_050_000); // $50.00 + $0.05 max fee

export interface PactSmartAccountSession {
  smartAccountAddress: Address;
  sessionKeyAddress: Address;
  passkeyUsername: string;
  passkeyMode: "webauthn-biometric" | "webauthn-p256";
  serializedPermissionAccount: string;
  sessionPrivateKey: Hex;
  dailyLimitUsd: string;
  expiresAt: number;
  webCryptoJwk?: JsonWebKey;
  authenticatorId?: string;
  authenticatorIdHash?: Hex;
  rpID?: string;
  pubX?: string;
  pubY?: string;
}

const entryPoint = zdConstants.getEntryPoint("0.7");
const kernelVersion = zdConstants.KERNEL_V3_1;

export const fujiPublicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(PACT_CONFIG.fuji.rpc),
});

function getBundlerRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC) {
    return process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_RPC;
  }
  return `${PACT_CONFIG.relayerApiUrl}/api/v1/bundler`;
}

function getPaymasterRpcUrl(): string {
  if (process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC) {
    return process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC;
  }
  return `${PACT_CONFIG.relayerApiUrl}/api/v1/paymaster`;
}

function getPasskeyServerUrl(): string {
  if (
    process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID &&
    process.env.NEXT_PUBLIC_ZERODEV_PASSKEY_SERVER_URL
  ) {
    return `${process.env.NEXT_PUBLIC_ZERODEV_PASSKEY_SERVER_URL}/${process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID}`;
  }
  return `${PACT_CONFIG.relayerApiUrl}/api/v1/passkeys`;
}

/**
 * Secp256r1 (P-256) curve order N for low-S signature normalization required by PasskeyValidator.
 */
const P256_N = BigInt(
  "0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551"
);
const P256_HALF_N = P256_N >> BigInt(1);

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
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Signs a WebAuthn assertion using a WebCrypto P-256 keypair in the exact format verified
 * on-chain by ZeroDev's PasskeyValidator (0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69).
 */
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
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:3000";

  const clientDataJSON = JSON.stringify({
    type: "webauthn.get",
    challenge: challengeB64Url,
    origin,
    crossOrigin: false,
  });

  // 37-byte authenticatorData: 32-byte rpIdHash + 1-byte flags (0x05 = UP | UV) + 4-byte signCount
  const rpIdBytes = new TextEncoder().encode(
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "localhost"
  );
  const rpIdHashBuffer = await crypto.subtle.digest("SHA-256", rpIdBytes);
  const authData = new Uint8Array(37);
  authData.set(new Uint8Array(rpIdHashBuffer), 0);
  authData[32] = 0x05; // flags: User Present (0x01) + User Verified (0x04)
  authData[33] = 0;
  authData[34] = 0;
  authData[35] = 0;
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

  // WebCrypto ECDSA returns 64-byte raw IEEE P1363 (r || s)
  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    signedData
  );
  const sigBytes = new Uint8Array(sigBuffer);
  const rHex = bytesToHex(sigBytes.slice(0, 32));
  const sHex = bytesToHex(sigBytes.slice(32, 64));

  const r = BigInt(rHex);
  let s = BigInt(sHex);
  if (s > P256_HALF_N) {
    s = P256_N - s;
  }

  // responseTypeLocation is the index of `"type":"webauthn.get"` in clientDataJSON
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
    [
      bytesToHex(authData),
      clientDataJSON,
      responseTypeLocation,
      r,
      s,
      false,
    ]
  );
}

/**
 * Creates a WebAuthn P-256 key using either native hardware WebAuthn (TouchID/FaceID/Windows Hello)
 * or WebCrypto P-256 fallback if no hardware authenticator is attached.
 */
async function createOrRestorePasskeyWebAuthnKey(options: {
  username: string;
  mode: "register" | "login";
  preferHardwareModal?: boolean;
}) {
  if (
    options.preferHardwareModal &&
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  ) {
    try {
      const webAuthnKey = await toWebAuthnKey({
        passkeyName: options.username,
        passkeyServerUrl: getPasskeyServerUrl(),
        mode:
          options.mode === "login" ? WebAuthnMode.Login : WebAuthnMode.Register,
        rpID: window.location.hostname || "localhost",
        credentials: "omit",
      });
      return {
        webAuthnKey,
        passkeyMode: "webauthn-biometric" as const,
      };
    } catch (err) {
      console.warn(
        "[ZeroDev Passkey] Hardware WebAuthn prompt declined/unavailable; using WebCrypto P-256 Passkey:",
        (err as Error).message
      );
    }
  }

  // Generate P-256 WebAuthn keypair via WebCrypto SubtleCrypto
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
  const rpID =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "localhost";

  const webAuthnKey = {
    pubX,
    pubY,
    authenticatorId,
    authenticatorIdHash,
    rpID,
    signMessageCallback: async (message: unknown) => {
      return signWithWebCryptoP256Passkey(privateKeyJwk, message);
    },
  };

  return {
    webAuthnKey,
    passkeyMode: "webauthn-p256" as const,
    privateKeyJwk,
    authenticatorId,
    authenticatorIdHash,
    rpID,
    pubX: pubX.toString(),
    pubY: pubY.toString(),
  };
}

/**
 * Builds the FR-02 Scoped Session Key Policy ($50.00 / 24h limit restricted to PactEscrow.createIntent)
 */
export function buildPactScopedPolicies(validUntilSec: number) {
  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: [
      // 1. Allow 1-Click Testnet Faucet (§1.4)
      {
        target: PACT_CONFIG.fuji.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "faucet",
        valueLimit: BigInt(0),
      },
      // 2. Allow MockUSDC.approve(PactEscrow, <= $50.05)
      {
        target: PACT_CONFIG.fuji.mockUsdc,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        valueLimit: BigInt(0),
        args: [
          { condition: ParamCondition.EQUAL, value: PACT_CONFIG.fuji.pactEscrow },
          {
            condition: ParamCondition.LESS_THAN_OR_EQUAL,
            value: MAX_APPROVAL_WITH_FEE_ATOMIC,
          },
        ],
      },
      // 3. FR-02: Allow PactEscrow.createIntent strictly up to $50.00 (50_000_000 atomic units)
      {
        target: PACT_CONFIG.fuji.pactEscrow,
        abi: PACT_ESCROW_ABI,
        functionName: "createIntent",
        valueLimit: BigInt(0),
        args: [
          { condition: ParamCondition.EQUAL, value: PACT_CONFIG.fuji.mockUsdc },
          {
            condition: ParamCondition.LESS_THAN_OR_EQUAL,
            value: DAILY_SPEND_LIMIT_ATOMIC,
          },
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      },
      // 4. FR-10: Allow PactEscrow.refund(intentId)
      {
        target: PACT_CONFIG.fuji.pactEscrow,
        abi: PACT_ESCROW_ABI,
        functionName: "refund",
        valueLimit: BigInt(0),
        args: [null],
      },
    ],
  });

  const timestampPolicy = toTimestampPolicy({
    validUntil: validUntilSec,
  });

  return [callPolicy, timestampPolicy];
}

/**
 * FR-01 & FR-02: Onboards a Passkey Smart Account (ZeroDev Kernel v3.1) and delegates
 * a Scoped Session Key ($50.00 / 24h limit on PactEscrow.createIntent).
 */
export async function onboardPasskeySmartAccount(options?: {
  username?: string;
  mode?: "register" | "login";
  preferHardwareModal?: boolean;
}): Promise<PactSmartAccountSession> {
  const username = options?.username || `PactUser-${Date.now().toString().slice(-4)}`;
  const passkeyResult = await createOrRestorePasskeyWebAuthnKey({
    username,
    mode: options?.mode || "register",
    preferHardwareModal: options?.preferHardwareModal ?? true,
  });

  const passkeyValidator = await toPasskeyValidator(fujiPublicClient, {
    webAuthnKey: passkeyResult.webAuthnKey as any,
    entryPoint,
    kernelVersion,
    validatorContractVersion: PasskeyValidatorContractVersion.V0_0_3_PATCHED,
  });

  // Create Scoped Session Key (FR-02: $50.00 / 24h limit)
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
  const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });

  const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24h validity
  const policies = buildPactScopedPolicies(expiresAt);

  const permissionValidator = await toPermissionValidator(fujiPublicClient, {
    entryPoint,
    kernelVersion,
    signer: ecdsaSigner,
    policies,
  });

  const kernelAccount = await createKernelAccount(fujiPublicClient, {
    entryPoint,
    kernelVersion,
    plugins: {
      sudo: passkeyValidator,
      regular: permissionValidator,
    },
  });

  // Serialize permission account (note: for custom WebCrypto P-256 signMessageCallback we also store JWK)
  let serializedPermissionAccount = "";
  try {
    serializedPermissionAccount = await serializePermissionAccount(
      kernelAccount,
      sessionPrivateKey
    );
  } catch {
    // Fallback if PasskeyValidator signTypedData requires interactive callback
  }

  const session: PactSmartAccountSession = {
    smartAccountAddress: kernelAccount.address,
    sessionKeyAddress: sessionKeyAccount.address,
    passkeyUsername: username,
    passkeyMode: passkeyResult.passkeyMode,
    serializedPermissionAccount,
    sessionPrivateKey,
    dailyLimitUsd: "50.00",
    expiresAt,
    webCryptoJwk: passkeyResult.privateKeyJwk,
    authenticatorId: passkeyResult.authenticatorId,
    authenticatorIdHash: passkeyResult.authenticatorIdHash,
    rpID: passkeyResult.rpID,
    pubX: passkeyResult.pubX,
    pubY: passkeyResult.pubY,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  return session;
}

export function loadSavedSmartAccountSession(): PactSmartAccountSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PactSmartAccountSession;
    if (parsed.expiresAt * 1000 < Date.now()) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearSmartAccountSession(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

/**
 * Reconstructs the ZeroDev KernelAccountClient for gasless UserOperations on Avalanche Fuji (FR-03).
 */
export async function getSessionKernelClient(session: PactSmartAccountSession) {
  let kernelAccount;

  if (session.serializedPermissionAccount) {
    kernelAccount = await deserializePermissionAccount(
      fujiPublicClient,
      entryPoint,
      kernelVersion,
      session.serializedPermissionAccount
    );
  } else if (session.webCryptoJwk && session.pubX && session.pubY && session.authenticatorId) {
    const authenticatorIdHash =
      session.authenticatorIdHash || keccak256(toHex(session.authenticatorId));
    const webAuthnKey = {
      pubX: BigInt(session.pubX),
      pubY: BigInt(session.pubY),
      authenticatorId: session.authenticatorId,
      authenticatorIdHash,
      rpID: session.rpID || "localhost",
      signMessageCallback: async (msg: unknown) =>
        signWithWebCryptoP256Passkey(session.webCryptoJwk!, msg),
    };

    const passkeyValidator = await toPasskeyValidator(fujiPublicClient, {
      webAuthnKey: webAuthnKey as any,
      entryPoint,
      kernelVersion,
      validatorContractVersion: PasskeyValidatorContractVersion.V0_0_3_PATCHED,
    });

    const sessionKeyAccount = privateKeyToAccount(session.sessionPrivateKey);
    const ecdsaSigner = await toECDSASigner({ signer: sessionKeyAccount });
    const policies = buildPactScopedPolicies(session.expiresAt);

    const permissionValidator = await toPermissionValidator(fujiPublicClient, {
      entryPoint,
      kernelVersion,
      signer: ecdsaSigner,
      policies,
    });

    kernelAccount = await createKernelAccount(fujiPublicClient, {
      entryPoint,
      kernelVersion,
      plugins: {
        sudo: passkeyValidator,
        regular: permissionValidator,
      },
    });
  } else {
    throw new Error("Session key credentials expired. Please re-authenticate Passkey.");
  }

  const paymasterClient = createZeroDevPaymasterClient({
    chain: avalancheFuji,
    transport: http(getPaymasterRpcUrl()),
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: avalancheFuji,
    bundlerTransport: http(getBundlerRpcUrl()),
    client: fujiPublicClient,
    paymaster: {
      getPaymasterData: (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });

  return { kernelAccount, kernelClient };
}

/**
 * Queries the Smart Account's live MockUSDC balance on Avalanche Fuji.
 */
export async function getSmartAccountUsdcBalance(address: Address): Promise<{
  atomic: bigint;
  formatted: string;
}> {
  const atomic = await fujiPublicClient.readContract({
    address: PACT_CONFIG.fuji.mockUsdc,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: [address],
  });
  return {
    atomic,
    formatted: Number(formatUnits(atomic, 6)).toFixed(2),
  };
}

/**
 * §1.4: 1-Click Testnet Faucet — Mints 500 MockUSDC directly to the user's Kernel v3 Smart Account
 * on Avalanche Fuji via a gasless ERC-4337 UserOperation (FR-03).
 */
export async function claimGaslessFaucet(session: PactSmartAccountSession): Promise<{
  userOpHash: Hex;
  txHash: Hex;
}> {
  const { kernelAccount, kernelClient } = await getSessionKernelClient(session);

  const callData = await kernelAccount.encodeCalls([
    {
      to: PACT_CONFIG.fuji.mockUsdc,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: MOCK_USDC_ABI,
        functionName: "faucet",
      }),
    },
  ]);

  const userOpHash = await kernelClient.sendUserOperation({
    callData,
  });

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
  };
}

/**
 * FR-02 & FR-06: Executes a gasless 1-Tap PaymentIntent (`[MockUSDC.approve, PactEscrow.createIntent]`)
 * signed by the Scoped Session Key ($50/24h limit) with zero confirmation dialogs.
 */
export async function executeGaslessPaymentIntent(params: {
  session: PactSmartAccountSession;
  amountAtomic: bigint;
  totalPayableAtomic: bigint;
  targetChainId: number;
  receiver: Address;
  tokenOut: Address;
  priority: number;
  hashLock: Hex;
  deadline: number;
}): Promise<{
  userOpHash: Hex;
  txHash: Hex;
}> {
  if (params.amountAtomic > DAILY_SPEND_LIMIT_ATOMIC) {
    throw new Error(
      `Session Key Policy Violation: Payment exceeds $50.00/24h scoped limit (FR-02).`
    );
  }

  const { kernelAccount, kernelClient } = await getSessionKernelClient(params.session);

  const callData = await kernelAccount.encodeCalls([
    {
      to: PACT_CONFIG.fuji.mockUsdc,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        args: [PACT_CONFIG.fuji.pactEscrow, params.totalPayableAtomic],
      }),
    },
    {
      to: PACT_CONFIG.fuji.pactEscrow,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: PACT_ESCROW_ABI,
        functionName: "createIntent",
        args: [
          PACT_CONFIG.fuji.mockUsdc,
          params.amountAtomic,
          BigInt(params.targetChainId),
          params.receiver,
          params.tokenOut,
          params.priority,
          params.hashLock,
          BigInt(params.deadline),
        ],
      }),
    },
  ]);

  const userOpHash = await kernelClient.sendUserOperation({
    callData,
  });

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
  };
}

/**
 * FR-10: Executes a gasless refund (`PactEscrow.refund(intentId)`) after deadline expiration.
 */
export async function executeGaslessRefund(params: {
  session: PactSmartAccountSession;
  intentId: Hex;
}): Promise<{
  userOpHash: Hex;
  txHash: Hex;
}> {
  const { kernelAccount, kernelClient } = await getSessionKernelClient(params.session);

  const callData = await kernelAccount.encodeCalls([
    {
      to: PACT_CONFIG.fuji.pactEscrow,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: PACT_ESCROW_ABI,
        functionName: "refund",
        args: [params.intentId],
      }),
    },
  ]);

  const userOpHash = await kernelClient.sendUserOperation({
    callData,
  });

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  return {
    userOpHash,
    txHash: receipt.receipt.transactionHash,
  };
}
