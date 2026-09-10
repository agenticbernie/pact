import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import { z } from "zod";
import { DomainError } from "./errors.js";
import type {
  AdvanceTestnetConfig,
  AgentIntent,
  MerchantCatalog,
  NetworkObservation,
  OpenAIConfig,
} from "./types.js";

const UINT256_MAX = (1n << 256n) - 1n;
const UINT32_MAX = 4294967295;
const POLICY_VERSION_MAX = UINT32_MAX;

/** Canonical native-verifier precompile: a protocol constant, not a deployment. */
export const VERIFIER_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000FD2";

/** Chain IDs whose EVM hosts the native verifier precompile (mirrors the pinned ASC package). */
export const CREDITCOIN_CHAIN_IDS: readonly number[] = [102030, 102031, 102032];

/** Chain IDs that must never be treated as disposable testnet identity. */
const UNSAFE_CHAIN_IDS = new Set([1, 10, 56, 100, 137, 250, 8453, 42161, 43114, 59144, 534352]);

const DENY_LIST_KEYS = new Set(
  ["recipient", "recipientaddress", "calldata", "privatekey", "apikey", "secret", "token"].map(
    (key) => key.toLowerCase(),
  ),
);

function findDeniedKey(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findDeniedKey(value[index], `${path}[${index}]`);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (DENY_LIST_KEYS.has(key.toLowerCase())) {
        return path === "" ? key : `${path}.${key}`;
      }
      const found = findDeniedKey(entry, path === "" ? key : `${path}.${key}`);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

function assertNoDeniedKeys(input: unknown): void {
  const found = findDeniedKey(input, "");
  if (found !== null) {
    throw new DomainError("SECRET_FIELD_REJECTED", "Forbidden secret-bearing field rejected.", {
      field: found,
    });
  }
}

function toDomainError(error: z.ZodError): DomainError {
  const issues = error.issues.map((issue) => issue.path.join(".") || "(root)").join(",");
  return new DomainError("INTENT_SCHEMA_INVALID", "Agent intent failed strict validation.", {
    issues,
  });
}

const decimalUint256 = (allowZero: boolean) =>
  z
    .string()
    .regex(allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/, "canonical decimal base units")
    .refine((value) => {
      try {
        const parsed = BigInt(value);
        return parsed <= UINT256_MAX;
      } catch {
        return false;
      }
    }, "uint256 bounds");

const agentAddressSchema = z
  .string()
  .refine((value) => isAddress(value), "EVM address")
  .refine((value) => value.toLowerCase() !== ZeroAddress, "non-zero agent")
  .transform((value) => getAddress(value));

const merchantIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "kebab-case merchant ID")
  .max(64);

const utcTimestampSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    return false;
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    return false;
  }
  const date = new Date(millis);
  const [datePart, timePart] = value.split("T") as [string, string];
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.slice(0, 8).split(":").map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}, "canonical UTC RFC3339 timestamp");

export const AgentIntentSchema = z
  .object({
    intentId: z.string().min(1).max(128),
    agentId: agentAddressSchema,
    cardId: decimalUint256(true),
    merchantId: merchantIdSchema,
    amountBaseUnits: decimalUint256(false),
    asset: z.literal("native-testnet-ctc"),
    purpose: z.string().min(1).max(160),
    confidence: z.number().min(0).max(1),
    provider: z.literal("openai"),
    model: z.literal("gpt-5.6-luna"),
    createdAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    policyVersion: z.number().int().min(0).max(POLICY_VERSION_MAX),
    intentHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "bytes32 intent hash"),
  })
  .strict()
  .superRefine((intent, context) => {
    if (Date.parse(intent.expiresAt) <= Date.parse(intent.createdAt)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "expiry must be after creation" });
    }
  });

/** Strict intent parse. Unknown keys are rejected, never stripped. */
export function parseAgentIntent(input: unknown): AgentIntent {
  assertNoDeniedKeys(input);
  const result = AgentIntentSchema.safeParse(input);
  if (!result.success) {
    throw toDomainError(result.error);
  }
  return result.data;
}

/** Pure merchant catalog: data is injected, never hard-coded. The on-chain registry stays authoritative. */
export function createMerchantCatalog(ids: readonly string[]): MerchantCatalog {
  return { ids: [...ids] };
}

export function assertMerchantAllowed(catalog: MerchantCatalog, merchantId: string): void {
  if (!catalog.ids.includes(merchantId)) {
    throw new DomainError("MERCHANT_NOT_ALLOWLISTED", "Merchant is not in the catalog.", {
      merchantId,
    });
  }
}

const httpsUrlSchema = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "absolute HTTPS URL");

const evmAddressSchema = z.string().refine((value) => isAddress(value), "EVM address");

const AdvanceTestnetConfigSchema = z
  .object({
    protocol: z.literal("creditcoin-evm"),
    label: z.literal("advance-testnet"),
    rpcUrl: httpsUrlSchema,
    chainId: z.number().int().min(0).max(UINT32_MAX),
    explorerUrl: httpsUrlSchema,
    nativeAsset: z
      .object({
        id: z.literal("native-testnet-ctc"),
        evmAddress: evmAddressSchema,
        symbol: z.string().min(1).max(16),
        decimals: z.number().int().min(0).max(255),
      })
      .strict(),
    asc: z
      .object({
        verifierPrecompile: evmAddressSchema,
        evmV1DecoderLibrary: evmAddressSchema,
      })
      .strict(),
    verified: z.boolean(),
  })
  .strict()
  .superRefine((config, context) => {
    if (UNSAFE_CHAIN_IDS.has(config.chainId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "unsafe mainnet chain ID" });
    }
  });

function readJsonInput(input: unknown): unknown {
  if (typeof input === "string" || input instanceof URL) {
    const path = typeof input === "string" ? input : fileURLToPath(input);
    try {
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      throw new DomainError("NETWORK_CONFIG_INVALID", "Network config is not readable JSON.", {
        reason: "unreadable-config",
      });
    }
  }
  return input;
}

/** Static config parsing only. A parsed `verified: true` is never trusted without `assertDeploymentReady`. */
export function parseAdvanceTestnetConfig(input: unknown): AdvanceTestnetConfig {
  const result = AdvanceTestnetConfigSchema.safeParse(input);
  if (!result.success) {
    throw new DomainError("NETWORK_CONFIG_INVALID", "Advance Testnet config is invalid.", {
      reason: "schema-rejected",
    });
  }
  return result.data;
}

export function loadAdvanceTestnetConfig(input: string | URL | unknown): AdvanceTestnetConfig {
  return parseAdvanceTestnetConfig(readJsonInput(input));
}

/**
 * The only path that can accept `verified === true`: static config plus a
 * live observation with matching allowlisted chain identity, the canonical
 * verifier precompile identity (zero bytecode is valid for a precompile by
 * design — never probed), a compile-time decoder acknowledgment (zero address;
 * no decoder deployment exists), and bytecode evidence for every real external
 * contract dependency. Details are redacted to reason codes — values never
 * leave this boundary.
 */
export function assertDeploymentReady(
  config: AdvanceTestnetConfig,
  observation: NetworkObservation,
): void {
  const reasons: Array<[boolean, string, Record<string, string>]> = [
    [config.verified === true, "unverified", {}],
    [config.chainId > 0, "chain-unresolved", {}],
    [
      observation.rpcChainId === config.chainId,
      "chain-mismatch",
      {
        expectedChainId: String(config.chainId),
        observedChainId: String(observation.rpcChainId),
      },
    ],
    [
      CREDITCOIN_CHAIN_IDS.includes(observation.rpcChainId),
      "chain-not-allowlisted",
      { observedChainId: String(observation.rpcChainId) },
    ],
    [
      isAddress(observation.verifierAddress)
        && observation.verifierAddress.toLowerCase() === VERIFIER_PRECOMPILE_ADDRESS.toLowerCase(),
      "verifier-identity-mismatch",
      {},
    ],
    [
      isAddress(config.asc.verifierPrecompile)
        && config.asc.verifierPrecompile.toLowerCase() === VERIFIER_PRECOMPILE_ADDRESS.toLowerCase(),
      "verifier-not-canonical",
      {},
    ],
    [
      config.asc.evmV1DecoderLibrary.toLowerCase() === ZeroAddress.toLowerCase(),
      "decoder-not-compile-time",
      {},
    ],
  ];
  for (const [ok, reason, details] of reasons) {
    if (!ok) {
      throw new DomainError("NETWORK_CONFIG_INVALID", "Advance Testnet is not deployment-ready.", {
        reason,
        ...details,
      });
    }
  }
  for (const external of observation.externalContracts ?? []) {
    if (!isAddress(external.address)) {
      throw new DomainError("NETWORK_CONFIG_INVALID", "Advance Testnet is not deployment-ready.", {
        reason: "external-invalid-address",
        contract: external.label,
      });
    }
    if (external.hasBytecode !== true) {
      throw new DomainError("NETWORK_CONFIG_INVALID", "Advance Testnet is not deployment-ready.", {
        reason: "external-no-bytecode",
        contract: external.label,
      });
    }
  }
}

const OpenAIConfigSchema = z
  .object({
    provider: z.literal("openai"),
    model: z.literal("gpt-5.6-luna"),
    region: z.string().min(1),
    allowFallback: z.literal(false),
  })
  .strict();

/** Strict loader: any provider/model substitution in config is rejected at load. */
export function loadOpenAIConfig(input: string | URL | unknown): OpenAIConfig {
  const result = OpenAIConfigSchema.safeParse(readJsonInput(input));
  if (!result.success) {
    throw new DomainError("AI_CONFIG_INVALID", "OpenAI provider config is invalid.", {
      reason: "schema-rejected",
    });
  }
  return result.data;
}

/** Runtime guard: the environment may leave the model unset, but never substitute it silently. */
export function resolveOpenAIModel(config: OpenAIConfig): "gpt-5.6-luna" {
  const override = process.env["OPENAI_MODEL"];
  if (override !== undefined && override !== config.model) {
    throw new DomainError("AI_CONFIG_INVALID", "Model substitution rejected.", {
      env: "OPENAI_MODEL",
    });
  }
  return config.model;
}
