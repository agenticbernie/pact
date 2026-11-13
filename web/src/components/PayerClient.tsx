"use client";

import { useState, useEffect, useCallback } from "react";
import { QrScanner } from "@/components/QrScanner";
import { RouteSelectorModal, type QuoteData } from "@/components/RouteSelectorModal";
import { type PactPaymentRequest, type SupportedTargetChainId } from "@/lib/pact-schema";
import { PACT_CONFIG, getChainName, getExplorerTxUrl } from "@/lib/config";
import { playTingTingSound, triggerHapticFeedback } from "@/lib/feedback";
import {
  onboardPasskeySmartAccount,
  loadSavedSmartAccountSession,
  clearSmartAccountSession,
  getSmartAccountUsdcBalance,
  claimGaslessFaucet,
  executeGaslessPaymentIntent,
  executeGaslessRefund,
  type PactSmartAccountSession,
} from "@/lib/zerodev";
import {
  CheckCircle2,
  RefreshCw,
  Fingerprint,
  Coins,
  ShieldCheck,
  KeyRound,
  LogOut,
  ExternalLink,
  Loader2,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Keyboard,
  ArrowRight,
  X,
} from "lucide-react";
import type { Address, Hex } from "viem";

const QR_MAX_AGE_SECONDS = 360; // merchant QR TTL (300s) + clock-skew allowance
const PENDING_UI_TIMEOUT_MS = 45_000; // Economy batch window upper bound (§1.3)

export function PayerClient() {
  const [isScanning, setIsScanning] = useState(true);
  const [scannedRequest, setScannedRequest] = useState<PactPaymentRequest | null>(null);
  const [staticPromptReq, setStaticPromptReq] = useState<PactPaymentRequest | null>(null);
  const [staticInputAmount, setStaticInputAmount] = useState<string>("3.50");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settledPayment, setSettledPayment] = useState<any | null>(null);
  const [settlementLatencyMs, setSettlementLatencyMs] = useState<number | null>(null);
  const [lastUserOpHash, setLastUserOpHash] = useState<Hex | null>(null);
  const [lastSourceTxHash, setLastSourceTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [refundTxHash, setRefundTxHash] = useState<Hex | null>(null);

  // Manual payment entry modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [manualAmount, setManualAmount] = useState("1.00");
  const [manualChainId, setManualChainId] = useState<SupportedTargetChainId>(421614);
  // In-flight payment tracking (FR-10 / §1.4: guaranteed refund if the merchant is not paid by the deadline)
  const [pendingOrder, setPendingOrder] = useState<{
    orderId: string;
    deadline: number;
    startedAt: number;
    intentId: Hex | null;
    amountUsd: string;
  } | null>(null);
  const [isStalled, setIsStalled] = useState(false);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // ZeroDev Kernel v3 Smart Account & Scoped Session Key State (FR-01, FR-02, FR-03, §1.4)
  const [session, setSession] = useState<PactSmartAccountSession | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [isMintingFaucet, setIsMintingFaucet] = useState(false);
  const [faucetTxHash, setFaucetTxHash] = useState<Hex | null>(null);

  const refreshBalance = useCallback(async (addr: Address) => {
    try {
      const bal = await getSmartAccountUsdcBalance(addr);
      setUsdcBalance(bal.formatted);
    } catch (err) {
      console.error("[ZeroDev] Failed to fetch USDC balance:", err);
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedSmartAccountSession();
    if (saved) {
      setSession(saved);
      refreshBalance(saved.smartAccountAddress);
    }
  }, [refreshBalance]);

  // FR-01 & FR-02: Passkey Onboarding + Scoped Session Key ($50/24h)
  const handlePasskeyOnboard = async (mode: "register" | "login" = "register") => {
    setIsOnboarding(true);
    setErrorMessage(null);
    try {
      const newSession = await onboardPasskeySmartAccount({
        mode,
        preferHardwareModal: true,
      });
      setSession(newSession);
      await refreshBalance(newSession.smartAccountAddress);
    } catch (err: any) {
      console.error("[ZeroDev] Onboarding failed:", err);
      setErrorMessage(err.message || "Passkey onboarding failed");
    } finally {
      setIsOnboarding(false);
    }
  };

  // §1.4: 1-Click Testnet Faucet (+500 MockUSDC via gasless UserOperation)
  const handleClaimFaucet = async () => {
    if (!session) return;
    setIsMintingFaucet(true);
    setErrorMessage(null);
    setFaucetTxHash(null);
    try {
      const { txHash } = await claimGaslessFaucet(session);
      setFaucetTxHash(txHash);
      await refreshBalance(session.smartAccountAddress);
      playTingTingSound();
      triggerHapticFeedback();
    } catch (err: any) {
      console.error("[ZeroDev] Gasless Faucet failed:", err);
      setErrorMessage(err.message || "Gasless faucet claim failed");
    } finally {
      setIsMintingFaucet(false);
    }
  };

  const handleDisconnectSession = () => {
    clearSmartAccountSession();
    setSession(null);
    setUsdcBalance("0.00");
    setFaucetTxHash(null);
  };

  // Fetch quote from Relayer
  const fetchQuote = useCallback(
    async (
      amount: string,
      targetChainId: SupportedTargetChainId,
      merchant: string,
      orderId: string
    ) => {
      setIsLoadingQuote(true);
      setErrorMessage(null);
      const startTime = performance.now();
      try {
        const res = await fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount,
            targetChainId,
            merchant,
            orderId,
          }),
        });

        if (!res.ok) {
          throw new Error(`Quote failed with status ${res.status}`);
        }

        const quoteData = (await res.json()) as QuoteData;
        setQuote(quoteData);

        const elapsed = performance.now() - startTime;
        console.log(`[Payer] Quote received in ${elapsed.toFixed(1)}ms (<300ms target)`);
        return quoteData;
      } catch (err: any) {
        console.error("Failed to fetch quote", err);
        setErrorMessage("Could not connect to Pact Relayer. Check connection.");
        return null;
      } finally {
        setIsLoadingQuote(false);
      }
    },
    []
  );

  // Re-fetch quote when user modifies amount or destination chain in RouteSelectorModal
  const handleRefreshQuote = useCallback(
    async (newAmount: string, newTargetChainId: SupportedTargetChainId) => {
      if (!scannedRequest) return;
      setScannedRequest((prev) =>
        prev
          ? {
              ...prev,
              amount: newAmount,
              targetChainId: newTargetChainId,
            }
          : null
      );
      await fetchQuote(
        newAmount,
        newTargetChainId,
        scannedRequest.merchant,
        scannedRequest.orderId
      );
    },
    [scannedRequest, fetchQuote]
  );

  // Handle successful QR detection
  const handleScanSuccess = async (data: PactPaymentRequest) => {
    // Only enforce expiry on dynamic QRs with fixed amounts
    const isStaticQr = !data.amount || data.amount === "0" || Number(data.amount) === 0;

    // §4.3 Screen 2: merchant QR codes auto-refresh; reject stale ones so a payer never pays an expired invoice
    if (!isStaticQr && data.timestamp && Math.floor(Date.now() / 1000) - data.timestamp > QR_MAX_AGE_SECONDS) {
      setErrorMessage("This code has expired. Ask the merchant for a fresh one.");
      return;
    }
    setIsScanning(false);
    setShowManualModal(false);

    // If Static Standee QR (!amount || amount === "0"): show numeric amount input before quote/slide-to-pay
    if (isStaticQr) {
      setStaticPromptReq(data);
      setStaticInputAmount("3.50");
      return;
    }

    setScannedRequest(data);
    await fetchQuote(data.amount, data.targetChainId, data.merchant, data.orderId);
  };

  // Handle Manual Form Submission (No camera needed)
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setErrorMessage("Địa chỉ ví không hợp lệ (phải là 0x... 42 ký tự)");
      return;
    }
    const amountVal = Number(manualAmount) > 0 ? manualAmount : "1.00";
    const req: PactPaymentRequest = {
      protocol: "pact",
      version: "1.0",
      orderId: `MANUAL-${Date.now().toString().slice(-6)}`,
      merchant: trimmed as `0x${string}`,
      targetChainId: manualChainId,
      targetToken: "USDC",
      amount: amountVal,
      timestamp: Date.now(),
    };
    await handleScanSuccess(req);
  };

  // FR-02, FR-03, FR-06: Confirm payment execution via ZeroDev Kernel v3 Scoped Session Key
  const handleConfirmPayment = async (priority: number, quoteData: QuoteData) => {
    if (!scannedRequest) return;
    const orderId = quoteData.orderId || scannedRequest.orderId;
    const lockKey = `pact_pending_order_${orderId}`;

    // Lock slide-to-pay per orderId using localStorage to prevent duplicate createIntent UserOps
    if (orderId && typeof window !== "undefined") {
      const activeLock = localStorage.getItem(lockKey);
      if (activeLock) {
        try {
          const parsed = JSON.parse(activeLock);
          if (Date.now() - (parsed.timestamp || 0) < 300_000) {
            console.warn(`[Payer] Order ${orderId} already locked against duplicate submission.`);
            setErrorMessage(`Lệnh thanh toán ${orderId} đang được xử lý, vui lòng chờ trong giây lát.`);
            return;
          }
        } catch {
          // ignore corrupted lock
        }
      }
      localStorage.setItem(lockKey, JSON.stringify({ orderId, timestamp: Date.now() }));
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Ensure user has an active Passkey Smart Account session
      let activeSession = session;
      if (!activeSession) {
        activeSession = await onboardPasskeySmartAccount({
          mode: "register",
          preferHardwareModal: true,
        });
        setSession(activeSession);
      }

      const selectedRoute =
        priority === 0 ? quoteData.routes.lightning : quoteData.routes.economy;
      const amountAtomic = BigInt(quoteData.amountAtomic);
      const totalPayableAtomic = BigInt(
        selectedRoute.totalPayableAtomic ||
          Math.round(Number(selectedRoute.totalPayable) * 1e6)
      );

      const targetChainId = (quoteData.targetChainId || scannedRequest.targetChainId) as SupportedTargetChainId;
      const tokenOut =
        targetChainId === 421614
          ? PACT_CONFIG.arbitrumSepolia.mockUsdc
          : targetChainId === 84532
            ? PACT_CONFIG.baseSepolia.mockUsdc
            : PACT_CONFIG.fuji.mockUsdc;

      // Auto-mint faucet if Smart Account balance is insufficient for demo convenience
      const currentBal = await getSmartAccountUsdcBalance(activeSession.smartAccountAddress);
      if (currentBal.atomic < totalPayableAtomic) {
        await claimGaslessFaucet(activeSession);
      }

      const receiver = (quoteData.merchant || scannedRequest.merchant) as Address;

      // Execute gasless 1-Tap UserOperation signed by the Scoped Session Key ($50/24h limit)
      const { userOpHash, txHash } = await executeGaslessPaymentIntent({
        session: activeSession,
        amountAtomic,
        totalPayableAtomic,
        targetChainId,
        receiver,
        tokenOut,
        priority,
        hashLock: quoteData.hashLock,
        deadline: quoteData.deadline,
      });

      setLastUserOpHash(userOpHash);
      setLastSourceTxHash(txHash);
      await refreshBalance(activeSession.smartAccountAddress);

      // Track the payment until the destination chain settles (or the refund window opens)
      setIsStalled(false);
      setPendingOrder({
        orderId: scannedRequest.orderId,
        deadline: quoteData.deadline,
        startedAt: Date.now(),
        intentId: null,
        amountUsd: Number(quoteData.amount).toFixed(2),
      });
    } catch (err: any) {
      console.error("[ZeroDev] Payment execution error:", err);
      if (typeof window !== "undefined" && orderId) {
        localStorage.removeItem(lockKey);
      }
      setErrorMessage(err.message || "Gasless payment UserOperation failed");
      setIsSubmitting(false);
    }
  };

  // Poll the relayer for the in-flight payment: settlement, intent id (for refunds) or on-chain refund
  useEffect(() => {
    if (!pendingOrder) return;
    let cancelled = false;
    const tick = setInterval(async () => {
      setNowSec(Math.floor(Date.now() / 1000));
      try {
        const res = await fetch(
          `${PACT_CONFIG.relayerApiUrl}/api/v1/orders/${encodeURIComponent(pendingOrder.orderId)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const intent = data.intent;
        if (intent && !pendingOrder.intentId) {
          setPendingOrder((p) => (p ? { ...p, intentId: intent.intent_id } : p));
        }
        if (data.isSettled) {
          if (typeof window !== "undefined" && pendingOrder.orderId) {
            localStorage.removeItem(`pact_pending_order_${pendingOrder.orderId}`);
          }
          setSettlementLatencyMs(Date.now() - pendingOrder.startedAt);
          setSettledPayment(intent);
          setPendingOrder(null);
          setIsStalled(false);
          setIsSubmitting(false);
          setScannedRequest(null);
          playTingTingSound();
          triggerHapticFeedback();
        } else if (data.status === "REFUNDED") {
          if (typeof window !== "undefined" && pendingOrder.orderId) {
            localStorage.removeItem(`pact_pending_order_${pendingOrder.orderId}`);
          }
          setPendingOrder(null);
          setIsStalled(false);
          setIsSubmitting(false);
        } else if (Date.now() - pendingOrder.startedAt > PENDING_UI_TIMEOUT_MS) {
          // Still unsettled: close the payment sheet and show the protection / refund card
          setIsSubmitting(false);
          setScannedRequest(null);
          setIsStalled(true);
        }
      } catch {
        // keep polling
      }
    }, 400);
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [pendingOrder]);

  // FR-10: sender-initiated refund once the on-chain deadline has passed
  const handleRefund = async () => {
    if (!session || !pendingOrder?.intentId) return;
    setIsRefunding(true);
    setErrorMessage(null);
    try {
      const { txHash } = await executeGaslessRefund({
        session,
        intentId: pendingOrder.intentId,
      });
      setRefundTxHash(txHash);
      setPendingOrder(null);
      setIsStalled(false);
      await refreshBalance(session.smartAccountAddress);
    } catch (err: any) {
      console.error("[ZeroDev] Refund failed:", err);
      setErrorMessage(err.message || "Refund failed. Please try again in a moment.");
    } finally {
      setIsRefunding(false);
    }
  };

  const handleReset = () => {
    if (typeof window !== "undefined") {
      const id = pendingOrder?.orderId || scannedRequest?.orderId || staticPromptReq?.orderId;
      if (id) {
        localStorage.removeItem(`pact_pending_order_${id}`);
      }
    }
    setScannedRequest(null);
    setStaticPromptReq(null);
    setQuote(null);
    setSettledPayment(null);
    setSettlementLatencyMs(null);
    setErrorMessage(null);
    setRefundTxHash(null);
    setPendingOrder(null);
    setIsStalled(false);
    setIsScanning(true);
  };

  return (
    <div className="relative w-full h-screen bg-surface-base flex flex-col justify-between overflow-hidden">
      {/* Top Floating App Bar + ZeroDev Smart Account Header */}
      <div className="absolute top-0 inset-x-0 z-20 flex flex-col gap-2 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center font-black text-white text-sm shadow-md">
              P
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Pact Pay</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40">
                  ZeroDev Kernel v3
                </span>
              </h1>
              <span className="text-[10px] text-white/70 block">
                Avalanche • Network fees covered
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-full bg-surface-card/60 backdrop-blur-md border border-surface-border text-white hover:bg-surface-card transition-all"
            title="Reset Scanner"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* ZeroDev Passkey Smart Account & 1-Click Faucet Bar */}
        <div className="w-full rounded-2xl bg-surface-card/90 backdrop-blur-md border border-surface-border p-3 shadow-lg">
          {!session ? (
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-text-main flex items-center gap-1.5">
                  <Fingerprint className="w-4 h-4 text-primary" />
                  <span>Passkey Smart Account</span>
                </div>
                <p className="text-[11px] text-text-muted">
                  No seed phrases • $50 / 24h spending limit • No network fees
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePasskeyOnboard("register")}
                disabled={isOnboarding}
                className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all shrink-0"
              >
                {isOnboarding ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>Passkey Sign-In</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-text-main">
                      {session.passkeyUsername}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success font-semibold flex items-center gap-1">
                      <KeyRound className="w-2.5 h-2.5" />
                      Session Key ($50/24h)
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold hidden sm:inline-flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Fees covered
                    </span>
                  </div>
                  <div className="text-sm font-black text-text-main mt-0.5">
                    ${usdcBalance}{" "}
                    <span className="text-[11px] font-medium text-text-muted">USDC</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* §1.4: 1-Click Testnet Faucet Button */}
                  <button
                    type="button"
                    onClick={handleClaimFaucet}
                    disabled={isMintingFaucet}
                    className="px-3 py-1.5 rounded-xl bg-success/20 hover:bg-success/30 border border-success/40 text-success text-xs font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                    title="Gaslessly mint 500 MockUSDC to your Smart Account"
                  >
                    {isMintingFaucet ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Minting...</span>
                      </>
                    ) : (
                      <>
                        <Coins className="w-3.5 h-3.5" />
                        <span>+500 USDC Faucet</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDisconnectSession}
                    className="p-1.5 rounded-xl bg-surface-base hover:bg-surface-border text-text-muted hover:text-text-main transition-colors"
                    title="Disconnect Passkey Session"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {faucetTxHash && (
                <div className="text-[10px] text-success flex items-center justify-between bg-success/10 px-2.5 py-1 rounded-lg">
                  <span>Added +500.00 USDC — fees covered</span>
                  <a
                    href={`https://testnet.snowtrace.io/tx/${faucetTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline flex items-center gap-0.5 font-mono"
                  >
                    View receipt
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="mt-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-2.5 py-1.5">
              {errorMessage}
            </div>
          )}
        </div>
      </div>

      {/* Main Scanner Stream */}
      <div className="flex-1 w-full h-full relative">
        {!settledPayment && (isStalled || refundTxHash) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-surface-base text-center">
            {refundTxHash ? (
              <>
                <div className="w-16 h-16 bg-success/20 text-success rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-black text-text-main">Refund complete</h2>
                <p className="text-xs text-text-muted mt-1 mb-4">
                  Your full payment has been returned to your balance.
                </p>
                <a
                  href={getExplorerTxUrl(43113, refundTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mb-5"
                >
                  <span>View receipt</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={handleReset}
                  className="py-3 px-8 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm"
                >
                  Back to scanner
                </button>
              </>
            ) : pendingOrder ? (
              <>
                <div className="w-16 h-16 bg-primary/15 text-primary rounded-full flex items-center justify-center mb-3">
                  <Clock className="w-9 h-9" />
                </div>
                <h2 className="text-xl font-black text-text-main">
                  Still processing ${pendingOrder.amountUsd}
                </h2>
                <p className="text-xs text-text-muted mt-1 mb-4 max-w-xs">
                  Your money is protected. If the merchant isn&apos;t paid in time you can take a full
                  refund — no fees lost.
                </p>
                <div className="text-sm font-mono text-text-main mb-4">
                  {pendingOrder.deadline > nowSec
                    ? `Refund available in ${Math.floor((pendingOrder.deadline - nowSec) / 60)}:${String(
                        (pendingOrder.deadline - nowSec) % 60
                      ).padStart(2, "0")}`
                    : "Refund available now"}
                </div>
                <button
                  type="button"
                  onClick={handleRefund}
                  disabled={
                    isRefunding || pendingOrder.deadline >= nowSec || !pendingOrder.intentId
                  }
                  className="py-3 px-8 rounded-2xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-white font-bold text-sm flex items-center gap-2"
                >
                  {isRefunding && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Get full refund</span>
                </button>
              </>
            ) : null}
          </div>
        )}

        {settledPayment ? (
          /* Payer Settlement Success View with Live Stepper & Explorer Links */
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 sm:p-6 bg-surface-base text-center animate-in zoom-in-95 duration-300 overflow-y-auto">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-success/20 text-success rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2.5]" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-success">
              Cross-Chain Payment Complete
            </span>
            <h2 className="text-3xl font-black text-text-main my-1">
              ${(Number(settledPayment.amount_atomic || settledPayment.amount_in || 0) / 1e6).toFixed(2)} USDC
            </h2>
            <div className="flex items-center gap-2 mb-3">
              {settlementLatencyMs && (
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-success/15 text-success font-semibold border border-success/30 flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  <span>Settled in {(settlementLatencyMs / 1000).toFixed(1)}s (NFR-01 SLA)</span>
                </span>
              )}
            </div>

            {/* 4-Step Settlement Stepper */}
            <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl p-3.5 mb-4 text-left text-xs space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center justify-between">
                <span>Multi-Chain Execution Trail</span>
                <span className="text-success">100% Cryptographic Proof</span>
              </div>

              {/* Step 1 */}
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-main">Fuji Escrow Locked</span>
                    {lastSourceTxHash && (
                      <a
                        href={getExplorerTxUrl(43113, lastSourceTxHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5 font-mono text-[10px]"
                      >
                        <span>View receipt</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted">Signed with your passkey session • no network fees</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-main">Solver Fronted Liquidity</span>
                    <span className="text-[10px] font-mono text-success">Preimage Verified</span>
                  </div>
                  <p className="text-[10px] text-text-muted">Direct transfer from Relayer hot pool</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  3
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-main">
                      {getChainName(settledPayment.target_chain_id || 421614)} Fill
                    </span>
                    {(settledPayment.dest_tx_hash || settledPayment.fulfill_tx_hash) && (
                      <a
                        href={getExplorerTxUrl(
                          settledPayment.target_chain_id || 421614,
                          settledPayment.dest_tx_hash || settledPayment.fulfill_tx_hash
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-0.5 font-mono text-[10px]"
                      >
                        <span>View receipt</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted">Merchant received exact USDC principal</p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  4
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-main">Fuji Escrow Claim</span>
                    {settledPayment.claim_tx_hash ? (
                      <a
                        href={getExplorerTxUrl(43113, settledPayment.claim_tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-success hover:underline flex items-center gap-0.5 font-mono text-[10px]"
                      >
                        <span>View receipt</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-text-muted">Relayer Claimed</span>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted">HTLC secret revealed on-chain</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="py-3 px-8 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-lg shadow-primary/20"
            >
              Scan Next Merchant
            </button>
          </div>
        ) : (
          <>
            <QrScanner
              active={isScanning}
              onScanSuccess={handleScanSuccess}
              onError={(err) => setErrorMessage(err)}
            />
            {/* Floating Manual 0x Entry Button */}
            {isScanning && !scannedRequest && !settledPayment && (
              <div className="absolute bottom-6 inset-x-4 z-20 flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => setShowManualModal(true)}
                  className="pointer-events-auto py-2.5 px-4 rounded-2xl bg-surface-card/90 backdrop-blur-md border border-surface-border text-text-main hover:text-white text-xs font-bold shadow-xl hover:bg-surface-card flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Keyboard className="w-4 h-4 text-primary" />
                  <span>Nhập địa chỉ ví người nhận thủ công</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Manual Input Dialog Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Keyboard className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-text-main">Chuyển tiền qua địa chỉ ví</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-base"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                  Địa chỉ ví người nhận (0x...)
                </label>
                <input
                  type="text"
                  required
                  placeholder="0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="w-full bg-surface-base text-text-main font-mono text-xs px-3 py-2.5 rounded-xl border border-surface-border focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                  Số lượng USDC
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  className="w-full bg-surface-base text-text-main font-mono text-lg font-bold px-3 py-2 rounded-xl border border-surface-border focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                  Mạng người nhận (Destination Chain)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setManualChainId(421614)}
                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                      manualChainId === 421614
                        ? "bg-blue-600/20 border-blue-500 text-blue-400"
                        : "bg-surface-base border-surface-border text-text-muted"
                    }`}
                  >
                    <span>🔵 Arb</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualChainId(84532)}
                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                      manualChainId === 84532
                        ? "bg-blue-500/20 border-blue-400 text-blue-300"
                        : "bg-surface-base border-surface-border text-text-muted"
                    }`}
                  >
                    <span>🔷 Base</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualChainId(43113)}
                    className={`py-2 px-1 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center justify-center ${
                      manualChainId === 43113
                        ? "bg-red-600/20 border-red-500 text-red-400"
                        : "bg-surface-base border-surface-border text-text-muted"
                    }`}
                  >
                    <span>🔺 Fuji</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 transition-all mt-2"
              >
                <span>Tiếp tục thanh toán</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Static Standee QR Amount Input Dialog (Customer inputs amount upon scan) */}
      {staticPromptReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  Static Standee QR
                </span>
                <h3 className="text-sm font-bold text-text-main">Nhập số tiền thanh toán</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStaticPromptReq(null);
                  setIsScanning(true);
                }}
                className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-base"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-surface-base border border-surface-border text-xs">
                <span className="text-text-muted text-[10px] uppercase font-bold block">Người nhận</span>
                <span className="font-mono text-text-main truncate block">{staticPromptReq.merchant}</span>
                <span className="text-primary text-[10px] font-semibold mt-1 block">
                  Mạng: {getChainName(staticPromptReq.targetChainId)}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                  Số lượng USDC thanh toán
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={staticInputAmount}
                    onChange={(e) => setStaticInputAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface-base text-text-main font-mono text-2xl font-bold px-3 py-2 rounded-xl border border-surface-border focus:outline-none focus:border-primary"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted font-bold text-sm">
                    USDC
                  </span>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="flex items-center gap-1.5">
                {["1.00", "3.50", "5.00", "10.00"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStaticInputAmount(preset)}
                    className={`flex-1 text-[11px] font-mono py-1 rounded-lg border transition-all ${
                      staticInputAmount === preset
                        ? "bg-primary/20 border-primary text-primary font-bold"
                        : "bg-surface-base border-surface-border text-text-muted hover:text-text-main"
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={async () => {
                  const val = Number(staticInputAmount);
                  if (isNaN(val) || val <= 0) {
                    setErrorMessage("Vui lòng nhập số tiền hợp lệ (> 0)");
                    return;
                  }
                  const reqWithAmount: PactPaymentRequest = {
                    ...staticPromptReq,
                    amount: val.toFixed(2),
                  };
                  setStaticPromptReq(null);
                  setScannedRequest(reqWithAmount);
                  await fetchQuote(
                    reqWithAmount.amount,
                    reqWithAmount.targetChainId,
                    reqWithAmount.merchant,
                    reqWithAmount.orderId
                  );
                }}
                className="w-full py-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 transition-all mt-2"
              >
                <span>Nhận báo giá & Thanh toán</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Route Selector Bottom Sheet Modal */}
      {scannedRequest && (
        <RouteSelectorModal
          paymentReq={scannedRequest}
          quote={quote}
          isLoadingQuote={isLoadingQuote}
          isSubmitting={isSubmitting}
          onConfirmPayment={handleConfirmPayment}
          onCancel={handleReset}
          onRefreshQuote={handleRefreshQuote}
        />
      )}
    </div>
  );
}
