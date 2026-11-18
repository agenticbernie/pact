"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, Clock, ShieldCheck, ChevronRight, Loader2, ArrowRight } from "lucide-react";
import { type PactPaymentRequest, type SupportedTargetChainId, paymentAmountError } from "@/lib/pact-schema";
import { getChainName } from "@/lib/config";
import { Dialog } from "@/components/Dialog";

interface QuoteRoute {
  priority: number;
  name: string;
  available?: boolean;
  unavailableReason?: string | null;
  estimatedSeconds: string;
  fee: string;
  feeDisplayUsd: string;
  feeAtomic?: string;
  totalPayable: string;
  totalPayableDisplayUsd: string;
  totalPayableAtomic?: string;
}

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
  lightningAvailable?: boolean;
  lightningUnavailableReason?: string | null;
  routes: { lightning: QuoteRoute; economy: QuoteRoute };
}

interface Props {
  paymentReq: PactPaymentRequest;
  quote: QuoteData | null;
  isLoadingQuote: boolean;
  onConfirmPayment: (priority: number, quote: QuoteData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  accountConnected?: boolean;
  isConnecting?: boolean;
  onConnect?: (mode: "register" | "login") => Promise<void>;
  onRefreshQuote?: (amount: string, chainId: SupportedTargetChainId) => Promise<void>;
}

export function RouteSelectorModal({ paymentReq, quote, isLoadingQuote, onConfirmPayment, onCancel, isSubmitting = false, onRefreshQuote, error, accountConnected = true, isConnecting = false, onConnect }: Props) {
  const [selectedRoute, setSelectedRoute] = useState<"lightning" | "economy">("lightning");
  const [chainId, setChainId] = useState(paymentReq.targetChainId);
  const [amount, setAmount] = useState(paymentReq.amount);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [position, setPosition] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const submitted = useRef(false);
  const editable = paymentReq.editable === true;
  const amountError = paymentAmountError(amount);
  const lightningDisabled = quote?.lightningAvailable === false || quote?.routes.lightning.available === false;
  const economyDisabled = quote?.routes.economy.available === false;
  const activeRoute = quote?.routes[selectedRoute];
  const quoteMatches = Boolean(quote && quote.orderId === paymentReq.orderId && quote.merchant?.toLowerCase() === paymentReq.merchant.toLowerCase() && quote.targetChainId === chainId && Number(quote.amount) === Number(amount));
  const expired = Boolean(quote && quote.deadline <= now + 30);
  const canPay = Boolean(accountConnected && !isConnecting && quoteMatches && !expired && !amountError && activeRoute && activeRoute.available !== false && !(selectedRoute === "lightning" && lightningDisabled) && !isLoadingQuote && !isSubmitting);

  useEffect(() => {
    if (lightningDisabled && !economyDisabled) setSelectedRoute("economy");
    else if (economyDisabled && !lightningDisabled) setSelectedRoute("lightning");
  }, [lightningDisabled, economyDisabled]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => { clearInterval(tick); if (timer.current) clearTimeout(timer.current); };
  }, []);
  useEffect(() => { if (!isSubmitting) { submitted.current = false; setPosition(0); } }, [isSubmitting, quote]);

  const refresh = (nextAmount: string, nextChain: SupportedTargetChainId, debounce = false) => {
    if (timer.current) clearTimeout(timer.current);
    if (paymentAmountError(nextAmount)) return;
    const request = () => { void onRefreshQuote?.(nextAmount, nextChain); };
    if (debounce) timer.current = setTimeout(request, 400);
    else request();
  };
  const confirm = async () => {
    if (!canPay || !quote || submitted.current) return;
    submitted.current = true;
    try { await onConfirmPayment(selectedRoute === "lightning" ? 0 : 1, quote); }
    finally { submitted.current = false; setPosition(0); }
  };

  return (
    <Dialog labelledBy="payment-title" onClose={onCancel} busy={isSubmitting} bottom>
      <div className="space-y-4">
        <div className="w-12 h-1.5 bg-surface-border rounded-full mx-auto" />
        <div className="border-b border-surface-border pb-3">
          <p className="text-[10px] uppercase font-bold tracking-wider text-primary">Testnet USDC payment</p>
          <h2 id="payment-title" className="text-lg font-bold mt-1">Review payment</h2>
          <p className="text-xs text-text-muted mt-1">Recipient on {getChainName(chainId)}</p>
          <p className="text-xs font-mono break-all mt-1">{paymentReq.merchant}</p>
        </div>
        {!accountConnected && <div className="rounded-xl border border-surface-border p-3 space-y-2"><p className="text-sm">Connect a passkey account to pay.</p><div className="flex gap-2"><button type="button" disabled={isConnecting} onClick={() => void onConnect?.("register")} className="border border-surface-border rounded-lg px-3 py-2 text-xs">Create account</button><button type="button" disabled={isConnecting} onClick={() => void onConnect?.("login")} className="border border-surface-border rounded-lg px-3 py-2 text-xs">{isConnecting ? "Connecting…" : "Sign in"}</button></div></div>}
        {error && <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 p-3 rounded-xl break-words">{error}</p>}
        <fieldset disabled={isSubmitting || !editable} className="space-y-2">
          <legend className="text-xs font-semibold text-text-muted mb-2">Destination network</legend>
          <div className="grid grid-cols-3 gap-2">
            {([421614, 84532, 43113] as SupportedTargetChainId[]).map((id) => (
              <button type="button" key={id} aria-pressed={chainId === id} onClick={() => { setChainId(id); refresh(amount, id); }}
                className={`p-2 rounded-xl border text-xs font-semibold ${chainId === id ? "border-primary bg-primary/10 text-text-main" : "border-surface-border text-text-muted"}`}>
                {id === 421614 ? "Arbitrum" : id === 84532 ? "Base" : "Fuji"}
              </button>
            ))}
          </div>
          <label htmlFor="payment-amount" className="block text-xs font-semibold text-text-muted pt-2">Recipient receives (USDC)</label>
          <input id="payment-amount" type="text" inputMode="decimal" value={amount} aria-invalid={Boolean(amountError)} aria-describedby="payment-amount-help" readOnly={!editable}
            onChange={(event) => { setAmount(event.target.value); refresh(event.target.value, chainId, true); }}
            className="w-full bg-surface-base font-mono text-2xl font-bold px-4 py-2.5 rounded-xl border border-surface-border" />
          {editable && <div className="flex gap-2">{["1.00", "3.50", "10.00", "25.00"].map((preset) => (
            <button key={preset} type="button" onClick={() => { setAmount(preset); refresh(preset, chainId); }} className="px-3 py-1 rounded-lg border border-surface-border text-xs">${preset}</button>
          ))}</div>}
        </fieldset>
        <p id="payment-amount-help" className={`text-xs ${amountError ? "text-red-300" : "text-text-muted"}`}>
          {amountError || (editable ? "1–50 USDC per payment. Network fees are sponsored." : "The merchant sets the invoice amount and network.")}
        </p>
        <fieldset disabled={isSubmitting}>
          <legend className="text-xs font-semibold text-text-muted mb-2">Payment route</legend>
          <div className="grid grid-cols-2 gap-2.5">
            {(["lightning", "economy"] as const).map((name) => {
              const route = quote?.routes[name];
              const disabled = name === "lightning" ? lightningDisabled : economyDisabled;
              const Icon = name === "lightning" ? Zap : Clock;
              return <button key={name} type="button" disabled={disabled} aria-pressed={selectedRoute === name} onClick={() => setSelectedRoute(name)}
                className={`p-3 rounded-2xl border text-left disabled:opacity-50 ${selectedRoute === name ? "border-primary bg-primary/10" : "border-surface-border bg-surface-base"}`}>
                <span className="flex gap-1 items-center font-bold text-sm"><Icon className="w-4 h-4" />{name === "lightning" ? "Lightning" : "Economy"}</span>
                <span className="text-xs text-text-muted block mt-1">{disabled ? "Unavailable" : `${route?.estimatedSeconds || (name === "lightning" ? "1–3" : "15–45")}s estimated`}</span>
                <span className="text-xs block mt-1">Fee: {route ? `${route.fee} USDC` : "Waiting for quote"}</span>
              </button>;
            })}
          </div>
        </fieldset>
        {activeRoute?.unavailableReason && <p className="text-xs text-amber-300">{activeRoute.unavailableReason}</p>}
        <div className="text-xs bg-surface-base border border-surface-border rounded-xl p-3 space-y-2">
          <div className="flex justify-between"><span className="text-text-muted">Recipient receives</span><span>{quoteMatches ? quote?.amount : amount} USDC</span></div>
          <div className="flex justify-between font-bold"><span>Total including route fee</span><span>{quoteMatches ? activeRoute?.totalPayable : "—"} USDC</span></div>
        </div>
        <p className="text-xs text-text-muted flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-success" />Unclaimed escrow is refundable after the 15-minute deadline. Refunds require an active signing session.</p>
        {(!quote || expired || (!quoteMatches && !isLoadingQuote)) && !amountError && !isSubmitting && (
          <button type="button" onClick={() => refresh(amount, chainId)} disabled={isLoadingQuote} className="w-full py-2 text-sm border border-surface-border rounded-xl disabled:opacity-50">{isLoadingQuote ? "Getting quote…" : expired ? "Quote expired — get a fresh quote" : "Retry quote"}</button>
        )}
        <button type="button" onClick={() => void confirm()} disabled={!canPay}
          className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2">
          {isSubmitting || isLoadingQuote ? <><Loader2 className="w-4 h-4 animate-spin" />{isSubmitting ? "Submitting payment…" : "Updating quote…"}</> : <><span>Pay {quoteMatches ? activeRoute?.totalPayable : "—"} USDC</span><ArrowRight className="w-4 h-4" /></>}
        </button>
        <div ref={trackRef} role="group" aria-label="Optional slide to pay" aria-disabled={!canPay}
          onPointerDown={(event) => { if (!canPay) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => {
            if (!dragging.current || !canPay || !trackRef.current) return;
            const rect = trackRef.current.getBoundingClientRect();
            const next = Math.max(0, Math.min(1, (event.clientX - rect.left - 24) / Math.max(1, rect.width - 48)));
            setPosition(next);
            if (next >= 0.95) { dragging.current = false; void confirm(); }
          }}
          onPointerUp={() => { dragging.current = false; setPosition(0); }} onPointerCancel={() => { dragging.current = false; setPosition(0); }}
          className={`relative w-full h-12 bg-surface-base border border-surface-border rounded-full select-none touch-none flex items-center overflow-hidden ${canPay ? "" : "opacity-40"}`}>
          <span className="w-full text-center text-xs text-text-muted pointer-events-none">Or slide to pay</span>
          <span className="absolute left-1 top-1 bottom-1 w-10 rounded-full bg-primary text-white flex items-center justify-center" style={{ transform: `translateX(${position * Math.max(0, (trackRef.current?.clientWidth || 48) - 48)}px)` }}><ChevronRight className="w-5 h-5" /></span>
        </div>
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="w-full text-sm text-text-muted py-2 disabled:opacity-50">Cancel</button>
      </div>
    </Dialog>
  );
}
