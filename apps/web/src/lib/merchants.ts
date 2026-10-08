/**
 * Merchant display labels.
 *
 * Mirrored from the committed catalog (`config/ai/merchant-catalog.json`); the
 * read API reports merchant ids, and a raw id is shown when it is not listed
 * here rather than inventing a label. The same catalog is what the card
 * issuance form offers as an allowlist, so a card can only ever allowlist a
 * merchant the trusted config knows about.
 */
export type CatalogMerchant = { id: string; label: string };

const MERCHANT_LABELS: Readonly<Record<string, string>> = {
  "coffee-demo": "Coffee Demo",
  "book-demo": "Book Demo",
};

export function merchantLabel(merchantId: string): string {
  return MERCHANT_LABELS[merchantId] ?? merchantId;
}

/** Trusted merchant allowlist source, in catalog order. */
export function merchantCatalog(): readonly CatalogMerchant[] {
  return Object.entries(MERCHANT_LABELS).map(([id, label]) => ({ id, label }));
}
