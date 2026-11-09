"use client";

import { useState, useEffect, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, RefreshCw, Copy, Check, ArrowRight, Layers, ExternalLink, Zap, Clock } from "lucide-react";
import { PACT_CONFIG, getChainName, getExplorerTxUrl } from "@/lib/config";
import { playTingTingSound, triggerHapticFeedback } from "@/lib/feedback";
import { type SupportedTargetChainId } from "@/lib/pact-schema";

const QR_TTL_SECONDS = 300; // dynamic QR validity window
const MERCHANT_STORAGE_KEY = "pact_merchant_address_v1";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function MerchantTerminal() {
  const [amount, setAmount] = useState<string>("3.50");
  const [targetChainId, setTargetChainId] = useState<SupportedTargetChainId>(421614); // Arbitrum Sepolia default
  // Settlement wallet that receives the USDC on the destination chain. Configurable so funds are never
  // routed to a placeholder: NEXT_PUBLIC_MERCHANT_ADDRESS, or the address saved from the POS settings.
  const [merchantAddress, setMerchantAddress] = useState<string>(
    process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || "0x1111111111111111111111111111111111111111"
  );
  const [merchantDraft, setMerchantDraft] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [qrIssuedAt, setQrIssuedAt] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(QR_TTL_SECONDS);
  const [currentOrderId, setCurrentOrderId] = useState<string>(() => `ORD-${Date.now().toString().slice(-6)}`);
  const [settledIntent, setSettledIntent] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  // Keypad press handler
  const handleKeypadPress = (val: string) => {
    if (settledIntent) {
      setSettledIntent(null);
      setCurrentOrderId(`ORD-${Date.now().toString().slice(-6)}`);
    }

    if (val === "C") {
      setAmount("0");
    } else if (val === "⌫") {
      setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : "0"));
    } else if (val === ".") {
      if (!amount.includes(".")) {
        setAmount((prev) => prev + ".");
      }
    } else {
      setAmount((prev) => {
        if (prev === "0") return val;
        // Limit to 2 decimals for POS UI
        if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
        if (prev.length >= 7) return prev;
        return prev + val;
      });
    }
  };

  // Generate standardized Pact QR JSON Payload (§3.2.3). The timestamp is pinned to the moment the
  // QR was issued so the Payer can reject stale codes (§4.3 Screen 2: auto-refresh upon expiration).
  const qrPayload = useMemo(
    () =>
      JSON.stringify({
        protocol: "pact",
        version: "1.0",
        orderId: currentOrderId,
        merchant: merchantAddress,
        targetChainId,
        targetToken: "USDC",
        amount: Number(amount) > 0 ? Number(amount).toFixed(2) : "1.00",
        timestamp: qrIssuedAt,
      }),
    [currentOrderId, merchantAddress, targetChainId, amount, qrIssuedAt]
  );

  // Auto-refresh the dynamic QR (fresh orderId + timestamp) once it expires
  useEffect(() => {
    if (settledIntent) return;
    const tick = setInterval(() => {
      const remaining = qrIssuedAt + QR_TTL_SECONDS - Math.floor(Date.now() / 1000);
      if (remaining <= 0) {
        setCurrentOrderId(`ORD-${Date.now().toString().slice(-6)}`);
        setQrIssuedAt(Math.floor(Date.now() / 1000));
        setQrSecondsLeft(QR_TTL_SECONDS);
      } else {
        setQrSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [qrIssuedAt, settledIntent]);

  // Poll for settlement status of currentOrderId via Relayer API
  useEffect(() => {
    if (!currentOrderId || settledIntent) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/orders/${currentOrderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.isSettled && isMounted) {
          setSettledIntent(data.intent);
          playTingTingSound();
          triggerHapticFeedback();
        }
      } catch (err) {
        // Relayer unreachable or polling error
      }
    }, 800);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentOrderId, settledIntent]);

  const refreshQr = () => {
    setCurrentOrderId(`ORD-${Date.now().toString().slice(-6)}`);
    setQrIssuedAt(Math.floor(Date.now() / 1000));
    setQrSecondsLeft(QR_TTL_SECONDS);
  };

  const handleNewOrder = () => {
    setSettledIntent(null);
    refreshQr();
    setAmount("3.50");
  };

  // Restore the merchant's saved settlement wallet (if any)
  useEffect(() => {
    const saved = localStorage.getItem(MERCHANT_STORAGE_KEY);
    if (saved && ADDRESS_REGEX.test(saved)) setMerchantAddress(saved);
  }, []);

  const handleSaveMerchant = () => {
    if (!ADDRESS_REGEX.test(merchantDraft.trim())) return;
    const next = merchantDraft.trim();
    localStorage.setItem(MERCHANT_STORAGE_KEY, next);
    setMerchantAddress(next);
    setShowSettings(false);
    refreshQr();
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen flex flex-col justify-between p-4 sm:p-6 bg-surface-base">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-surface-border pb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
            Merchant Point of Sale
          </span>
          <h1 className="text-lg font-bold text-text-main flex items-center gap-1.5">
            The Coffee Shop
            <button
              type="button"
              onClick={() => {
                setMerchantDraft(merchantAddress);
                setShowSettings((v) => !v);
              }}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-surface-border text-text-muted hover:text-text-main"
            >
              Payout wallet
            </button>
          </h1>
        </div>

        {/* Chain selector toggle */}
        <div className="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-surface-border text-xs">
          <button
            type="button"
            onClick={() => setTargetChainId(421614)}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              targetChainId === 421614
                ? "bg-primary text-white shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            Arb
          </button>
          <button
            type="button"
            onClick={() => setTargetChainId(84532)}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              targetChainId === 84532
                ? "bg-primary text-white shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            Base
          </button>
          <button
            type="button"
            onClick={() => setTargetChainId(43113)}
            className={`px-2 py-1 rounded-lg font-medium transition-all ${
              targetChainId === 43113
                ? "bg-primary text-white shadow-sm"
                : "text-text-muted hover:text-text-main"
            }`}
          >
            Fuji
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-3 p-3 rounded-2xl bg-surface-card border border-surface-border space-y-2">
          <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
            Payout wallet (receives USDC on {getChainName(targetChainId)})
          </label>
          <input
            value={merchantDraft}
            onChange={(e) => setMerchantDraft(e.target.value)}
            placeholder="0x…"
            className="w-full px-3 py-2 rounded-xl bg-surface-base border border-surface-border text-xs font-mono text-text-main"
          />
          <button
            type="button"
            onClick={handleSaveMerchant}
            disabled={!ADDRESS_REGEX.test(merchantDraft.trim())}
            className="w-full py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-white text-xs font-bold"
          >
            Save payout wallet
          </button>
        </div>
      )}

      {/* Main Center Area: QR Screen or Success State */}
      <div className="flex-1 flex flex-col items-center justify-center py-6">
        {settledIntent ? (
          /* Settlement State Transition: Green full-screen flash with checkmark badge */
          <div className="w-full bg-surface-card border-2 border-success rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-success/20 text-success rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-extrabold tracking-wider text-success">
                Payment Received
              </span>
              <h2 className="text-3xl font-black text-text-main">
                Received {(Number(settledIntent.amount_in) / 1e6).toFixed(2)} USDC from Avalanche
              </h2>
              <p className="text-xs text-text-muted">
                Settled instantly on {getChainName(settledIntent.target_chain_id)}
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-surface-base/80 border border-surface-border text-left text-xs space-y-2 font-mono">
              <div className="flex justify-between text-text-muted">
                <span>Order ID:</span>
                <span className="text-text-main font-bold">{currentOrderId}</span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Route:</span>
                <span className="text-primary font-bold">
                  {settledIntent.priority === 0 ? "⚡ Lightning (<3.0s)" : "🐢 Economy"}
                </span>
              </div>
              {settledIntent.dest_tx_hash && (
                <div className="flex justify-between items-center text-text-muted pt-1 border-t border-surface-border/40">
                  <span>Dest Settlement Tx:</span>
                  <a
                    href={getExplorerTxUrl(
                      settledIntent.target_chain_id || targetChainId,
                      settledIntent.dest_tx_hash
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 font-semibold"
                  >
                    <span>{settledIntent.dest_tx_hash.slice(0, 10)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {settledIntent.source_tx_hash && (
                <div className="flex justify-between items-center text-text-muted">
                  <span>Fuji Escrow Tx:</span>
                  <a
                    href={getExplorerTxUrl(43113, settledIntent.source_tx_hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-text-main hover:underline flex items-center gap-1"
                  >
                    <span>{settledIntent.source_tx_hash.slice(0, 10)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleNewOrder}
              className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary-hover active:scale-98 text-white font-bold text-sm transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
            >
              <span>Next Customer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Active Order QR Display */
          <div className="w-full flex flex-col items-center space-y-4">
            <div className="relative p-5 bg-white rounded-3xl shadow-2xl border-4 border-surface-border flex flex-col items-center">
              <QRCodeSVG
                value={qrPayload}
                size={220}
                level="M"
                includeMargin={false}
              />
              <div className="mt-3 text-[11px] font-mono text-slate-600 font-semibold flex items-center gap-1.5">
                <span>{currentOrderId}</span>
                <span>•</span>
                <span className="text-primary">{getChainName(targetChainId)}</span>
              </div>
            </div>

            <div className="text-center space-y-1">
              <div className="text-xs text-text-muted font-medium">Customer Scan Total</div>
              <div className="text-4xl font-black text-text-main tracking-tight">
                ${Number(amount || 0).toFixed(2)} <span className="text-sm font-semibold text-text-muted">USDC</span>
              </div>
              <div className="text-[11px] text-text-muted font-mono">
                QR refreshes in {Math.floor(qrSecondsLeft / 60)}:{String(qrSecondsLeft % 60).padStart(2, "0")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Numeric Keypad for Rapid Invoicing */}
      {!settledIntent && (
        <div className="w-full bg-surface-card border border-surface-border rounded-3xl p-4 shadow-xl">
          <div className="grid grid-cols-3 gap-2 text-lg font-bold">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypadPress(key)}
                className="h-12 rounded-xl bg-surface-base hover:bg-surface-border/40 active:scale-95 text-text-main transition-all flex items-center justify-center border border-surface-border/40"
              >
                {key}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleKeypadPress("C")}
              className="flex-1 py-2 rounded-xl bg-surface-base border border-surface-border text-xs font-semibold text-text-muted hover:text-text-main"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleNewOrder}
              className="flex-1 py-2 rounded-xl bg-surface-base border border-surface-border text-xs font-semibold text-text-muted hover:text-text-main flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>New ID</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
