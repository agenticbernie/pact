"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QrScanner } from "@/components/QrScanner";
import { Dialog } from "@/components/Dialog";
import { RouteSelectorModal, type QuoteData } from "@/components/RouteSelectorModal";
import { createOrderId, isPaymentAddress, paymentAmountError, type PactPaymentRequest, type SupportedTargetChainId } from "@/lib/pact-schema";
import { PACT_CONFIG, getChainName, getExplorerTxUrl } from "@/lib/config";
import { readStored, writeStored, removeStored } from "@/lib/storage";
import { playTingTingSound, triggerHapticFeedback } from "@/lib/feedback";
import { onboardPasskeySmartAccount, loadSavedSmartAccountSession, clearSmartAccountSession, getSmartAccountUsdcBalance, claimGaslessFaucet, executeGaslessPaymentIntent, executeGaslessRefund, type PactSmartAccountSession } from "@/lib/zerodev";
import { CheckCircle2, RefreshCw, Fingerprint, Coins, LogOut, ExternalLink, Loader2, Clock, Keyboard, ArrowRight, X } from "lucide-react";
import { parseUnits, type Address, type Hex } from "viem";

const PENDING_STORAGE_KEY = "pact_pending_payment_v2";
const QR_MAX_AGE_SECONDS = 360;
interface Intent {
  intent_id: Hex;
  order_id: string | null;
  sender: Address;
  receiver: Address;
  amount_in: string;
  target_chain_id: number;
  hash_lock: Hex;
  state: string;
  source_tx_hash: Hex | null;
  dest_tx_hash: Hex | null;
  claim_tx_hash: Hex | null;
}
interface PendingPayment {
  orderId: string;
  hashLock: Hex;
  sender: Address;
  deadline: number;
  startedAt: number;
  intentId: Hex | null;
  amountUsd: string;
  targetChainId: number;
  userOpHash: Hex | null;
  sourceTxHash: Hex | null;
  state?: string;
}

export function PayerClient({ active = true }: { active?: boolean }) {
  const [isScanning, setIsScanning] = useState(true);
  const [scannedRequest, setScannedRequest] = useState<PactPaymentRequest | null>(null);
  const [staticRequest, setStaticRequest] = useState<PactPaymentRequest | null>(null);
  const [staticAmount, setStaticAmount] = useState("3.50");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settled, setSettled] = useState<Intent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundTxHash, setRefundTxHash] = useState<Hex | null>(null);
  const [pending, setPending] = useState<PendingPayment | null>(null);
  const pendingRef = useRef<PendingPayment | null>(null);
  const submittingRef = useRef(false);
  const quoteController = useRef<AbortController | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [pollError, setPollError] = useState<string | null>(null);
  const [session, setSession] = useState<PactSmartAccountSession | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [faucetTxHash, setFaucetTxHash] = useState<Hex | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualAmount, setManualAmount] = useState("3.50");
  const [manualChain, setManualChain] = useState<SupportedTargetChainId>(421614);
  const connected = Boolean(session && session.expiresAt > now);

  const updatePending = useCallback((next: PendingPayment | null) => {
    pendingRef.current = next;
    setPending(next);
    if (next) {
      if (!writeStored(PENDING_STORAGE_KEY, JSON.stringify(next))) setError("Could not save payment recovery details. Keep this page open until your payment is resolved.");
    } else removeStored(PENDING_STORAGE_KEY);
  }, []);

  const refreshBalance = useCallback(async (address: Address) => {
    try { setBalance((await getSmartAccountUsdcBalance(address)).formatted); }
    catch { setBalance(null); }
  }, []);

  useEffect(() => {
    const saved = loadSavedSmartAccountSession();
    if (saved) { setSession(saved); void refreshBalance(saved.smartAccountAddress); }
    const raw = readStored(PENDING_STORAGE_KEY);
    if (raw) {
      try {
        const payment = JSON.parse(raw) as PendingPayment;
        if (typeof payment.orderId !== "string" || !/^0x[0-9a-f]{64}$/i.test(payment.hashLock) || !isPaymentAddress(payment.sender) || !Number.isFinite(payment.startedAt) || !Number.isFinite(payment.deadline)) throw new Error("Invalid saved payment");
        pendingRef.current = payment;
        setPending(payment);
        setIsScanning(false);
      } catch { setError("Saved payment details could not be read. Check your account's transaction history before paying again."); }
    }
    return () => quoteController.current?.abort();
  }, [refreshBalance]);

  useEffect(() => { const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(timer); }, []);

  const connect = async (mode: "register" | "login") => {
    if (submittingRef.current || isConnecting) return;
    if (pendingRef.current && mode === "register") { setError("Sign in to the account that submitted this pending payment; do not create a new one."); return; }
    setIsConnecting(true); setError(null);
    try {
      const next = await onboardPasskeySmartAccount({ mode, preferHardwareModal: true, expectedAddress: pendingRef.current?.sender || (mode === "login" ? session?.smartAccountAddress : undefined) });
      setSession(next); await refreshBalance(next.smartAccountAddress);
    } catch (err) { setError((err as Error).message || "Passkey connection failed."); }
    finally { setIsConnecting(false); }
  };

  const fetchQuote = useCallback(async (request: PactPaymentRequest) => {
    quoteController.current?.abort();
    const controller = new AbortController();
    quoteController.current = controller;
    setQuote(null); setIsLoadingQuote(true); setError(null);
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/quote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: request.amount, targetChainId: request.targetChainId, merchant: request.merchant, orderId: request.orderId }), signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Quote failed (${response.status}).`);
      if (!data.routes?.lightning || !data.routes?.economy || !/^0x[0-9a-f]{64}$/i.test(data.hashLock) || !Number.isSafeInteger(data.deadline)) throw new Error("The relayer returned an invalid quote. Please retry.");
      if (data.sourceChainId !== PACT_CONFIG.fuji.chainId || data.pactEscrowAddress?.toLowerCase() !== PACT_CONFIG.fuji.pactEscrow.toLowerCase() || data.tokenIn?.toLowerCase() !== PACT_CONFIG.fuji.mockUsdc.toLowerCase()) throw new Error("The app and relayer use different source contracts. Update the deployment configuration before paying.");
      if (String(data.amountAtomic) !== parseUnits(request.amount, 6).toString() || data.targetChainId !== request.targetChainId || data.merchant?.toLowerCase() !== request.merchant.toLowerCase() || data.orderId !== request.orderId) throw new Error("The quote does not match the requested payment. Please retry.");
      const expectedTokenOut = request.targetChainId === 421614 ? PACT_CONFIG.arbitrumSepolia.mockUsdc : request.targetChainId === 84532 ? PACT_CONFIG.baseSepolia.mockUsdc : PACT_CONFIG.fuji.mockUsdc;
      if (data.tokenOut?.toLowerCase() !== expectedTokenOut.toLowerCase()) throw new Error("The app and relayer use different destination tokens. Update the deployment configuration before paying.");
      if (data.deadline > Date.now() / 1000 + 1020) throw new Error("The quoted escrow deadline is longer than the supported payment window.");
      if (quoteController.current === controller && !controller.signal.aborted) setQuote(data as QuoteData);
    } catch (err) {
      if (quoteController.current === controller) setError(controller.signal.aborted ? "The quote request timed out. Check your connection and retry." : (err as Error).message || "Unable to reach the relayer.");
    } finally {
      clearTimeout(timeout);
      if (quoteController.current === controller) setIsLoadingQuote(false);
    }
  }, []);

  const scan = async (request: PactPaymentRequest): Promise<boolean> => {
    if (pendingRef.current || submittingRef.current || staticRequest || scannedRequest) return false;
    if (Number(request.amount) > 0 && request.timestamp && Date.now() / 1000 - request.timestamp > QR_MAX_AGE_SECONDS) { setError("This invoice has expired. Ask the merchant for a fresh QR."); return false; }
    setIsScanning(false); setShowManual(false); setError(null);
    if (Number(request.amount) === 0) { setStaticRequest(request); setStaticAmount("3.50"); return true; }
    setScannedRequest(request);
    const validation = paymentAmountError(request.amount);
    if (validation) setError(validation); else await fetchQuote(request);
    return true;
  };

  const reset = () => {
    if (pendingRef.current || submittingRef.current) { setError("A payment is still pending. Wait for settlement or use the refund option before starting another."); return; }
    quoteController.current?.abort(); quoteController.current = null;
    setScannedRequest(null); setStaticRequest(null); setQuote(null); setSettled(null); setError(null); setPollError(null); setRefundTxHash(null); setIsLoadingQuote(false); setIsScanning(true); setShowManual(false);
  };

  const submitPayment = async (priority: number, selectedQuote: QuoteData) => {
    if (submittingRef.current || pendingRef.current) return;
    const savedPending = readStored(PENDING_STORAGE_KEY);
    if (savedPending) { setError("Another payment is pending in this browser. Refresh to restore its status before paying again."); return; }
    if (!session || session.expiresAt <= Date.now() / 1000) { setError("Your signing session expired. Sign in again before paying."); return; }
    if (!scannedRequest || selectedQuote !== quote || selectedQuote.orderId !== scannedRequest.orderId || selectedQuote.targetChainId !== scannedRequest.targetChainId || selectedQuote.merchant.toLowerCase() !== scannedRequest.merchant.toLowerCase() || Number(selectedQuote.amount) !== Number(scannedRequest.amount)) { setError("Payment details changed. Get a fresh quote before paying."); return; }
    const invalid = paymentAmountError(selectedQuote.amount);
    if (invalid || selectedQuote.deadline <= Date.now() / 1000 + 30) { setError(invalid || "This quote expired. Please refresh it."); return; }
    const route = priority === 0 ? selectedQuote.routes.lightning : selectedQuote.routes.economy;
    if (route.available === false || (priority === 0 && selectedQuote.lightningAvailable === false)) { setError("This payment route is unavailable. Choose another route."); return; }
    const lockKey = `pact_pending_order_${selectedQuote.orderId}`;
    const existingLock = readStored(lockKey);
    if (existingLock) { setError("This order already has a pending or completed payment. Check its status before paying again."); return; }
    if (!writeStored(lockKey, JSON.stringify({ timestamp: Date.now() }))) { setError("Allow site storage before paying so your payment can be recovered after a refresh."); return; }
    submittingRef.current = true; setIsSubmitting(true); setError(null);
    let broadcast = false;
    try {
      const total = BigInt(route.totalPayableAtomic || "0");
      if (total <= 0n) throw new Error("The quote is incomplete. Request a fresh quote.");
      const currentBalance = await getSmartAccountUsdcBalance(session.smartAccountAddress);
      if (currentBalance.atomic < total) throw new Error("Insufficient USDC. Cancel this review and use the testnet faucet to add funds, then retry.");
      const tracker: PendingPayment = { orderId: scannedRequest.orderId, hashLock: selectedQuote.hashLock, sender: session.smartAccountAddress, deadline: selectedQuote.deadline, startedAt: Date.now(), intentId: null, amountUsd: selectedQuote.amount, targetChainId: selectedQuote.targetChainId, userOpHash: null, sourceTxHash: null };
      if (!writeStored(PENDING_STORAGE_KEY, JSON.stringify(tracker))) throw new Error("Payment recovery details could not be saved. Allow site storage and retry.");
      const targetChain = selectedQuote.targetChainId;
      const tokenOut = targetChain === 421614 ? PACT_CONFIG.arbitrumSepolia.mockUsdc : targetChain === 84532 ? PACT_CONFIG.baseSepolia.mockUsdc : PACT_CONFIG.fuji.mockUsdc;
      const result = await executeGaslessPaymentIntent({
        session, amountAtomic: BigInt(selectedQuote.amountAtomic), totalPayableAtomic: total, targetChainId: targetChain, receiver: scannedRequest.merchant, tokenOut, priority, hashLock: selectedQuote.hashLock, deadline: selectedQuote.deadline,
        onSubmissionStarted: () => { broadcast = true; updatePending(tracker); setScannedRequest(null); },
        onSubmitted: (hash) => { if (pendingRef.current?.hashLock === tracker.hashLock) updatePending({ ...pendingRef.current, userOpHash: hash }); },
      });
      updatePending({ ...tracker, userOpHash: result.userOpHash, sourceTxHash: result.txHash, intentId: result.intentId });
      setScannedRequest(null); await refreshBalance(session.smartAccountAddress);
    } catch (err) {
      if ((err as Error).name === "PaymentRevertedError") broadcast = false;
      if (!broadcast) { removeStored(lockKey); updatePending(null); }
      else setScannedRequest(null);
      setError(`${(err as Error).message || "Payment submission failed."}${broadcast ? " Payment tracking is still active; do not submit another payment." : ""}`);
    } finally { submittingRef.current = false; setIsSubmitting(false); }
  };

  const confirmPayment = async (priority: number, selectedQuote: QuoteData) => {
    if (navigator.locks) {
      await navigator.locks.request("pact-payment-submission", { ifAvailable: true }, async (lock) => {
        if (!lock) { setError("Another tab is submitting a payment. Wait for its result."); return; }
        await submitPayment(priority, selectedQuote);
      });
    } else await submitPayment(priority, selectedQuote);
  };

  useEffect(() => {
    if (!pending) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/orders/${encodeURIComponent(pending.orderId)}?hashLock=${pending.hashLock}`, { signal: controller.signal });
        if (disposed) return;
        if (response.status === 404) { setPollError("Waiting for the relayer to index your payment. Do not pay again."); return; }
        if (!response.ok) throw new Error("Status unavailable");
        const data = await response.json();
        if (disposed) return;
        const intent = data.intent as Intent | null;
        if (!intent || intent.hash_lock.toLowerCase() !== pending.hashLock.toLowerCase() || intent.sender.toLowerCase() !== pending.sender.toLowerCase()) throw new Error("Payment details do not match");
        setPollError(null);
        if (intent.state === "SETTLED" || intent.state === "CLAIMED") {
          removeStored(`pact_pending_order_${pending.orderId}`);
          setSettled(intent); updatePending(null); setScannedRequest(null); setIsScanning(false);
          playTingTingSound(); triggerHapticFeedback(); void refreshBalance(pending.sender);
        } else if (intent.state === "REFUNDED") {
          removeStored(`pact_pending_order_${pending.orderId}`);
          updatePending(null); setIsScanning(true); setError("Your payment was refunded on-chain."); void refreshBalance(pending.sender);
        } else if (pending.intentId !== intent.intent_id || pending.state !== intent.state || pending.sourceTxHash !== intent.source_tx_hash) {
          updatePending({ ...pending, intentId: intent.intent_id, sourceTxHash: intent.source_tx_hash, state: intent.state });
        }
      } catch { if (!disposed) setPollError("Cannot reach the relayer. Your payment may still be processing. Tracking will retry automatically."); }
      finally { clearTimeout(timeout); if (!disposed && pendingRef.current) timer = setTimeout(poll, 1500); }
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); };
  }, [pending, updatePending, refreshBalance]);

  const refund = async () => {
    if (!session || !pending || isRefunding || !pending.intentId || pending.deadline >= now) return;
    setIsRefunding(true); setError(null);
    try {
      const result = await executeGaslessRefund({ session, intentId: pending.intentId });
      setRefundTxHash(result.txHash); removeStored(`pact_pending_order_${pending.orderId}`); updatePending(null); await refreshBalance(session.smartAccountAddress);
    } catch (err) { setError((err as Error).message || "Refund failed. Please retry."); }
    finally { setIsRefunding(false); }
  };

  return (
    <div className="relative w-full h-[calc(100dvh-5rem)] min-h-[540px] bg-surface-base flex flex-col overflow-hidden">
      <header className="absolute top-0 inset-x-0 z-20 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/70 to-transparent">
        <div className="flex justify-between items-center mb-2"><div><h1 className="text-sm font-bold text-white">Pact Pay</h1><p className="text-[11px] text-white/70">Testnet only · MockUSDC has no real value</p></div><button type="button" onClick={reset} disabled={Boolean(pending) || isSubmitting} aria-label="Reset scanner" className="p-3 border border-surface-border rounded-full disabled:opacity-40"><RefreshCw className="w-4 h-4" /></button></div>
        <div className="rounded-2xl bg-surface-card/95 border border-surface-border p-3 space-y-2">
          {!session ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold flex gap-1 items-center"><Fingerprint className="w-4 h-4 text-primary" />Passkey account</span><div className="flex gap-2"><button disabled={isConnecting} type="button" onClick={() => void connect("register")} className="px-3 py-2 bg-primary rounded-xl text-xs font-bold disabled:opacity-50">Create account</button><button disabled={isConnecting} type="button" onClick={() => void connect("login")} className="px-3 py-2 border border-surface-border rounded-xl text-xs disabled:opacity-50">Sign in</button></div></div> : <>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-sm">{balance === null ? "Balance unavailable" : `${balance} USDC`}</p><p className="text-[10px] text-text-muted break-all">{session.smartAccountAddress}</p><p className="text-[10px] text-text-muted mt-1">50 USDC per payment · {connected ? "24-hour signing session" : "Session expired — sign in to renew"}</p></div><button type="button" disabled={Boolean(pending) || isSubmitting || isMinting || isConnecting} onClick={() => { clearSmartAccountSession(); setSession(null); setBalance(null); setFaucetTxHash(null); }} aria-label="Disconnect account" className="p-2 rounded-lg disabled:opacity-40"><LogOut className="w-4 h-4" /></button></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={isMinting || !connected || isSubmitting || Boolean(pending)} onClick={async () => { if (!session) return; setIsMinting(true); setError(null); try { const result = await claimGaslessFaucet(session); setFaucetTxHash(result.txHash); await refreshBalance(session.smartAccountAddress); } catch (err) { setError((err as Error).message); } finally { setIsMinting(false); } }} className="flex items-center gap-1 text-xs px-3 py-2 border border-success/40 text-success rounded-xl disabled:opacity-50">{isMinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}+500 test USDC</button><button type="button" onClick={() => void refreshBalance(session.smartAccountAddress)} aria-label="Refresh balance" className="px-3 py-2 rounded-xl border border-surface-border"><RefreshCw className="w-3.5 h-3.5" /></button>{!connected && <button type="button" disabled={isConnecting} onClick={() => void connect("login")} className="text-xs px-3 py-2 bg-primary rounded-xl">Renew session</button>}</div>
            {faucetTxHash && <a href={getExplorerTxUrl(43113, faucetTxHash)} target="_blank" rel="noreferrer" className="text-xs text-success underline block">Faucet receipt</a>}
          </>}
          {isConnecting && <p role="status" className="text-xs text-text-muted">Follow your browser&apos;s passkey prompt…</p>}
          {error && !scannedRequest && !showManual && !staticRequest && <p role="alert" className="text-xs text-red-300 bg-red-500/10 rounded-lg p-2 break-words">{error}</p>}
        </div>
      </header>
      <div className="flex-1 relative min-h-0">
        <QrScanner active={active && isScanning && !showManual && !staticRequest && !scannedRequest && !pending && !settled && !refundTxHash} onScanSuccess={scan} onError={setError} />
        {isScanning && !pending && !settled && !refundTxHash && <div className="absolute bottom-6 inset-x-4 z-20 flex justify-center"><button type="button" onClick={() => { setShowManual(true); setError(null); }} className="py-3 px-4 rounded-2xl bg-surface-card border border-surface-border text-sm font-bold flex items-center gap-2"><Keyboard className="w-4 h-4 text-primary" />Enter recipient address</button></div>}
        {pending && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-5 pt-56 pb-6 bg-surface-base overflow-y-auto text-center gap-3" role="status">
          <Clock className="w-10 h-10 text-primary shrink-0" /><h2 className="text-xl font-bold">{pending.state === "EXPIRED" ? "Escrow expired — refund pending" : `Processing ${pending.amountUsd} USDC`}</h2><p className="text-xs text-text-muted max-w-sm">{pending.state === "EXPIRED" ? "The merchant was not confirmed as paid. Your funds are still in escrow; expiry is not itself a refund. Submit the refund transaction below." : pending.state === "DISPATCHED" ? `Payment submitted to ${getChainName(pending.targetChainId)}. Waiting for confirmation; do not submit another payment.` : pending.state === "SETTLED" ? "The merchant has received the payment. Waiting for the escrow claim to finish." : `Waiting for settlement on ${getChainName(pending.targetChainId)}. Do not pay again. You can switch tabs or refresh; tracking is saved.`}</p>
          {pollError && <p className="text-xs text-amber-300 max-w-sm">{pollError}</p>}
          <p className="text-sm font-mono">{pending.deadline >= now ? `Refund opens in ${Math.floor((pending.deadline - now) / 60)}:${String((pending.deadline - now) % 60).padStart(2, "0")}` : "Unclaimed funds can now be refunded"}</p>
          {pending.sourceTxHash && <a className="text-xs text-primary underline" href={getExplorerTxUrl(43113, pending.sourceTxHash)} target="_blank" rel="noreferrer">View escrow transaction</a>}
          {!connected && <button type="button" disabled={isConnecting} onClick={() => void connect("login")} className="px-4 py-2 rounded-xl border border-surface-border text-sm">Sign in to recover payment</button>}
          <button type="button" onClick={() => void refund()} disabled={isRefunding || !connected || pending.deadline >= now || !pending.intentId} className="py-3 px-6 bg-primary rounded-xl font-bold text-sm disabled:opacity-40">{isRefunding ? "Refunding…" : "Refund unclaimed funds"}</button>
        </div>}
        {(settled || refundTxHash) && <div className="absolute inset-0 z-30 bg-surface-base flex flex-col items-center justify-center p-5 pt-56 pb-6 overflow-y-auto text-center gap-3">
          <CheckCircle2 className="w-14 h-14 text-success shrink-0" /><h2 className="text-xl font-bold">{refundTxHash ? "Refund complete" : "Payment received by merchant"}</h2>
          {settled && <><p className="text-3xl font-bold">{(Number(settled.amount_in) / 1e6).toFixed(6).replace(/\.?0+$/, "")} USDC</p><p className="text-sm text-text-muted">Settled on {getChainName(settled.target_chain_id)}</p><p className="text-xs font-mono break-all max-w-sm">{settled.receiver}</p></>}
          <div className="flex flex-col gap-2 text-xs text-primary underline">
            {(settled?.source_tx_hash || refundTxHash) && <a href={getExplorerTxUrl(43113, refundTxHash || settled!.source_tx_hash!)} target="_blank" rel="noreferrer">{refundTxHash ? "Refund receipt" : "Source escrow receipt"}</a>}
            {settled?.dest_tx_hash && <a href={getExplorerTxUrl(settled.target_chain_id, settled.dest_tx_hash)} target="_blank" rel="noreferrer">Merchant settlement receipt</a>}
            {settled?.claim_tx_hash ? <a href={getExplorerTxUrl(43113, settled.claim_tx_hash)} target="_blank" rel="noreferrer">Solver claim receipt</a> : settled && <span className="text-text-muted no-underline">Solver escrow claim not yet confirmed</span>}
          </div><button type="button" onClick={reset} className="py-3 px-6 bg-primary rounded-xl text-sm font-bold">Scan next payment</button>
        </div>}
      </div>
      {showManual && <Dialog labelledBy="manual-title" onClose={() => setShowManual(false)}><form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); if (!isPaymentAddress(manualAddress.trim())) { setError("Enter a valid, nonzero EVM wallet address."); return; } const invalid = paymentAmountError(manualAmount); if (invalid) { setError(invalid); return; } await scan({ protocol: "pact", version: "1.0", orderId: createOrderId("MANUAL"), merchant: manualAddress.trim() as Address, amount: manualAmount, targetChainId: manualChain, targetToken: "USDC", editable: true }); }}>
        <div className="flex items-center justify-between"><h2 id="manual-title" className="font-bold">Pay a wallet address</h2><button type="button" aria-label="Close manual entry" onClick={() => setShowManual(false)} className="p-2"><X className="w-5 h-5" /></button></div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <label htmlFor="manual-address" className="block text-xs text-text-muted">Recipient wallet address</label><input id="manual-address" required value={manualAddress} onChange={(event) => setManualAddress(event.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="0x…" className="w-full p-3 rounded-xl bg-surface-base border border-surface-border text-xs font-mono" />
        <label htmlFor="manual-amount" className="block text-xs text-text-muted">Amount (1–50 USDC)</label><input id="manual-amount" required type="text" inputMode="decimal" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} className="w-full p-3 rounded-xl bg-surface-base border border-surface-border" />
        <label htmlFor="manual-chain" className="block text-xs text-text-muted">Destination testnet</label><select id="manual-chain" value={manualChain} onChange={(event) => setManualChain(Number(event.target.value) as SupportedTargetChainId)} className="w-full p-3 rounded-xl bg-surface-base border border-surface-border">{[421614, 84532, 43113].map((id) => <option key={id} value={id}>{getChainName(id)}</option>)}</select>
        <button type="submit" className="w-full py-3 rounded-xl bg-primary font-bold flex items-center justify-center gap-2 text-sm">Review payment<ArrowRight className="w-4 h-4" /></button>
      </form></Dialog>}
      {staticRequest && <Dialog labelledBy="static-title" onClose={() => { setStaticRequest(null); setIsScanning(true); }}><form className="space-y-4" onSubmit={async (event) => { event.preventDefault(); const invalid = paymentAmountError(staticAmount); if (invalid) { setError(invalid); return; } const request = { ...staticRequest, orderId: createOrderId(staticRequest.orderId), amount: staticAmount, editable: true }; setStaticRequest(null); setScannedRequest(request); await fetchQuote(request); }}>
        <div className="flex justify-between items-center"><h2 id="static-title" className="font-bold">Enter payment amount</h2><button type="button" aria-label="Close amount entry" onClick={() => { setStaticRequest(null); setIsScanning(true); }} className="p-2"><X className="w-5 h-5" /></button></div><p className="text-xs font-mono break-all">{staticRequest.merchant}</p><p className="text-xs text-text-muted">{getChainName(staticRequest.targetChainId)}</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <label htmlFor="static-amount" className="block text-xs text-text-muted">Amount (1–50 USDC)</label><input id="static-amount" required type="text" inputMode="decimal" value={staticAmount} onChange={(event) => setStaticAmount(event.target.value)} className="w-full p-3 rounded-xl bg-surface-base border border-surface-border text-xl" /><button type="submit" className="w-full py-3 rounded-xl bg-primary font-bold text-sm">Get quote</button>
      </form></Dialog>}
      {scannedRequest && <RouteSelectorModal key={scannedRequest.orderId} paymentReq={scannedRequest} quote={quote} isLoadingQuote={isLoadingQuote} isSubmitting={isSubmitting} error={error} accountConnected={connected} isConnecting={isConnecting} onConnect={connect} onConfirmPayment={confirmPayment} onCancel={reset} onRefreshQuote={async (amount, chainId) => { if (submittingRef.current) return; const request = { ...scannedRequest, amount, targetChainId: chainId }; setScannedRequest(request); await fetchQuote(request); }} />}
    </div>
  );
}
