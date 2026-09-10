/**
 * Merchant catalog gate (S2): labels + logical IDs only, no addresses.
 * The catalog is non-authoritative display only; the on-chain snapshot stays
 * authoritative for card/agent/asset/recipient/policyVersion.
 */
import type { MerchantCatalogItem } from "./provider-port.ts";

export type { MerchantCatalogItem };

const MERCHANT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function loadMerchantCatalog(input: unknown): { merchants: MerchantCatalogItem[] } {
  if (typeof input !== "object" || input === null) {
    throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant catalog must be an object.");
  }
  const record = input as Record<string, unknown>;
  const list = record["merchants"];
  if (!Array.isArray(list)) {
    throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant catalog must list merchants.");
  }
  return {
    merchants: list.map((entry) => {
      if (typeof entry !== "object" || entry === null) {
        throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant entry must be an object.");
      }
      const item = entry as Record<string, unknown>;
      // Labels + logical IDs only: any address-shaped field is rejected.
      for (const key of Object.keys(item)) {
        if (!["id", "label"].includes(key)) {
          throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant entry has a forbidden field.");
        }
      }
      const { id, label } = item;
      if (typeof id !== "string" || !MERCHANT_ID.test(id) || id.length > 64) {
        throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant ID is invalid.");
      }
      if (typeof label !== "string" || label.length === 0 || label.length > 80) {
        throw gatewayError("PROVIDER_OUTPUT_INVALID", "Merchant label is invalid.");
      }
      return { id, label };
    }),
  };
}

export function assertMerchantInCatalog(
  merchants: ReadonlyArray<MerchantCatalogItem>,
  merchantId: string,
): void {
  if (!merchants.some((item) => item.id === merchantId)) {
    throw gatewayError("PROVIDER_OUTPUT_INVALID", "Unknown merchant.");
  }
}

function gatewayError(code: "PROVIDER_OUTPUT_INVALID", message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
