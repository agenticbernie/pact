import type { MouseEvent } from "react";

/**
 * In-page navigation for the public landing page.
 *
 * The landing page is one long document, so its navigation entries are
 * same-page anchors. Astryx routes every link through `LinkProvider` (mapped to
 * react-router in `main.tsx`), and a router navigation does not scroll to a
 * hash, so the anchors keep a real `href` — the destination stays visible to the
 * browser and to assistive tech — and scroll explicitly here.
 */
export function jumpTo(id: string): void {
  const target = document.getElementById(id);
  if (target === null) return;
  // AppShell keeps the header sticky on a page that grows with its content, so
  // the target is scrolled clear of it. The offset is measured at click time
  // rather than hardcoded, so it survives a header resize.
  const header = document.querySelector('nav[aria-label="Pact"]');
  const offset = header === null ? 0 : header.getBoundingClientRect().height;
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
}

/** Click handler for an in-page anchor: keep the href, smooth-scroll the target. */
export function anchorClick(id: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    jumpTo(id);
  };
}
