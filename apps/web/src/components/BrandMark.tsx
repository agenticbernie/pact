/**
 * Brand marks.
 *
 * Two supplied assets, each used where it reads best:
 * - `BrandMark` — the symbolic starburst, for the navigation header where only
 *   a square glyph fits.
 * - `BrandLockup` — the full mark with wordmark and tagline. Its wordmark is
 *   white, so it is only legible on an inverted (dark) surface; the connect
 *   gate gives it one.
 *
 * Both files ship from `apps/web/public` with transparent backgrounds, so they
 * sit on whatever surface the theme paints.
 */

/** Symbolic starburst. Decorative next to the product name, so it is hidden from AT. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/pact-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size, objectFit: "contain" }}
    />
  );
}

/** Full lockup (symbol + wordmark + tagline), for inverted surfaces only. */
export function BrandLockup({ width = 180 }: { width?: number }) {
  return (
    <img
      src="/pact-logo.png"
      alt="Pact — Ignite. Work. Ship. Repeat."
      style={{ display: "block", width, height: "auto" }}
    />
  );
}
