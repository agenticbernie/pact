/**
 * Decimal formatting for the console.
 *
 * On-chain amounts arrive as base-unit strings and routinely exceed
 * `Number.MAX_SAFE_INTEGER` (an 18-decimal USDC cap of 0.1 is 1e17), so every
 * conversion here uses `BigInt` and stays exact.
 */

/** Render base units as a plain decimal string, trimming trailing zeros. */
export function formatBaseUnits(value: string, decimals: number): string {
  let raw: bigint;
  try {
    raw = BigInt(value);
  } catch {
    return value;
  }
  const negative = raw < 0n;
  const magnitude = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = magnitude / scale;
  const fraction = (magnitude % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fraction.length === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

/** Exact base-unit subtraction (credit − spent) without floating point. */
export function subtractBaseUnits(left: string, right: string): string {
  try {
    return (BigInt(left) - BigInt(right)).toString();
  } catch {
    return left;
  }
}

/** Insert thousands separators into the integer part of a decimal string. */
export function groupThousands(value: string): string {
  const [whole = "", fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Shorten an address or hash to `head…tail` for dense rows. */
export function shortenMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Compact wallet label for the navigation rail. */
export function shortestAddress(value: string): string {
  return shortenMiddle(value, 8, 6);
}

/**
 * Normalize a timestamp for display. The read API mixes ISO strings with
 * JavaScript `Date#toString()` output, so parse both and fall back to the
 * original text if the value is not a date at all.
 */
export function normalizeTimestamp(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** Local, readable date+time for a normalized timestamp. */
export function formatDateTime(value: string | undefined): string {
  if (value === undefined || value === "") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
