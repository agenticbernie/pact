"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  ShieldCheck,
  Zap,
  Clock,
  ExternalLink,
  RefreshCw,
  Server,
  Layers,
  ArrowUpRight,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  PACT_CONFIG,
  getChainName,
  getExplorerTxUrl,
  getExplorerAddressUrl,
} from "@/lib/config";

interface HealthData {
  status: string;
  version: string;
  relayerAddress: string;
  timestamp: number;
  intentStateCounts: {
    CREATED: number;
    DISPATCHED: number;
    SETTLED: number;
    CLAIMED: number;
    EXPIRED: number;
    REFUNDED: number;
  };
  chains: {
    avalancheFuji: {
      chainId: number;
      blockNumber: string;
      nativeBalance: string;
      usdcBalance: string;
      pactEscrow: string;
      mockUsdc: string;
    };
    arbitrumSepolia: {
      chainId: number;
      blockNumber: string;
      nativeBalance: string;
      usdcBalance: string;
      mockUsdc: string;
    };
    baseSepolia: {
      chainId: number;
      blockNumber: string;
      nativeBalance: string;
      usdcBalance: string;
      mockUsdc: string;
    };
  };
}

interface StoredIntent {
  intent_id: string;
  order_id: string | null;
  sender: string;
  token_in: string;
  amount_in: string;
  fee_paid: string;
  target_chain_id: number;
  receiver: string;
  token_out: string;
  priority: number;
  hash_lock: string;
  deadline: number;
  state: "CREATED" | "DISPATCHED" | "SETTLED" | "CLAIMED" | "EXPIRED" | "REFUNDED";
  source_tx_hash: string | null;
  source_block_number: number | null;
  dest_tx_hash: string | null;
  claim_tx_hash: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export function TelemetryDashboard({ active = true }: { active?: boolean }) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [intents, setIntents] = useState<StoredIntent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [livePingMs, setLivePingMs] = useState<number | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<StoredIntent | null>(null);
  const [isSecurityExpanded, setIsSecurityExpanded] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchTelemetry = useCallback(async () => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    setIsLoading(true);
    const start = performance.now();
    try {
      const [healthRes, intentsRes] = await Promise.all([
        fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/health`, { signal: controller.signal }),
        fetch(`${PACT_CONFIG.relayerApiUrl}/api/v1/intents?limit=15`, { signal: controller.signal }),
      ]);
      if (!healthRes.ok || !intentsRes.ok) throw new Error("Relayer or network health is unavailable. Previously loaded data may be stale.");
      const [healthData, intentData] = await Promise.all([healthRes.json(), intentsRes.json()]);
      if (!healthData.chains || !Array.isArray(intentData.intents)) throw new Error("The relayer returned invalid telemetry.");
      if (controller.signal.aborted) return;
      setHealth(healthData);
      setIntents(intentData.intents);
      setLivePingMs(Math.round(performance.now() - start));
      setLastRefreshed(Date.now());
      setError(null);
    } catch (err) {
      if (controllerRef.current === controller) { setError((err as Error).name === "AbortError" ? "Telemetry timed out. Retrying automatically." : (err as Error).message); setLivePingMs(null); }
    } finally {
      clearTimeout(timeout);
      if (controllerRef.current === controller) { controllerRef.current = null; setIsLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void fetchTelemetry();
    const interval = setInterval(() => void fetchTelemetry(), 5000);
    return () => { clearInterval(interval); const controller = controllerRef.current; controllerRef.current = null; controller?.abort(); };
  }, [active, fetchTelemetry]);

  return (
    <div className="w-full max-w-4xl mx-auto min-h-screen p-4 sm:p-6 pb-24 space-y-6 pt-16">
      {/* Header & Live Health Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface-card border border-surface-border rounded-3xl p-5 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${error ? "bg-red-400" : health ? "bg-success" : "bg-text-muted"}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${error ? "text-red-300" : "text-text-muted"}`}>
              {error ? "Connection unavailable" : health ? `Relayer ${health.status} · v${health.version}` : "Connecting to relayer…"}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-text-main tracking-tight flex flex-wrap items-center gap-2">
            <span>Pact Protocol Telemetry</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/40 font-mono">
              Avalanche Fuji Anchor
            </span>
          </h1>
          <p className="text-xs text-text-muted">
            Real-time cross-chain liquidity, intent settlement latencies, and security metrics
          </p>
        </div>

        <div className="flex items-center gap-2">
          {livePingMs !== null && (
            <div className="px-3 py-1.5 rounded-xl bg-surface-base border border-surface-border text-xs font-mono text-text-muted flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-success" />
              <span>{livePingMs}ms ping</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => void fetchTelemetry()}
            disabled={isLoading}
            className="p-2 rounded-xl bg-surface-base border border-surface-border text-text-muted hover:text-text-main transition-colors disabled:opacity-50"
            title="Refresh Telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-primary" : ""}`} />
          </button>
        </div>
      </div>

      {error && <p role="alert" className="p-3 rounded-xl border border-red-500/30 text-sm text-red-300">{error}</p>}
      <p className="text-xs text-text-muted">{lastRefreshed ? `Last successful update: ${new Date(lastRefreshed).toLocaleTimeString()}` : "No live data received yet."} Testnet data only.</p>

      {/* Performance targets are not live measurements. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-surface-card border border-surface-border flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-text-muted text-xs">
            <span>Quote SLA</span>
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-black text-text-main tracking-tight font-mono">
            &lt; 300ms
          </div>
          <div className="text-[10px] text-success font-semibold mt-1">
            Performance target, not measured here
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-card border border-surface-border flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-text-muted text-xs">
            <span>⚡ Lightning Route</span>
            <Zap className="w-3.5 h-3.5 text-primary fill-primary" />
          </div>
          <div className="mt-2 text-2xl font-black text-text-main tracking-tight font-mono">
            &lt; 3.0s
          </div>
          <div className="text-[10px] text-success font-semibold mt-1">
            Estimated destination fill time
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-card border border-surface-border flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-text-muted text-xs">
            <span>🐢 Economy Route</span>
            <Clock className="w-3.5 h-3.5 text-success" />
          </div>
          <div className="mt-2 text-2xl font-black text-text-main tracking-tight font-mono">
            &lt; 45s
          </div>
          <div className="text-[10px] text-success font-semibold mt-1">
            Estimated batching window
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-card border border-surface-border flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 text-text-muted text-xs">
            <span>Escrow refund</span>
            <ShieldCheck className="w-3.5 h-3.5 text-success" />
          </div>
          <div className="mt-2 text-2xl font-black text-text-main tracking-tight font-mono">
            Unclaimed only
          </div>
          <div className="text-[10px] text-text-muted mt-1">
            15-min deterministic timeout
          </div>
        </div>
      </div>

      {/* Multi-Chain Liquidity & Node Health Grid */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5" />
            <span>Multi-Chain Solver Nodes & Liquidity</span>
          </h2>
          <span className="text-[10px] text-text-muted">
            Auto-syncing every 5s
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Node 1: Avalanche Fuji */}
          <div className="p-4 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-sm font-bold text-text-main">Avalanche Fuji</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-base border border-surface-border text-text-muted">
                ID: 43113
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-text-muted">
                <span>Block:</span>
                <span className="text-text-main font-semibold">
                  #{health?.chains.avalancheFuji.blockNumber || "..."}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Relayer Gas:</span>
                <span className="text-text-main font-semibold">
                  {Number(health?.chains.avalancheFuji.nativeBalance || 0).toFixed(4)} AVAX
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Solver wallet USDC:</span>
                <span className="text-success font-bold">
                  ${Number(health?.chains.avalancheFuji.usdcBalance || 0).toLocaleString()} USDC
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-surface-border/60 flex justify-between text-[11px]">
              <a
                href={getExplorerAddressUrl(
                  43113,
                  PACT_CONFIG.fuji.pactEscrow
                )}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                <span>PactEscrow Contract</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Node 2: Arbitrum Sepolia */}
          <div className="p-4 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm font-bold text-text-main">Arbitrum Sepolia</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-base border border-surface-border text-text-muted">
                ID: 421614
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-text-muted">
                <span>Block:</span>
                <span className="text-text-main font-semibold">
                  #{health?.chains.arbitrumSepolia.blockNumber || "..."}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Relayer Gas:</span>
                <span className="text-text-main font-semibold">
                  {Number(health?.chains.arbitrumSepolia.nativeBalance || 0).toFixed(4)} ETH
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Merchant Fill Pool:</span>
                <span className="text-success font-bold">
                  ${Number(health?.chains.arbitrumSepolia.usdcBalance || 0).toLocaleString()} USDC
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-surface-border/60 flex justify-between text-[11px]">
              <a
                href={getExplorerAddressUrl(
                  421614,
                  PACT_CONFIG.arbitrumSepolia.batchDispatcher
                )}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>BatchDispatcher</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {/* Node 3: Base Sepolia */}
          <div className="p-4 rounded-2xl bg-surface-card border border-surface-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                <span className="text-sm font-bold text-text-main">Base Sepolia</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-base border border-surface-border text-text-muted">
                ID: 84532
              </span>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-text-muted">
                <span>Block:</span>
                <span className="text-text-main font-semibold">
                  #{health?.chains.baseSepolia.blockNumber || "..."}
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Relayer Gas:</span>
                <span className="text-text-main font-semibold">
                  {Number(health?.chains.baseSepolia.nativeBalance || 0).toFixed(4)} ETH
                </span>
              </div>
              <div className="flex justify-between text-text-muted">
                <span>Merchant Fill Pool:</span>
                <span className="text-success font-bold">
                  ${Number(health?.chains.baseSepolia.usdcBalance || 0).toLocaleString()} USDC
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-surface-border/60 flex justify-between text-[11px]">
              <a
                href={getExplorerAddressUrl(
                  84532,
                  PACT_CONFIG.baseSepolia.batchDispatcher
                )}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline flex items-center gap-1"
              >
                <span>BatchDispatcher</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Security Architecture & EIP-7702 Post-Mortem Defense Panel (§3.1.2) */}
      <div className="bg-surface-card border border-surface-border rounded-3xl p-5 shadow-xl space-y-3">
        <button
          type="button"
          onClick={() => setIsSecurityExpanded(!isSecurityExpanded)}
          className="w-full flex flex-wrap items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-text-main">
              Security architecture & trust assumptions
            </span>
          </div>
          {isSecurityExpanded ? (
            <ChevronUp className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          )}
        </button>

        {isSecurityExpanded && (
          <div className="pt-3 border-t border-surface-border/60 space-y-3 text-xs text-text-muted leading-relaxed">
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span>Testnet trust model</span>
              </div>
              <p>
                The solver controls destination liquidity and the escrow preimage. This escrow does not
                verify destination-chain settlement. Do not use this demo for real-value payments.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-success/10 border border-success/20 text-success space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Pact Protocol Countermeasure: Isolated ERC-4337 Kernel v3.1</span>
              </div>
              <p className="text-text-muted">
                Pact uses ERC-4337 Kernel smart accounts with EntryPoint v0.7. Session keys can call the
                testnet faucet, approve the configured escrow, create payment intents, and request refunds.
                The on-chain call policy limits each payment to 50 USDC; the signing session expires after 24 hours.
              </p>
              <div className="font-mono text-[11px] bg-surface-base p-2 rounded-lg text-text-main my-1">
                Payment ≤ 50 USDC · Session validity: 24h · Not a cumulative daily spending cap
              </div>
              <p className="text-text-muted">
                Session credentials are stored in this browser. Keep the device secure. Unclaimed escrow can
                be refunded by the original sender after the deadline; an active signing session is required.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Live Intent Settlement Stream & Audit Trail */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Live Intent Settlement Stream ({intents.length} Recent)</span>
          </h2>
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            {health?.intentStateCounts && (
              <>
                <span className="px-1.5 py-0.5 rounded bg-success/10 text-success">
                  {health.intentStateCounts.CLAIMED || 0} Claimed
                </span>
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {health.intentStateCounts.SETTLED || 0} Settled
                </span>
                <span className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-text-muted">
                  {health.intentStateCounts.CREATED || 0} Pending
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">
                  {health.intentStateCounts.EXPIRED || 0} Expired · refund pending
                </span>
                <span className="px-1.5 py-0.5 rounded bg-surface-card border border-surface-border text-text-muted">
                  {health.intentStateCounts.REFUNDED || 0} Refunded
                </span>
              </>
            )}
          </div>
        </div>

        {intents.length === 0 ? (
          <div className="p-8 rounded-3xl bg-surface-card border border-surface-border text-center text-xs text-text-muted">
            No intents in current session. Submit a payment on the Payer tab to observe live cross-chain settlement!
          </div>
        ) : (
          <div className="space-y-2.5">
            {intents.map((item) => {
              const amountUsd = (Number(item.amount_in) / 1e6).toFixed(2);
              const feeUsd = (Number(item.fee_paid) / 1e6).toFixed(3);
              const isLightning = item.priority === 0;
              const durationSec =
                item.updated_at && item.created_at
                  ? ((item.updated_at - item.created_at) / 1000).toFixed(1)
                  : null;

              return (
                <div
                  key={item.intent_id}
                  className="p-4 rounded-2xl bg-surface-card border border-surface-border hover:border-surface-border/80 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded font-bold flex items-center gap-1 ${
                          isLightning
                            ? "bg-primary/20 text-primary"
                            : "bg-success/20 text-success"
                        }`}
                      >
                        {isLightning ? (
                          <>
                            <Zap className="w-3 h-3" />
                            <span>Lightning</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3 h-3" />
                            <span>Economy</span>
                          </>
                        )}
                      </span>
                      <span className="text-xs font-mono font-bold text-text-main">
                        ${amountUsd} USDC
                      </span>
                      <span className="text-[10px] text-text-muted">
                        (Fee: ${feeUsd})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {durationSec && (
                        <span className="text-[10px] font-mono text-text-muted">
                          {durationSec}s
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.state === "CLAIMED"
                            ? "bg-success/20 text-success"
                            : item.state === "SETTLED"
                            ? "bg-blue-500/20 text-blue-400"
                            : item.state === "DISPATCHED" || item.state === "EXPIRED"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-surface-base text-text-muted"
                        }`}
                      >
                        {item.state}
                      </span>
                    </div>
                  </div>

                  {/* Cross-Chain Path */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-surface-base/60 p-2.5 rounded-xl border border-surface-border/40">
                    <div className="flex items-center gap-1.5 text-text-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span>Fuji Escrow</span>
                      <span className="text-[10px]">→</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-text-main font-semibold">
                        {getChainName(item.target_chain_id)}
                      </span>
                    </div>

                    <div className="text-[10px] text-text-muted truncate max-w-[140px]">
                      {item.receiver}
                    </div>
                  </div>

                  {/* Explorer Links Trail */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] pt-1">
                    {item.source_tx_hash && (
                      <a
                        href={getExplorerTxUrl(43113, item.source_tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>1. Fuji Escrow</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {item.dest_tx_hash && (
                      <a
                        href={getExplorerTxUrl(
                          item.target_chain_id,
                          item.dest_tx_hash
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <span>2. Dest Fill</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {item.claim_tx_hash && (
                      <a
                        href={getExplorerTxUrl(43113, item.claim_tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-success hover:underline flex items-center gap-0.5"
                      >
                        <span>3. Fuji Claim</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
