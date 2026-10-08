/**
 * Inline SVG icons for navigation and headings.
 *
 * Astryx accepts a semantic icon name or a direct SVG component for every
 * `IconType` prop; these small components keep the rail legible without adding
 * an icon-package dependency. Size and colour come from the Icon wrapper, so
 * each glyph only draws its path in `currentColor`.
 */
import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Operations overview. */
export function OverviewIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 13h6v7H4z" />
      <path d="M14 4h6v16h-6z" />
      <path d="M4 4h6v5H4z" />
    </Glyph>
  );
}

/** Payment list. */
export function PaymentsIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 11h6" />
      <path d="M9 15h6" />
      <path d="M9 7h3" />
    </Glyph>
  );
}

/** Card policy / credit. */
export function CardIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </Glyph>
  );
}

/** On-chain activity. */
export function ActivityIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 12h4l3-7 4 14 3-7h4" />
    </Glyph>
  );
}

/** Chain / contract evidence. */
export function ChainIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M10 13a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
      <path d="M14 11a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
    </Glyph>
  );
}

/** Owner wallet / session. */
export function WalletIcon(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M16 12h3" />
    </Glyph>
  );
}
