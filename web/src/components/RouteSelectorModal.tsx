"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Zap, Clock, ShieldCheck, ChevronRight, Loader2, ArrowRight } from "lucide-react";
import { type PactPaymentRequest, type SupportedTargetChainId } from "@/lib/pact-schema";
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
  onRefreshQuote?: (newAmount: string, newTargetChainId: SupportedTargetChainId) => Promise<void>;
}

export function RouteSelectorModal({
  paymentReq,
  quote,
  isLoadingQuote,
  onConfirmPayment,
  onCancel,
  isSubmitting = false,
  onRefreshQuote,
}: RouteSelectorModalProps) {
  const [selectedRoute, setSelectedRoute] = useState<"lightning" | "economy">("lightning");
  const [selectedTargetChainId, setSelectedTargetChainId] = useState<SupportedTargetChainId>(
    paymentReq.targetChainId || 421614
  );
  const [amountInput, setAmountInput] = useState<string>(paymentReq.amount || "1.00");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const [sliderPosition, setSliderPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const activeRoute = selectedRoute === "lightning" ? quote?.routes?.lightning : quote?.routes?.economy;

  // Handle Chain Selection Change (Arbitrum 421614 vs Base 84532)
  const handleSelectChain = (chainId: SupportedTargetChainId) => {
    setSelectedTargetChainId(chainId);
    if (onRefreshQuote) {
      onRefreshQuote(amountInput, chainId);
    }
  };

  // Handle Amount Input Change with Debounce
  const handleAmountChange = (val: string) => {
    setAmountInput(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const num = Number(val);
      if (!isNaN(num) && num > 0 && onRefreshQuote) {
        onRefreshQuote(val, selectedTargetChainId);
      }
    }, 400);
  };

  const handlePresetAmount = (presetVal: string) => {
    setAmountInput(presetVal);
    if (onRefreshQuote) {
      onRefreshQuote(presetVal, selectedTargetChainId);
    }
  };

  // Slide-to-pay logic
  const handleTouchMove = useCallback((clientX: number) => {
    if (!isDragging || !trackRef.current || isSubmitting || isLoadingQuote) return;
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
  }, [isDragging, isSubmitting, isLoadingQuote, quote, selectedRoute, onConfirmPayment]);

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

      {/* Dynamic Bottom Sheet */}
      <div className="w-full max-w-lg mx-auto bg-surface-card border-t border-surface-border rounded-t-3xl p-5 sm:p-6 shadow-2xl flex flex-col space-y-4 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
        {/* Handle pill */}
        <div className="w-12 h-1.5 bg-surface-border rounded-full mx-auto" />

        {/* Header: Merchant / Recipient */}
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
              Cross-Chain Settlement
            </span>
            <h2 className="text-base sm:text-lg font-bold text-text-main flex items-center gap-1.5">
              <span>Gửi tiền tới</span>
            </h2>
            <p className="text-xs text-text-muted font-mono truncate max-w-[280px]">
              {paymentReq.merchant}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-base border border-surface-border text-text-muted">
              {getChainName(selectedTargetChainId)}
            </span>
          </div>
        </div>

        {/* 1. MẠNG ĐÍCH NGƯỜI NHẬN (Arbitrum vs Base) */}
        <div>
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5 block">
            Mạng người nhận (Destination Chain)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleSelectChain(421614)}
              className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                selectedTargetChainId === 421614
                  ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10"
                  : "bg-surface-base border-surface-border text-text-muted hover:border-surface-border/80"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span>🔵 Arbitrum Sepolia</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectChain(84532)}
              className={`p-2.5 rounded-xl border text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                selectedTargetChainId === 84532
                  ? "bg-blue-500/20 border-blue-400 text-blue-300 shadow-md shadow-blue-400/10"
                  : "bg-surface-base border-surface-border text-text-muted hover:border-surface-border/80"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
              <span>🔷 Base Sepolia</span>
            </button>
          </div>
        </div>

        {/* 2. NHẬP SỐ TIỀN TÙY Ý (HẾT BỊ KHÓA 1.00 USDC) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Số lượng USDC gửi
            </label>
            {isLoadingQuote && (
              <span className="text-[11px] text-primary flex items-center gap-1 font-medium animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Báo giá mới...</span>
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amountInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-full bg-surface-base text-text-main font-mono text-2xl font-bold px-4 py-2.5 rounded-xl border border-surface-border focus:outline-none focus:border-primary transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">
              USDC
            </span>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            {["0.50", "1.00", "3.50", "10.00"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetAmount(preset)}
                className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-all ${
                  amountInput === preset
                    ? "bg-primary/20 border-primary text-primary font-bold"
                    : "bg-surface-base border-surface-border text-text-muted hover:text-text-main"
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>
        </div>

        {/* 3. TỐC ĐỘ GIAO DỊCH (LIGHTNING VS ECONOMY) */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
            Tốc độ định tuyến
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Card A: Lightning Route */}
            <button
              type="button"
              onClick={() => setSelectedRoute("lightning")}
              className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                selectedRoute === "lightning"
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-surface-border bg-surface-base/60 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="flex items-center gap-1 text-xs sm:text-sm font-bold text-text-main">
                  <Zap className={`w-3.5 h-3.5 ${selectedRoute === "lightning" ? "text-primary fill-primary" : "text-text-muted"}`} />
                  Lightning
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary text-white">
                  ~1-2s
                </span>
              </div>
              <div className="text-[11px] text-text-muted space-y-0.5">
                <div>Nhận tức thì</div>
                <div className="font-semibold text-text-main">
                  Phí: ${quote?.routes.lightning.feeDisplayUsd || "0.01"}
                </div>
              </div>
            </button>

            {/* Card B: Economy Route */}
            <button
              type="button"
              onClick={() => setSelectedRoute("economy")}
              className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                selectedRoute === "economy"
                  ? "border-success bg-success-bg shadow-lg shadow-success/10"
                  : "border-surface-border bg-surface-base/60 opacity-70 hover:opacity-100"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="flex items-center gap-1 text-xs sm:text-sm font-bold text-text-main">
                  <Clock className={`w-3.5 h-3.5 ${selectedRoute === "economy" ? "text-success" : "text-text-muted"}`} />
                  Economy
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/20 text-success">
                  BATCH
                </span>
              </div>
              <div className="text-[11px] text-text-muted space-y-0.5">
                <div>~15-45s gom lệnh</div>
                <div className="font-semibold text-text-main">
                  Phí: $0.005
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Security / HTLC Assurance Note */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-base/80 border border-surface-border/60 text-[11px] text-text-muted">
          <ShieldCheck className="w-4 h-4 text-success flex-shrink-0" />
          <span>
            Bảo hiểm HTLC 15 phút trên Fuji. 100% hoàn tiền nếu không khớp lệnh.
          </span>
        </div>

        {/* Primary Action Button: 1-Tap Confirm */}
        <button
          type="button"
          onClick={() => {
            if (quote && !isSubmitting && !isLoadingQuote) {
              onConfirmPayment(selectedRoute === "lightning" ? 0 : 1, quote);
            }
          }}
          disabled={isSubmitting || isLoadingQuote || !quote || Number(amountInput) <= 0}
          className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang ủy quyền thanh toán...</span>
            </>
          ) : (
            <>
              <span>
                Xác nhận gửi ${activeRoute?.totalPayableDisplayUsd || Number(amountInput).toFixed(2)} USDC ➔ {selectedTargetChainId === 421614 ? "Arbitrum" : "Base"}
              </span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>

        {/* Slide-to-Pay Alternation */}
        <div className="pt-1">
          <div
            ref={trackRef}
            className="relative w-full h-12 bg-surface-base border border-surface-border rounded-full overflow-hidden select-none touch-none flex items-center"
            onTouchStart={() => setIsDragging(true)}
            onTouchMove={(e) => handleTouchMove(e.touches[0].clientX)}
            onTouchEnd={handleEnd}
            onMouseDown={() => setIsDragging(true)}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleTouchMove(e.clientX);
            }}
            onMouseUp={handleEnd}
          >
            <div
              className={`absolute top-0 bottom-0 left-0 transition-all ${
                selectedRoute === "lightning" ? "bg-primary/20" : "bg-success/20"
              }`}
              style={{ width: `${Math.max(sliderPosition * 100, 10)}%` }}
            />

            <div className="w-full text-center text-xs font-bold text-text-main/70 pointer-events-none">
              {isSubmitting
                ? "Đang xử lý..."
                : `Hoặc trượt để thanh toán $${activeRoute?.totalPayableDisplayUsd || Number(amountInput).toFixed(2)}`}
            </div>

            <div
              className={`absolute top-1 bottom-1 w-10 rounded-full flex items-center justify-center shadow-lg transition-transform cursor-grab active:cursor-grabbing ${
                selectedRoute === "lightning" ? "bg-primary text-white" : "bg-success text-white"
              }`}
              style={{
                transform: `translateX(${
                  trackRef.current
                    ? sliderPosition * (trackRef.current.clientWidth - 48)
                    : 0
                }px)`,
              }}
            >
              <ChevronRight className="w-5 h-5 animate-pulse" />
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
          Hủy bỏ
        </button>
      </div>
    </div>
  );
}
