/** Validation shared by the scanner and payment forms. Amounts are decimal USDC strings. */
export type SupportedTargetChainId = 421614 | 84532 | 43113;

export interface PactPaymentRequest {
  protocol: "pact";
  version?: "1.0";
  orderId: string;
  merchant: `0x${string}`;
  targetChainId: SupportedTargetChainId;
  targetToken: "USDC";
  amount: string;
  timestamp?: number;
  editable?: boolean;
}

export const MIN_PAYMENT_USDC = 1;
export const MAX_PAYMENT_USDC = 50;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_REGEX = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/;

export function isPaymentAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && ADDRESS_REGEX.test(value) && !/^0x0{40}$/i.test(value);
}

export function isSupportedChain(value: unknown): value is SupportedTargetChainId {
  return value === 421614 || value === 84532 || value === 43113;
}

export function isUsdcAmount(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_REGEX.test(value);
}

export function paymentAmountError(value: string): string | null {
  if (!isUsdcAmount(value) || Number(value) <= 0) return "Enter a valid USDC amount (up to 6 decimal places).";
  if (Number(value) < MIN_PAYMENT_USDC) return "Gas-sponsored payments start at 1 USDC.";
  if (Number(value) > MAX_PAYMENT_USDC) return "The session key allows up to 50 USDC per payment.";
  return null;
}

export function createOrderId(prefix = "ORD"): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function parsePactQrPayload(raw: string): PactPaymentRequest {
  const trimmed = raw.trim();
  if (trimmed.length > 4096) throw new Error("This QR payload is too large.");
  let address = trimmed;
  let chainId: SupportedTargetChainId = 421614;

  if (/^ethereum:/i.test(trimmed)) {
    const match = /^ethereum:(?:pay-)?(0x[a-fA-F0-9]{40})(?:@(\d+))?(?:\?(.*))?$/i.exec(trimmed);
    if (!match) throw new Error("Use a recipient-address QR or a Pact USDC QR, not a contract-call QR.");
    address = match[1];
    if (match[2]) {
      const requestedChain = Number(match[2]);
      if (!isSupportedChain(requestedChain)) throw new Error("This QR requests an unsupported network. Use a supported testnet.");
      chainId = requestedChain;
    }
    if (match[3] && [...new URLSearchParams(match[3]).keys()].length > 0) {
      throw new Error("This QR requests a different asset or transaction. Use a Pact USDC QR or a plain wallet address.");
    }
  }

  if (isPaymentAddress(address)) {
    return {
      protocol: "pact", version: "1.0", orderId: createOrderId("P2P"),
      merchant: address, targetChainId: chainId, targetToken: "USDC", amount: "0", editable: true,
    };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error("Not a supported wallet address or Pact payment QR."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The QR must contain a Pact payment request.");
  const data = parsed as Record<string, unknown>;
  if (data.protocol !== "pact" || (data.version !== undefined && data.version !== "1.0")) throw new Error("Unsupported Pact QR protocol or version.");
  if (!isPaymentAddress(data.merchant)) throw new Error("The QR contains an invalid or zero recipient address.");
  if (!isSupportedChain(data.targetChainId)) throw new Error("The QR requests an unsupported destination network.");
  if (data.targetToken !== "USDC") throw new Error("Only USDC payments are supported.");
  const amount = data.amount === undefined ? "0" : data.amount;
  if (!isUsdcAmount(amount)) throw new Error("The QR contains an invalid USDC amount.");
  if (data.orderId !== undefined && (typeof data.orderId !== "string" || !data.orderId.trim() || data.orderId.length > 200 || /[\x00-\x1f]/.test(data.orderId))) throw new Error("The QR contains an invalid order ID.");
  let timestamp: number | undefined;
  if (data.timestamp !== undefined) {
    if (typeof data.timestamp !== "number" || !Number.isSafeInteger(data.timestamp) || data.timestamp <= 0) throw new Error("The QR contains an invalid timestamp.");
    timestamp = data.timestamp > 10_000_000_000 ? Math.floor(data.timestamp / 1000) : data.timestamp;
    if (timestamp > Math.floor(Date.now() / 1000) + 60) throw new Error("The QR timestamp is in the future. Check the merchant device clock.");
  }
  return {
    protocol: "pact", version: "1.0", orderId: (data.orderId as string | undefined) || createOrderId(),
    merchant: data.merchant, targetChainId: data.targetChainId, targetToken: "USDC", amount, timestamp, editable: Number(amount) === 0,
  };
}
