/**
 * Merchant display labels.
 *
 * Mirrored from the committed catalog (`config/ai/merchant-catalog.json`); the
 * read API reports merchant ids, and a raw id is shown when it is not listed
 * here rather than inventing a label.
 */
const MERCHANT_LABELS: Readonly<Record<string, string>> = {
  "coffee-demo": "Coffee Demo",
  "book-demo": "Book Demo",
};

export function merchantLabel(merchantId: string): string {
  return MERCHANT_LABELS[merchantId] ?? merchantId;
}
