/**
 * Pact Protocol — Dynamic QR JSON Schema Validator & Types (§3.2.3)
 * Schema MIME: application/vnd.pact.payment+json
 */

export type SupportedTargetChainId = 421614 | 84532;

export interface PactPaymentRequest {
  protocol: "pact";
  version?: "1.0";
  orderId: string;
  merchant: `0x${string}`;
  targetChainId: SupportedTargetChainId;
  targetToken: "USDC";
  amount: string;
  timestamp?: number;
}

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_REGEX = /^[0-9]+(\.[0-9]{1,6})?$/;

export function parsePactQrPayload(raw: string): PactPaymentRequest {
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid QR payload: not a JSON object");
  }
  if (parsed.protocol !== "pact") {
    throw new Error("Invalid QR payload: protocol must be 'pact'");
  }
  if (parsed.version !== undefined && parsed.version !== "1.0") {
    throw new Error("Invalid QR payload: unsupported version");
  }
  if (typeof parsed.orderId !== "string" || parsed.orderId.trim().length === 0) {
    throw new Error("Invalid QR payload: missing orderId");
  }
  if (typeof parsed.merchant !== "string" || !ETH_ADDRESS_REGEX.test(parsed.merchant)) {
    throw new Error("Invalid QR payload: invalid merchant address");
  }
  if (parsed.targetChainId !== 421614 && parsed.targetChainId !== 84532) {
    throw new Error("Invalid QR payload: targetChainId must be 421614 (Arbitrum Sepolia) or 84532 (Base Sepolia)");
  }
  if (parsed.targetToken !== "USDC") {
    throw new Error("Invalid QR payload: targetToken must be 'USDC'");
  }
  if (typeof parsed.amount !== "string" || !AMOUNT_REGEX.test(parsed.amount) || Number(parsed.amount) <= 0) {
    throw new Error("Invalid QR payload: invalid amount");
  }

  return {
    protocol: "pact",
    version: parsed.version ?? "1.0",
    orderId: parsed.orderId,
    merchant: parsed.merchant as `0x${string}`,
    targetChainId: parsed.targetChainId as SupportedTargetChainId,
    targetToken: "USDC",
    amount: parsed.amount,
    timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : undefined,
  };
}
