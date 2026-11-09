/**
 * Pact Protocol — Dynamic QR JSON Schema Validator & Types (§3.2.3)
 * Schema MIME: application/vnd.pact.payment+json
 */

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
}

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_REGEX = /^[0-9]+(\.[0-9]{1,6})?$/;

export function parsePactQrPayload(raw: string): PactPaymentRequest {
  const trimmed = raw.trim();

  // TRƯỜNG HỢP 1: QUÉT TRÚNG MÃ VÍ THƯỜNG (MetaMask / EIP-681 / Core Wallet / Trust Wallet)
  // Ví dụ: "0x742d..." hoặc "ethereum:0x742d...[@chainId]"
  let rawAddress = trimmed;
  let targetChainId: SupportedTargetChainId = 421614; // Mặc định Arbitrum Sepolia

  if (trimmed.startsWith("ethereum:")) {
    // Tách bỏ tiền tố "ethereum:" và chuỗi param phía sau nếu có
    const cleanUri = trimmed.replace("ethereum:", "");
    const parts = cleanUri.split(/[@?]/);
    rawAddress = parts[0];
    if (cleanUri.includes("@84532")) {
      targetChainId = 84532; // Base Sepolia
    } else if (cleanUri.includes("@43113")) {
      targetChainId = 43113; // Avalanche Fuji
    }
  }

  // Nếu là địa chỉ ví EVM hợp lệ 42 ký tự
  if (ETH_ADDRESS_REGEX.test(rawAddress)) {
    return {
      protocol: "pact",
      version: "1.0",
      orderId: `P2P-${Date.now().toString().slice(-6)}`,
      merchant: rawAddress as `0x${string}`,
      targetChainId: targetChainId,
      targetToken: "USDC",
      amount: "1.00", // Giá trị mặc định gợi ý
      timestamp: Date.now(),
    };
  }

  // TRƯỜNG HỢP 2: QUÉT MÃ DYNAMIC QR CỦA PACT MERCHANT (JSON)
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Invalid QR: Not a valid EVM address or Pact JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid QR payload: not a JSON object");
  }
  if (parsed.protocol !== "pact") {
    throw new Error("Invalid QR payload: protocol must be 'pact'");
  }
  if (typeof parsed.merchant !== "string" || !ETH_ADDRESS_REGEX.test(parsed.merchant)) {
    throw new Error("Invalid QR payload: invalid merchant address");
  }

  // Cho phép amount linh hoạt (nếu merchant chưa nhập hoặc bằng 0 thì gán mặc định 1.00)
  const validAmount =
    typeof parsed.amount === "string" && AMOUNT_REGEX.test(parsed.amount) && Number(parsed.amount) > 0
      ? parsed.amount
      : "1.00";

  return {
    protocol: "pact",
    version: parsed.version ?? "1.0",
    orderId: parsed.orderId || `ORD-${Date.now().toString().slice(-6)}`,
    merchant: parsed.merchant as `0x${string}`,
    targetChainId: (
      parsed.targetChainId === 84532 ? 84532 : parsed.targetChainId === 43113 ? 43113 : 421614
    ) as SupportedTargetChainId,
    targetToken: "USDC",
    amount: validAmount,
    timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
  };
}
