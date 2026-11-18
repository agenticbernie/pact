"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ children, labelledBy, onClose, busy = false, bottom = false }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
  bottom?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); document.body.style.overflow = previousOverflow; previous?.focus(); };
  }, []);
  return (
    <div className={`fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm ${bottom ? "items-end justify-center" : "items-center justify-center p-4"}`}
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-busy={busy} tabIndex={-1}
        className={`w-full bg-surface-card border border-surface-border shadow-2xl overflow-y-auto outline-none ${bottom ? "max-w-lg rounded-t-3xl p-5 sm:p-6 max-h-[90dvh]" : "max-w-sm rounded-3xl p-5 max-h-[90dvh]"}`}>
        {children}
      </div>
    </div>
  );
}
