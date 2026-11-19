"use client";

import { useState } from "react";
import Image from "next/image";
import { MerchantTerminal } from "@/components/MerchantTerminal";
import { PayerClient } from "@/components/PayerClient";
import { TelemetryDashboard } from "@/components/TelemetryDashboard";
import { Smartphone, Store, Activity } from "lucide-react";

type View = "payer" | "merchant" | "telemetry";
export default function Home() {
  const [active, setActive] = useState<View>("payer");
  const [visited, setVisited] = useState({ merchant: false, telemetry: false });
  return (
    <main className="min-h-dvh bg-surface-base text-text-main">
      <nav aria-label="Pact application views" className="sticky top-0 z-40 h-20 bg-surface-base/95 backdrop-blur-md border-b border-surface-border flex items-center justify-center gap-2 sm:gap-4 p-3">
        <div className="shrink-0" role="img" aria-label="Pact">
          <Image src="/icon.svg" alt="" width={40} height={40} priority className="sm:hidden" />
          <Image src="/pact-logo.svg" alt="" width={120} height={44} priority className="hidden sm:block" />
        </div>
        <div className="flex min-w-0 w-full max-w-lg gap-1 rounded-2xl border border-surface-border bg-surface-card p-1">
          {([
            { id: "payer", label: "Pay", Icon: Smartphone },
            { id: "merchant", label: "Merchant POS", Icon: Store },
            { id: "telemetry", label: "Activity", Icon: Activity },
          ] as const).map(({ id, label, Icon }) => (
            <button key={id} type="button" id={`nav-${id}`} aria-pressed={active === id} aria-controls={`view-${id}`}
              onClick={() => { setActive(id); if (id !== "payer") setVisited((previous) => ({ ...previous, [id]: true })); }}
              className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-3 rounded-xl text-xs font-bold ${active === id ? "bg-primary text-white" : "text-text-muted hover:text-text-main"}`}>
              <Icon className="w-4 h-4 shrink-0" /><span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
      {/* Keep started flows mounted: switching views must not discard pending payments. */}
      <section id="view-payer" aria-labelledby="nav-payer" hidden={active !== "payer"}><PayerClient active={active === "payer"} /></section>
      {visited.merchant && <section id="view-merchant" aria-labelledby="nav-merchant" hidden={active !== "merchant"}><MerchantTerminal active={active === "merchant"} /></section>}
      {visited.telemetry && <section id="view-telemetry" aria-labelledby="nav-telemetry" hidden={active !== "telemetry"}><TelemetryDashboard active={active === "telemetry"} /></section>}
    </main>
  );
}
