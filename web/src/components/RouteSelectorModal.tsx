"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Clock, ShieldCheck, ChevronRight } from "lucide-react";
import { type PactPaymentRequest } from "@/lib/pact-schema";
import { getChainName } from "@/lib/config";

export interface QuoteData {
  orderId: string | null;
  merchant: string;
  sourceChainId: number;
  targetChainId: number;
  amount: string;
  amountAtomic: string;
  hashLock: `0x${string}`;
  deadline: number;
  quoteLatencyMs: number;
  routes: {
    lightning: {
      priority: number;
      name: string;
      estimatedSeconds: string;
      fee: string;
      feeDisplayUsd: string;
      feeAtomic?: string;
      totalPayable: string;
      totalPayableDisplayUsd: string;
      totalPayableAtomic?: string;
    };
    economy: {
      priority: number;
      name: string;
      estimatedSeconds: string;
      fee: string;
      feeDisplayUsd: string;
      feeAtomic?: string;
      totalPayable: string;
      totalPayableDisplayUsd: string;
      totalPayableAtomic?: string;
    };
  };
}

interface RouteSelectorModalProps {
  paymentReq: PactPaymentRequest;
  quote: QuoteData | null;
  isLoadingQuote: boolean;
  onConfirmPayment: (priority: number, quote: QuoteData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function RouteSelectorModal({
  paymentReq,
  quote,
  isLoadingQuote,
  onConfirmPayment,
  onCancel,
  isSubmitting = false,
}: RouteSelectorModalProps) {
  const [selectedRoute, setSelectedRoute] = useState<"lightning" | "economy">("lightning");
  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const activeRoute = selectedRoute === "lightning" ? quote?.routes?.lightning : quote?.routes?.economy;
  const targetChainName = getChainName(paymentReq.targetChainId);

  // Slide-to-pay logic
  const handleTouchMove = useCallback((clientX: number) => {
    if (!isDragging || !trackRef.current || isSubmitting) return;
    const rect = trackRef.current.getBoundingClientRect();
    const handleWidth = 56;
    const maxSlide = rect.width - handleWidth;
    const currentX = Math.max(0, Math.min(clientX - rect.left - handleWidth / 2, maxSlide));
    const percent = currentX / maxSlide;
    setSliderPosition(percent);

    if (percent >= 0.92) {
      setIsDragging(false);
      setSliderPosition(1);
      if (quote) {
        onConfirmPayment(selectedRoute === "lightning" ? 0 : 1, quote);
      }
    }
  }, [isDragging, isSubmitting, quote, selectedRoute, onConfirmPayment]);

  const handleEnd = useCallback(() => {
    if (sliderPosition < 0.92) {
      setSliderPosition(0);
    }
    setIsDragging(false);
  }, [sliderPosition]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      {/* Click outside backdrop to close */}
      <div className="flex-1 w-full" onClick={onCancel} />

      {/* Dynamic Bottom Sheet (bottom 40% thumb zone per UI guidelines) */}
      <div className="w-full max-w-lg mx-auto bg-surface-card border-t border-surface-border rounded-t-3xl p-6 shadow-2xl flex flex-col space-y-5 animate-in slide-in-from-bottom duration-300">
        {/* Handle pill */}
        <div className="w-12 h-1.5 bg-surface-border rounded-full mx-auto" />

        {/* Merchant & Order Header */}
        <div className="flex items-center justify-between border-b border-surface-border pb-4">
          <div className="space-y-0.5">
            <span className="text-xs uppercase font-bold tracking-wider text-primary">
              Direct Settlement
            </span>
            <h2 className="text-xl font-bold text-text-main flex items-center gap-1.5">
              <span>Pay Merchant</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-base border border-surface-border text-text-muted">
                {targetChainName}
              </span>
            </h2>
            <p className="text-xs text-text-muted font-mono truncate max-w-[240px]">
              {paymentReq.merchant}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted font-medium">Invoice Amount</div>
            <div className="text-2xl font-black text-text-main tracking-tight">
              ${Number(paymentReq.amount).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Route Selector Cards */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Choose Execution Speed
          </label>
          <div className="grid grid-cols-2 gap-3">
            {/* Card A: Lightning Route */}
            <button
              type="button"
              onClick={() => setSelectedRoute("lightning")}
              disabled={isLoadingQuote}
              className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                selectedRoute === "lightning"
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-surface-border bg-surface-base/60 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="flex items-center gap-1 text-sm font-bold text-text-main">
                  <Zap className={`w-4 h-4 ${selectedRoute === "lightning" ? "text-primary fill-primary" : "text-text-muted"}`} />
                  Lightning
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary text-white">
                  FAST
                </span>
              </div>
              <div className="text-xs text-text-muted space-y-0.5">
                <div>~2.0s instant fill</div>
                <div className="font-semibold text-text-main">
                  Fee: ${quote?.routes.lightning.feeDisplayUsd || "0.01"}
                </div>
              </div>
            </button>

            {/* Card B: Economy Route */}
            <button
              type="button"
              onClick={() => setSelectedRoute("economy")}
              disabled={isLoadingQuote}
              className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                selectedRoute === "economy"
                  ? "border-success bg-success-bg shadow-lg shadow-success/10"
                  : "border-surface-border bg-surface-base/60 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="flex items-center gap-1 text-sm font-bold text-text-main">
                  <Clock className={`w-4 h-4 ${selectedRoute === "economy" ? "text-success" : "text-text-muted"}`} />
                  Economy
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/20 text-success">
                  BATCH
                </span>
              </div>
              <div className="text-xs text-text-muted space-y-0.5">
                <div>~15-45s batched</div>
                <div className="font-semibold text-text-main">
                  Fee: $0.005
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Security / HTLC Assurance Note */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-base/80 border border-surface-border/60 text-[11px] text-text-muted">
          <ShieldCheck className="w-4 h-4 text-success flex-shrink-0" />
          <span>
            Protected by 15-min HTLC Escrow. 100% refund guaranteed if unfilled.
          </span>
        </div>

        {/* Primary CTA: Slide to Pay */}
        <div className="pt-2">
          <div
            ref={trackRef}
            className="relative w-full h-14 bg-surface-base border border-surface-border rounded-full overflow-hidden select-none touch-none flex items-center"
            onTouchStart={() => setIsDragging(true)}
            onTouchMove={(e) => handleTouchMove(e.touches[0].clientX)}
            onTouchEnd={handleEnd}
            onMouseDown={() => setIsDragging(true)}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleTouchMove(e.clientX);
            }}
            onMouseUp={handleEnd}
          >
            {/* Sliding fill background */}
            <div
              className={`absolute top-0 bottom-0 left-0 transition-all ${
                selectedRoute === "lightning" ? "bg-primary/20" : "bg-success/20"
              }`}
              style={{ width: `${Math.max(sliderPosition * 100, 10)}%` }}
            />

            {/* Centered prompt text */}
            <div className="w-full text-center text-xs sm:text-sm font-bold text-text-main/80 pointer-events-none">
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2 text-primary animate-pulse">
                  Authorizing Payment...
                </span>
              ) : (
                `Slide to Pay $${activeRoute?.totalPayableDisplayUsd || Number(paymentReq.amount).toFixed(2)}`
              )}
            </div>

            {/* Draggable thumb button */}
            <div
              className={`absolute top-1 bottom-1 w-12 rounded-full flex items-center justify-center shadow-lg transition-transform cursor-grab active:cursor-grabbing ${
                selectedRoute === "lightning" ? "bg-primary text-white" : "bg-success text-white"
              }`}
              style={{
                transform: `translateX(${
                  trackRef.current
                    ? sliderPosition * (trackRef.current.clientWidth - 56)
                    : 0
                }px)`,
              }}
            >
              <ChevronRight className="w-6 h-6 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-xs text-text-muted hover:text-text-main font-semibold text-center transition-colors py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
