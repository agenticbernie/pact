"use client";

import { useState } from "react";
import { MerchantTerminal } from "@/components/MerchantTerminal";
import { PayerClient } from "@/components/PayerClient";
import { TelemetryDashboard } from "@/components/TelemetryDashboard";
import { Smartphone, Store, Activity } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"payer" | "merchant" | "telemetry">("payer");

  return (
    <main className="min-h-screen bg-surface-base text-text-main flex flex-col justify-between">
      {/* Top Floating Switcher between Payer, Merchant POS, and Telemetry */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 bg-surface-card/90 backdrop-blur-md border border-surface-border p-1 rounded-full shadow-2xl flex items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("payer")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            activeTab === "payer"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-text-muted hover:text-text-main"
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Payer</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("merchant")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            activeTab === "merchant"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-text-muted hover:text-text-main"
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Merchant POS</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("telemetry")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            activeTab === "telemetry"
              ? "bg-primary text-white shadow-md shadow-primary/20"
              : "text-text-muted hover:text-text-main"
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Telemetry &amp; Trust</span>
        </button>
      </div>

      {/* Screen View */}
      <div className="w-full min-h-screen flex flex-col items-center justify-center">
        {activeTab === "payer" && <PayerClient />}
        {activeTab === "merchant" && <MerchantTerminal />}
        {activeTab === "telemetry" && <TelemetryDashboard />}
      </div>
    </main>
  );
}
