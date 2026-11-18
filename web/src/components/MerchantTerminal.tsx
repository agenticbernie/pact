"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, RefreshCw, ArrowRight, ExternalLink, Download, Store, Loader2 } from "lucide-react";
import { PACT_CONFIG, getChainName, getExplorerTxUrl } from "@/lib/config";
import { playTingTingSound, triggerHapticFeedback } from "@/lib/feedback";
import { createOrderId, isPaymentAddress, paymentAmountError, type SupportedTargetChainId } from "@/lib/pact-schema";
import { readStored, writeStored } from "@/lib/storage";

const TTL = 300;
const STORAGE_KEY = "pact_merchant_address_v1";
interface Settlement {
  intent_id: string;
  order_id: string | null;
  sender: string;
  receiver: string;
  target_chain_id: number;
  amount_in: string;
  priority: number;
  dest_tx_hash: string | null;
  source_tx_hash: string | null;
  created_at: number;
}
interface SettlementSummary {
  rows: Settlement[];
  totalVolumeAtomic: string;
  count: number;
  breakdown: Record<number, { count: number; volumeAtomic: string }>;
}
const localDate = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; };
const usd = (atomic: string) => (Number(atomic) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function MerchantTerminal({ active = true }: { active?: boolean }) {
  const [tab, setTab] = useState<"terminal" | "settlements">("terminal");
  const [mode, setMode] = useState<"dynamic" | "static">("dynamic");
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [chainId, setChainId] = useState<SupportedTargetChainId>(421614);
  const [merchant, setMerchant] = useState("");
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState(false);
  const [issuedAt, setIssuedAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(TTL);
  const [baseId, setBaseId] = useState("");
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState<Settlement | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const observedSince = useRef(Date.now());
  const validWallet = isPaymentAddress(merchant);
  const amountError = paymentAmountError(amount);
  const orderId = mode === "static" ? `STATIC-${chainId}-${merchant.toLowerCase()}` : `${baseId}${note.trim() ? `_${note.trim().replace(/\s+/g, "-")}` : ""}`;
  const validInvoice = ready && validWallet && (mode === "static" || !amountError);

  const refreshQr = () => {
    setBaseId(createOrderId()); setIssuedAt(Math.floor(Date.now() / 1000)); setSecondsLeft(TTL); setSettled(null); setPollError(null);
  };
  const editInvoice = () => { refreshQr(); observedSince.current = Date.now(); };

  useEffect(() => {
    const saved = readStored(STORAGE_KEY);
    const address = saved || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || "";
    if (isPaymentAddress(address)) { setMerchant(address); setDraft(address); }
    else setSettings(true);
    setBaseId(createOrderId()); setIssuedAt(Math.floor(Date.now() / 1000)); setDate(localDate()); setReady(true);
  }, []);

  const qrPayload = useMemo(() => JSON.stringify({ protocol: "pact", version: "1.0", orderId, merchant, targetChainId: chainId, targetToken: "USDC", amount: mode === "static" ? "0" : amount, ...(mode === "dynamic" ? { timestamp: issuedAt } : {}) }), [orderId, merchant, chainId, mode, amount, issuedAt]);

  useEffect(() => {
    if (!validInvoice || mode === "static" || settled) return;
    const timer = setInterval(() => {
      const remaining = issuedAt + TTL - Math.floor(Date.now() / 1000);
      if (remaining <= 0) { setBaseId(createOrderId()); setIssuedAt(Math.floor(Date.now() / 1000)); setSecondsLeft(TTL); }
      else setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [issuedAt, mode, settled, validInvoice]);

  useEffect(() => {
    if (!active || !validInvoice || settled) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const query = new URLSearchParams({ merchant });
        if (mode === "static") { query.set("prefix", "1"); query.set("after", String(observedSince.current)); }
        const response = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/orders/${encodeURIComponent(orderId)}?${query}`, { signal: controller.signal });
        if (disposed) return;
        if (response.status === 404) { setPollError(null); return; }
        if (!response.ok) throw new Error("Payment status is unavailable. Retrying automatically.");
        const data = await response.json();
        if (disposed) return;
        setPollError(null);
        if (data.isSettled && data.intent) {
          const intent = data.intent as Settlement;
          if (intent.receiver.toLowerCase() !== merchant.toLowerCase() || intent.target_chain_id !== chainId || (mode === "dynamic" && Number(intent.amount_in) !== Math.round(Number(amount) * 1e6))) {
            setPollError("A payment does not match this invoice's recipient, network, or amount. Check the settlement report before accepting it."); return;
          }
          setSettled(intent); playTingTingSound(); triggerHapticFeedback();
        }
      } catch (err) { if (!disposed) setPollError((err as Error).message || "Relayer offline. Retrying automatically."); }
      finally { clearTimeout(timeout); if (!disposed) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [active, validInvoice, settled, orderId, merchant, chainId, amount, mode]);

  const reportQuery = useMemo(() => {
    if (!date) return "";
    const from = new Date(`${date}T00:00:00`);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    return new URLSearchParams({ from: String(from.getTime()), to: String(to.getTime() - 1) }).toString();
  }, [date]);

  useEffect(() => {
    if (!active || tab !== "settlements" || !validWallet || !reportQuery) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let disposed = false;
    setLoading(true); setReportError(null); setSummary(null);
    void fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/merchants/${merchant}/settlements?${reportQuery}`, { signal: controller.signal })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load settlements."); if (!Array.isArray(data.rows)) throw new Error("Invalid settlement response."); if (!disposed) setSummary(data); })
      .catch(() => { if (!disposed) setReportError("Could not load the settlement report. Check the connection and retry."); })
      .finally(() => { clearTimeout(timeout); if (!disposed) setLoading(false); });
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [active, tab, merchant, validWallet, reportQuery, revision]);

  const exportCsv = async () => {
    setExporting(true); setReportError(null);
    try {
      const response = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/merchants/${merchant}/settlements?${reportQuery}&format=csv`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("CSV export failed.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `pact-settlements-${date}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setReportError("Could not export the CSV. Please retry."); }
    finally { setExporting(false); }
  };

  const keypad = (key: string) => {
    setAmount((previous) => {
      if (key === "C") return "0";
      if (key === "backspace") return previous.length > 1 ? previous.slice(0, -1) : "0";
      if (key === ".") return previous.includes(".") ? previous : `${previous}.`;
      if (previous.includes(".") && previous.split(".")[1].length >= 2) return previous;
      return previous === "0" ? key : previous.length < 8 ? previous + key : previous;
    });
    editInvoice();
  };

  return (
    <div className="w-full max-w-md mx-auto min-h-[calc(100dvh-5rem)] flex flex-col p-4 sm:p-6 bg-surface-base gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-3">
        <div><p className="text-[10px] font-bold uppercase tracking-widest text-primary">Testnet merchant terminal</p><h1 className="text-lg font-bold">Pact point of sale</h1><button type="button" onClick={() => { setDraft(merchant); setSettings((value) => !value); }} aria-expanded={settings} className="text-xs text-text-muted underline py-2">Set payout wallet</button></div>
        <nav aria-label="Merchant views" className="flex gap-1 bg-surface-card p-1 rounded-xl border border-surface-border">{(["terminal", "settlements"] as const).map((name) => <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)} className={`px-3 py-2 rounded-lg text-xs font-bold ${tab === name ? "bg-primary text-white" : "text-text-muted"}`}>{name === "terminal" ? "POS" : "Daily close"}</button>)}</nav>
      </header>
      {settings && <form onSubmit={(event) => { event.preventDefault(); const address = draft.trim(); if (!isPaymentAddress(address)) { setSettingsError("Enter a valid, nonzero EVM wallet address."); return; } const saved = writeStored(STORAGE_KEY, address); setMerchant(address); setSettings(false); setSettingsError(saved ? null : "Wallet updated for this visit only; browser storage is unavailable."); editInvoice(); setSummary(null); }} className="p-3 rounded-2xl bg-surface-card border border-surface-border space-y-2"><label htmlFor="payout-wallet" className="text-xs text-text-muted">Payout wallet — receives test USDC</label><input id="payout-wallet" required value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="0x…" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full p-3 rounded-xl bg-surface-base border border-surface-border text-xs font-mono" /><button type="submit" disabled={!isPaymentAddress(draft.trim())} className="w-full py-2 bg-primary rounded-xl text-xs font-bold disabled:opacity-40">Save payout wallet</button></form>}
      {settingsError && <p role="status" className="text-xs text-amber-300">{settingsError}</p>}
      {validWallet && <p className="text-[10px] text-text-muted break-all font-mono">Payout: {merchant}</p>}
      {tab === "settlements" ? <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><label htmlFor="settlement-date" className="block text-xs text-text-muted mb-1">Daily settlement report (local time)</label><input id="settlement-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="p-2 rounded-xl bg-surface-card border border-surface-border text-sm" /></div><div className="flex gap-2"><button type="button" disabled={loading || !validWallet} onClick={() => setRevision((value) => value + 1)} aria-label="Refresh settlement report" className="p-3 border border-surface-border rounded-xl"><RefreshCw className="w-4 h-4" /></button><button type="button" disabled={exporting || !validWallet || !reportQuery} onClick={() => void exportCsv()} className="flex items-center gap-1 px-3 py-2 bg-success/20 text-success rounded-xl text-xs font-bold disabled:opacity-40">{exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}CSV</button></div></div>
        {!validWallet && <p className="text-sm text-amber-300">Set your payout wallet to view settlements.</p>}
        {loading && <p role="status" className="text-sm text-text-muted">Loading settlements…</p>}
        {reportError && <p role="alert" className="p-3 border border-red-500/30 rounded-xl text-sm text-red-300">{reportError}</p>}
        {summary && <><div className="grid grid-cols-2 gap-3"><div className="p-4 bg-surface-card border border-surface-border rounded-2xl"><p className="text-xs text-text-muted">Received USDC</p><p className="text-2xl font-bold text-success break-words">${usd(summary.totalVolumeAtomic)}</p></div><div className="p-4 bg-surface-card border border-surface-border rounded-2xl"><p className="text-xs text-text-muted">Completed payments</p><p className="text-2xl font-bold">{summary.count}</p></div></div>
          <div className="grid grid-cols-3 gap-2">{[421614, 84532, 43113].map((id) => <div key={id} className="p-2 rounded-xl border border-surface-border text-center"><p className="text-[10px] text-text-muted">{getChainName(id)}</p><p className="text-xs font-bold break-words">${usd(summary.breakdown[id]?.volumeAtomic || "0")}</p><p className="text-[10px] text-text-muted">{summary.breakdown[id]?.count || 0} payments</p></div>)}</div>
          <h2 className="font-bold text-sm">Settled payments</h2>{summary.rows.length === 0 ? <p className="text-sm text-text-muted py-6 text-center">No settled payments on this date.</p> : <ul className="space-y-2">{summary.rows.map((row) => <li key={row.intent_id} className="p-3 bg-surface-card border border-surface-border rounded-xl flex justify-between gap-3 text-xs"><div className="min-w-0"><p className="font-mono break-all">{row.order_id || row.intent_id}</p><p className="text-text-muted mt-1">{getChainName(row.target_chain_id)} · {new Date(row.created_at).toLocaleTimeString()}</p></div><div className="shrink-0 text-right"><p className="font-bold text-success">+{usd(row.amount_in)}</p>{row.dest_tx_hash && <a href={getExplorerTxUrl(row.target_chain_id, row.dest_tx_hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary mt-1">Receipt<ExternalLink className="w-3 h-3" /></a>}</div></li>)}</ul>}
        </>}
      </div> : <>
        <fieldset className="grid grid-cols-2 gap-2" disabled={Boolean(settled)}><legend className="sr-only">QR type</legend>{(["dynamic", "static"] as const).map((name) => <button key={name} type="button" aria-pressed={mode === name} onClick={() => { setMode(name); editInvoice(); }} className={`py-3 rounded-xl border text-xs font-bold ${mode === name ? "bg-primary border-primary text-white" : "border-surface-border text-text-muted"}`}>{name === "dynamic" ? "Invoice QR" : "Reusable QR"}</button>)}</fieldset>
        <label htmlFor="merchant-chain" className="text-xs text-text-muted">Receive on</label><select id="merchant-chain" disabled={Boolean(settled)} value={chainId} onChange={(event) => { setChainId(Number(event.target.value) as SupportedTargetChainId); editInvoice(); }} className="w-full px-3 py-2 rounded-xl bg-surface-card border border-surface-border text-sm">{[421614, 84532, 43113].map((id) => <option key={id} value={id}>{getChainName(id)}</option>)}</select>
        {mode === "dynamic" && !settled && <><label htmlFor="order-note" className="sr-only">Order note</label><input id="order-note" value={note} maxLength={48} onChange={(event) => { setNote(event.target.value); editInvoice(); }} placeholder="Order note (optional)" className="w-full px-3 py-2 rounded-xl bg-surface-card border border-surface-border text-xs" /></>}
        {pollError && <p role="status" className="text-xs text-amber-300">{pollError}</p>}
        <div className="flex-1 flex flex-col items-center justify-center py-2 gap-3">
          {settled ? <div className="w-full bg-surface-card border-2 border-success rounded-3xl p-5 text-center space-y-4"><CheckCircle2 className="w-14 h-14 text-success mx-auto" /><h2 className="text-2xl font-bold">Received {usd(settled.amount_in)} USDC</h2><p className="text-sm text-text-muted">Confirmed on {getChainName(settled.target_chain_id)}</p><p className="text-xs font-mono break-all">{settled.order_id}</p>{settled.dest_tx_hash && <a href={getExplorerTxUrl(settled.target_chain_id, settled.dest_tx_hash)} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">View settlement receipt</a>}<button type="button" onClick={() => { observedSince.current = Date.now(); refreshQr(); if (mode === "dynamic") { setAmount("0"); setNote(""); } }} className="w-full py-3 bg-primary rounded-xl font-bold text-sm flex items-center justify-center gap-2">Next customer<ArrowRight className="w-4 h-4" /></button></div> : <>
            {validInvoice ? <div className="p-5 bg-white rounded-3xl text-center max-w-full"><QRCodeSVG value={qrPayload} size={210} level="M" marginSize={4} className="max-w-full h-auto" /><p className="text-[10px] text-slate-600 mt-2 break-all max-w-[230px]">{orderId}</p></div> : <div className="w-full p-6 bg-surface-card border border-surface-border rounded-3xl text-center"><Store className="w-10 h-10 text-primary mx-auto mb-3" /><p className="text-sm text-text-muted">{!validWallet ? "Set your own payout wallet before accepting payments." : "Enter an amount from 1 to 50 USDC to create an invoice."}</p></div>}
            {mode === "static" ? <><p className="text-sm font-bold text-success">Reusable QR — no expiry</p><p className="text-xs text-text-muted text-center">Customers enter the amount. Each payment gets its own tracking ID.</p></> : <><label htmlFor="invoice-amount" className="text-xs text-text-muted">Invoice amount (USDC)</label><input id="invoice-amount" value={amount} inputMode="decimal" onChange={(event) => { if (/^\d{0,6}(?:\.\d{0,2})?$/.test(event.target.value)) { setAmount(event.target.value); editInvoice(); } }} aria-invalid={Boolean(amountError)} className="w-full text-center text-3xl font-bold p-2 bg-transparent rounded-xl border border-surface-border" />{amountError && <p className="text-xs text-amber-300 text-center">{amountError}</p>}{validInvoice && <p className="text-xs text-text-muted">QR refreshes in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</p>}</>}
          </>}
        </div>
        {!settled && mode === "dynamic" && <div className="bg-surface-card border border-surface-border rounded-3xl p-3"><div className="grid grid-cols-3 gap-2">{["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"].map((key) => <button key={key} type="button" onClick={() => keypad(key)} aria-label={key === "backspace" ? "Delete last digit" : key === "." ? "Decimal point" : key} className="h-11 rounded-xl bg-surface-base border border-surface-border text-lg font-bold hover:bg-surface-border">{key === "backspace" ? "⌫" : key}</button>)}</div><div className="flex gap-2 mt-3"><button type="button" onClick={() => keypad("C")} className="flex-1 py-2 text-xs border border-surface-border rounded-xl">Clear</button><button type="button" onClick={refreshQr} className="flex-1 py-2 text-xs border border-surface-border rounded-xl">Refresh invoice ID</button></div></div>}
      </>}
    </div>
  );
}
