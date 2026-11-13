"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  CheckCircle2,
  RefreshCw,
  Copy,
  Check,
  ArrowRight,
  Layers,
  ExternalLink,
  Zap,
  Clock,
  Tag,
  Download,
  Calendar,
  DollarSign,
  FileSpreadsheet,
  Store,
} from "lucide-react";
import { PACT_CONFIG, getChainName, getExplorerTxUrl } from "@/lib/config";
import { playTingTingSound, triggerHapticFeedback } from "@/lib/feedback";
import { type SupportedTargetChainId } from "@/lib/pact-schema";

const QR_TTL_SECONDS = 300; // dynamic QR validity window
const MERCHANT_STORAGE_KEY = "pact_merchant_address_v1";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function MerchantTerminal() {
  const [activeTab, setActiveTab] = useState<"terminal" | "eod">("terminal");
  const [qrMode, setQrMode] = useState<"dynamic" | "static">("dynamic");
  const [amount, setAmount] = useState<string>("3.50");
  const [orderNote, setOrderNote] = useState<string>("");
  const [targetChainId, setTargetChainId] = useState<SupportedTargetChainId>(421614); // Arbitrum Sepolia default

  const [merchantAddress, setMerchantAddress] = useState<string>(
    process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || "0x1111111111111111111111111111111111111111"
  );
  const [merchantDraft, setMerchantDraft] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [qrIssuedAt, setQrIssuedAt] = useState<number>(() => Math.floor(Date.now() / 1000));
  const [qrSecondsLeft, setQrSecondsLeft] = useState<number>(QR_TTL_SECONDS);
  const [baseOrderId, setBaseOrderId] = useState<string>(() => `ORD-${Date.now().toString().slice(-6)}`);
  const [settledIntent, setSettledIntent] = useState<any | null>(null);

  // Settlements data for End-of-Day Close (Chốt sổ)
  const [settlements, setSettlements] = useState<any | null>(null);
  const [isLoadingSettlements, setIsLoadingSettlements] = useState(false);
  const [settlementError, setSettlementError] = useState<string | null>(null);

  // Compute full orderId with optional note/tag appended
  const currentOrderId = useMemo(() => {
    const trimmed = orderNote.trim().replace(/\s+/g, "-");
    return trimmed ? `${baseOrderId}_${trimmed}` : baseOrderId;
  }, [baseOrderId, orderNote]);

  // Keypad press handler
  const handleKeypadPress = (val: string) => {
    if (settledIntent) {
      setSettledIntent(null);
      setBaseOrderId(`ORD-${Date.now().toString().slice(-6)}`);
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

  // Generate standardized Pact QR JSON Payload (§3.2.3)
  // For Static Standee QR: amount is "0" or omitted, with no expiry timestamp
  const qrPayload = useMemo(() => {
    if (qrMode === "static") {
      return JSON.stringify({
        protocol: "pact",
        version: "1.0",
        orderId: currentOrderId,
        merchant: merchantAddress,
        targetChainId,
        targetToken: "USDC",
        amount: "0",
      });
    }
    return JSON.stringify({
      protocol: "pact",
      version: "1.0",
      orderId: currentOrderId,
      merchant: merchantAddress,
      targetChainId,
      targetToken: "USDC",
      amount: Number(amount) > 0 ? Number(amount).toFixed(2) : "1.00",
      timestamp: qrIssuedAt,
    });
  }, [qrMode, currentOrderId, merchantAddress, targetChainId, amount, qrIssuedAt]);

  // Auto-refresh dynamic QR (fresh orderId + timestamp) once it expires (dynamic only)
  useEffect(() => {
    if (settledIntent || qrMode === "static") return;
    const tick = setInterval(() => {
      const remaining = qrIssuedAt + QR_TTL_SECONDS - Math.floor(Date.now() / 1000);
      if (remaining <= 0) {
        setBaseOrderId(`ORD-${Date.now().toString().slice(-6)}`);
        setQrIssuedAt(Math.floor(Date.now() / 1000));
        setQrSecondsLeft(QR_TTL_SECONDS);
      } else {
        setQrSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [qrIssuedAt, settledIntent, qrMode]);

  // Poll for settlement status of currentOrderId via Relayer API
  useEffect(() => {
    if (!currentOrderId || settledIntent) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/orders/${encodeURIComponent(currentOrderId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.isSettled && isMounted) {
          setSettledIntent(data.intent);
          playTingTingSound();
          triggerHapticFeedback();
        }
      } catch {
        // Relayer unreachable or polling error
      }
    }, 800);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentOrderId, settledIntent]);

  const refreshQr = () => {
    setBaseOrderId(`ORD-${Date.now().toString().slice(-6)}`);
    setQrIssuedAt(Math.floor(Date.now() / 1000));
    setQrSecondsLeft(QR_TTL_SECONDS);
  };

  const handleNewOrder = () => {
    setSettledIntent(null);
    refreshQr();
    setAmount("3.50");
  };

  // Restore merchant's saved settlement wallet
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

  // Fetch settlements report for End-of-Day Close
  const fetchSettlements = useCallback(async () => {
    setIsLoadingSettlements(true);
    setSettlementError(null);
    try {
      const res = await fetch(
        `${PACT_CONFIG.relayerApiUrl}/api/v1/merchants/${merchantAddress}/settlements`
      );
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      setSettlements(data);
    } catch (err: any) {
      console.error("Failed to load settlements:", err);
      setSettlementError(err.message || "Failed to load settlements");
    } finally {
      setIsLoadingSettlements(false);
    }
  }, [merchantAddress]);

  useEffect(() => {
    if (activeTab === "eod") {
      fetchSettlements();
    }
  }, [activeTab, fetchSettlements]);

  const handleExportCsv = () => {
    const url = `${PACT_CONFIG.relayerApiUrl}/api/v1/merchants/${merchantAddress}/settlements?format=csv`;
    window.open(url, "_blank");
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-screen flex flex-col justify-between p-4 sm:p-6 bg-surface-base">
      {/* Top Header & Tab Navigation */}
      <div>
        <div className="flex items-center justify-between border-b border-surface-border pb-3">
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

          {/* Tab Selector: POS Terminal vs End-of-Day Close */}
          <div className="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-surface-border text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("terminal")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                activeTab === "terminal"
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              POS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("eod")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1 ${
                activeTab === "eod"
                  ? "bg-primary text-white shadow-sm"
                  : "text-text-muted hover:text-text-main"
              }`}
            >
              <FileSpreadsheet className="w-3 h-3" />
              <span>Chốt sổ</span>
            </button>
          </div>
        </div>

        {/* Payout wallet settings dropdown */}
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
      </div>

      {activeTab === "eod" ? (
        /* ============================================================ */
        /* TAB 2: End-of-Day Close (Chốt sổ) & CSV Export               */
        /* ============================================================ */
        <div className="flex-1 py-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text-main flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-primary" />
                <span>Chốt sổ cuối ngày</span>
              </h2>
              <p className="text-xs text-text-muted">Tổng kết doanh thu và lệnh thanh toán</p>
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          {isLoadingSettlements ? (
            <div className="p-8 text-center text-xs text-text-muted animate-pulse">
              Đang tải danh sách thanh toán...
            </div>
          ) : settlementError ? (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              {settlementError}
            </div>
          ) : settlements ? (
            <div className="space-y-3 flex-1 flex flex-col">
              {/* Daily Aggregated KPI Summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3.5 rounded-2xl bg-surface-card border border-surface-border">
                  <span className="text-[10px] uppercase font-bold text-text-muted">Tổng Doanh Thu</span>
                  <div className="text-2xl font-black text-emerald-400 mt-0.5">
                    ${(Number(settlements.totalVolumeAtomic || 0) / 1e6).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-text-muted">USDC đã thanh toán</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-surface-card border border-surface-border">
                  <span className="text-[10px] uppercase font-bold text-text-muted">Số Giao Dịch</span>
                  <div className="text-2xl font-black text-text-main mt-0.5">
                    {settlements.count || 0}
                  </div>
                  <span className="text-[10px] text-text-muted">đơn hoàn tất</span>
                </div>
              </div>

              {/* Totals by Chain Breakdown */}
              <div className="p-3 rounded-2xl bg-surface-card border border-surface-border space-y-2">
                <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">
                  Doanh Thu Theo Mạng (By Chain)
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                  {[
                    { chainId: 421614, name: "Arbitrum" },
                    { chainId: 84532, name: "Base" },
                    { chainId: 43113, name: "Fuji" },
                  ].map((c) => {
                    const data = settlements.breakdown?.[c.chainId];
                    const vol = data ? (Number(data.volumeAtomic) / 1e6).toFixed(2) : "0.00";
                    const cnt = data ? data.count : 0;
                    return (
                      <div key={c.chainId} className="p-2 rounded-xl bg-surface-base border border-surface-border/40">
                        <div className="font-semibold text-text-muted text-[11px]">{c.name}</div>
                        <div className="font-bold text-text-main">${vol}</div>
                        <div className="text-[10px] text-text-muted font-mono">{cnt} tx</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transactions List */}
              <div className="flex-1 rounded-2xl bg-surface-card border border-surface-border p-3 overflow-hidden flex flex-col">
                <span className="text-[11px] font-bold text-text-muted mb-2">Lịch Sử Lệnh Đã Khớp</span>
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[220px] pr-1">
                  {settlements.rows?.length === 0 ? (
                    <div className="text-xs text-text-muted text-center py-6">
                      Chưa có giao dịch thanh toán nào hôm nay.
                    </div>
                  ) : (
                    settlements.rows?.map((row: any) => (
                      <div
                        key={row.intent_id}
                        className="p-2.5 rounded-xl bg-surface-base border border-surface-border/50 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-text-main flex items-center gap-1.5 font-mono">
                            <span>{row.order_id || row.intent_id.slice(0, 10)}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-card border border-surface-border text-primary font-sans">
                              {getChainName(row.target_chain_id)}
                            </span>
                          </div>
                          <div className="text-[10px] text-text-muted font-mono">
                            {new Date(row.created_at).toLocaleTimeString()} • {row.sender.slice(0, 6)}...{row.sender.slice(-4)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-emerald-400">
                            +${(Number(row.amount_in) / 1e6).toFixed(2)}
                          </div>
                          {row.dest_tx_hash && (
                            <a
                              href={getExplorerTxUrl(row.target_chain_id, row.dest_tx_hash)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 justify-end"
                            >
                              <span>tx</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        /* ============================================================ */
        /* TAB 1: POS Merchant Terminal & QR Display                    */
        /* ============================================================ */
        <>
          {/* Mode Controls: Dynamic vs Static Standee QR + Destination Chain Selector */}
          <div className="pt-3 space-y-2">
            {/* Toggle: Dynamic QR vs Static Standee QR */}
            <div className="grid grid-cols-2 gap-1.5 bg-surface-card p-1 rounded-2xl border border-surface-border text-xs">
              <button
                type="button"
                onClick={() => setQrMode("dynamic")}
                className={`py-1.5 rounded-xl font-bold transition-all ${
                  qrMode === "dynamic"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Dynamic QR (POS)
              </button>
              <button
                type="button"
                onClick={() => setQrMode("static")}
                className={`py-1.5 rounded-xl font-bold transition-all ${
                  qrMode === "static"
                    ? "bg-primary text-white shadow-sm"
                    : "text-text-muted hover:text-text-main"
                }`}
              >
                Static Standee (Sticker)
              </button>
            </div>

            {/* Destination Chain Selector */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-muted">Nhận tiền qua:</span>
              <div className="flex items-center gap-1 bg-surface-card p-1 rounded-xl border border-surface-border text-xs">
                <button
                  type="button"
                  onClick={() => setTargetChainId(421614)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                    targetChainId === 421614
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  Arb
                </button>
                <button
                  type="button"
                  onClick={() => setTargetChainId(84532)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                    targetChainId === 84532
                      ? "bg-blue-500 text-white shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  Base
                </button>
                <button
                  type="button"
                  onClick={() => setTargetChainId(43113)}
                  className={`px-2 py-0.5 rounded-lg font-medium transition-all ${
                    targetChainId === 43113
                      ? "bg-red-500 text-white shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  Fuji
                </button>
              </div>
            </div>

            {/* Optional Order Note / Tag Input (Appended into orderId) */}
            <div className="flex items-center gap-2 bg-surface-card border border-surface-border rounded-xl px-3 py-1.5">
              <Tag className="w-3.5 h-3.5 text-text-muted shrink-0" />
              <input
                type="text"
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="Order Note / Tag (e.g. Table 2, VIP)"
                className="bg-transparent text-xs text-text-main focus:outline-none w-full placeholder:text-text-muted/60"
              />
              {orderNote && (
                <button
                  type="button"
                  onClick={() => setOrderNote("")}
                  className="text-[10px] text-text-muted hover:text-text-main"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Main Center Area: QR Screen or Success State */}
          <div className="flex-1 flex flex-col items-center justify-center py-4">
            {settledIntent ? (
              /* Settlement State Transition: Green full-screen flash */
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
              <div className="w-full flex flex-col items-center space-y-3">
                <div className="relative p-5 bg-white rounded-3xl shadow-2xl border-4 border-surface-border flex flex-col items-center">
                  <QRCodeSVG
                    value={qrPayload}
                    size={210}
                    level="M"
                    includeMargin={false}
                  />
                  <div className="mt-3 text-[11px] font-mono text-slate-600 font-semibold flex items-center gap-1.5">
                    <span className="truncate max-w-[140px]">{currentOrderId}</span>
                    <span>•</span>
                    <span className="text-primary">{getChainName(targetChainId)}</span>
                  </div>
                </div>

                <div className="text-center space-y-1">
                  {qrMode === "static" ? (
                    <>
                      <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-center gap-1">
                        <Store className="w-3.5 h-3.5" />
                        <span>Static Standee QR (No Expiry)</span>
                      </div>
                      <div className="text-sm text-text-muted">
                        Counter sticker: Customer enters amount upon scan
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-text-muted font-medium">Customer Scan Total</div>
                      <div className="text-4xl font-black text-text-main tracking-tight">
                        ${Number(amount || 0).toFixed(2)}{" "}
                        <span className="text-sm font-semibold text-text-muted">USDC</span>
                      </div>
                      <div className="text-[11px] text-text-muted font-mono">
                        QR refreshes in {Math.floor(qrSecondsLeft / 60)}:
                        {String(qrSecondsLeft % 60).padStart(2, "0")}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Numeric Keypad for Dynamic Invoicing */}
          {!settledIntent && qrMode === "dynamic" && (
            <div className="w-full bg-surface-card border border-surface-border rounded-3xl p-3 shadow-xl">
              <div className="grid grid-cols-3 gap-2 text-lg font-bold">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleKeypadPress(key)}
                    className="h-11 rounded-xl bg-surface-base hover:bg-surface-border/40 active:scale-95 text-text-main transition-all flex items-center justify-center border border-surface-border/40"
                  >
                    {key}
                  </button>
                ))}
              </div>

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleKeypadPress("C")}
                  className="flex-1 py-1.5 rounded-xl bg-surface-base border border-surface-border text-xs font-semibold text-text-muted hover:text-text-main"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleNewOrder}
                  className="flex-1 py-1.5 rounded-xl bg-surface-base border border-surface-border text-xs font-semibold text-text-muted hover:text-text-main flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>New ID</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
