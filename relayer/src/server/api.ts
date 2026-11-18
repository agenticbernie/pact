/**
 * Pact Protocol — Relayer HTTP API Server (§3, NFR-01)
 * Endpoints:
 *   GET/POST /api/v1/quote
 *   GET      /api/v1/health
 *   GET      /api/v1/intents
 *   GET      /api/v1/intents/:intentId
 *   GET      /api/v1/orders/:orderId
 */
import http from "node:http";
import { PasskeyService } from "../services/passkeys.js";
import { URL } from "node:url";
import { formatEther, isAddress } from "viem";
import { MOCK_USDC_ABI } from "../abi/contracts.js";
import {
  CONTRACTS,
  arbSepoliaPublicClient,
  baseSepoliaPublicClient,
  fujiPublicClient,
  getDestinationClients,
  relayerAccount,
} from "../config/chains.js";
import { RelayerStore } from "../db/store.js";
import { handleBundlerJsonRpc } from "../services/bundler.js";
import {
  DEFAULT_DEADLINE_SECONDS,
  Priority,
  calculateFeeAtomic,
  formatUsdcAmount,
  generateSecretAndHashLock,
  parseUsdcAmount,
} from "../types/pact.js";

// Escrow preimages must never leave the solver before an on-chain claim.
function publicIntent<T extends { secret?: unknown; error_message?: unknown }>(intent: T): Omit<T, "secret" | "error_message"> {
  // RPC diagnostic messages can include claim arguments, including the preimage.
  const { secret: _secret, error_message: _diagnostics, ...record } = intent;
  return record;
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  originHeader?: string
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": originHeader || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    req.on("data", (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > 65_536) { rejected = true; reject(new HttpError(413, "Request body exceeds 64 KiB.")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (rejected) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!value || typeof value !== "object") throw new Error("Expected a JSON object.");
        resolve(value);
      } catch { reject(new HttpError(400, "Request body must contain valid JSON.")); }
    });
    req.on("error", reject);
    req.on("aborted", () => reject(new HttpError(400, "Request was aborted.")));
  });
}

export function createRelayerHttpServer(store: RelayerStore): http.Server {
  const passkeys = new PasskeyService(store);
  return http.createServer(async (req, res) => {
    const startHr = performance.now();
    const originHeader = req.headers.origin;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": originHeader || "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    let pathname = "/";
    try {
      const reqUrl = new URL(req.url || "/", "http://localhost");
      pathname = reqUrl.pathname;
      // -----------------------------------------------------------------
      // 0A. POST /api/v1/bundler & /api/v1/paymaster (ERC-4337 JSON-RPC)
      // -----------------------------------------------------------------
      if (
        (pathname === "/api/v1/bundler" || pathname === "/api/v1/paymaster") &&
        req.method === "POST"
      ) {
        const rpcBody = await readJsonBody(req);
        const rpcRes = await handleBundlerJsonRpc(rpcBody as any);
        sendJson(res, 200, rpcRes, originHeader);
        return;
      }

      // -----------------------------------------------------------------
      // 0B. ZeroDev Passkey Server Endpoints (/api/v1/passkeys/...)
      // -----------------------------------------------------------------
      const passkeyRoute = /^\/api\/v1\/passkeys\/(register|login)\/(options|verify)$/.exec(pathname);
      if (passkeyRoute && req.method === "POST") {
        const flow = passkeyRoute[1] as "register" | "login";
        const body = await readJsonBody(req);
        try {
          const result = passkeyRoute[2] === "options" ? passkeys.options(flow, body, originHeader) : passkeys.verify(flow, body, originHeader);
          sendJson(res, 200, result, originHeader);
        } catch (error) {
          sendJson(res, 400, { verified: false, verification: { verified: false }, error: (error as Error).message }, originHeader);
        }
        return;
      }
      // -----------------------------------------------------------------
      // 1. GET / POST /api/v1/quote (<300ms per NFR-01)
      // -----------------------------------------------------------------
      if (pathname === "/api/v1/quote" && (req.method === "GET" || req.method === "POST")) {
        const body = req.method === "POST" ? await readJsonBody(req) : {};
        const amountStr = String(
          body.amount ?? reqUrl.searchParams.get("amount") ?? "3.50"
        );
        const targetChainId = Number(
          body.targetChainId ?? reqUrl.searchParams.get("targetChainId") ?? 421614
        );
        const merchant = (body.merchant ??
          reqUrl.searchParams.get("merchant") ??
          null) as string | null;
        const orderId = (body.orderId ??
          reqUrl.searchParams.get("orderId") ??
          null) as string | null;

        if (merchant !== null && (typeof merchant !== "string" || !isAddress(merchant, { strict: false }) || /^0x0{40}$/i.test(merchant))) throw new HttpError(400, "Invalid merchant wallet address.");
        if (orderId !== null && (typeof orderId !== "string" || !orderId.trim() || orderId.length > 200 || /[\x00-\x1f]/.test(orderId))) throw new HttpError(400, "Invalid order ID.");

        if (targetChainId !== 421614 && targetChainId !== 84532 && targetChainId !== 43113) {
          sendJson(res, 400, {
            error: "Unsupported targetChainId. Must be 421614 (Arbitrum Sepolia), 84532 (Base Sepolia), or 43113 (Avalanche Fuji).",
          });
          return;
        }

        let amountAtomic: bigint;
        try {
          amountAtomic = parseUsdcAmount(amountStr);
          if (amountAtomic <= 0n) throw new Error("Amount must be > 0");
        } catch {
          sendJson(res, 400, { error: `Invalid USDC amount: ${amountStr}` });
          return;
        }

        const lightningFeeAtomic = calculateFeeAtomic(amountAtomic, Priority.SPEED);
        const economyFeeAtomic = calculateFeeAtomic(amountAtomic, Priority.COST);
        const lightningTotalAtomic = amountAtomic + lightningFeeAtomic;
        const economyTotalAtomic = amountAtomic + economyFeeAtomic;

        const nowSec = Math.floor(Date.now() / 1000);
        const deadline = nowSec + DEFAULT_DEADLINE_SECONDS;
        const { secret, hashLock } = generateSecretAndHashLock();

        store.saveQuote({
          hashLock,
          secret,
          orderId,
          merchant,
          targetChainId,
          amountAtomic: amountAtomic.toString(),
          lightningFeeAtomic: lightningFeeAtomic.toString(),
          economyFeeAtomic: economyFeeAtomic.toString(),
          deadline,
        });

        const dest = getDestinationClients(targetChainId);
        let destUsdcBalance = 0n;
        try {
          destUsdcBalance = await dest.publicClient.readContract({
            address: dest.mockUsdcAddress,
            abi: MOCK_USDC_ABI,
            functionName: "balanceOf",
            args: [relayerAccount.address],
          });
        } catch (balErr) {
          console.warn(`[Quote] Balance check warning on ${targetChainId}:`, (balErr as Error).message);
        }

        const lightningAvailable = destUsdcBalance >= amountAtomic;
        const lightningUnavailableReason = lightningAvailable
          ? null
          : `Insufficient instant liquidity on ${dest.chainName} (Hot wallet balance: $${formatUsdcAmount(destUsdcBalance)} USDC < requested: $${formatUsdcAmount(amountAtomic)} USDC)`;

        const economyAvailable = lightningAvailable && dest.batchDispatcherAddress !== "0x0000000000000000000000000000000000000000";
        const economyUnavailableReason = !lightningAvailable ? "Destination liquidity is unavailable. Try again later." : !economyAvailable ? "Economy batching is not configured on this network." : null;
        const tokenOut = dest.mockUsdcAddress;

        const quoteLatencyMs = Number((performance.now() - startHr).toFixed(2));

        sendJson(res, 200, {
          protocol: "pact",
          version: "2.0.0",
          orderId,
          merchant,
          sourceChainId: CONTRACTS.avalancheFuji.chainId,
          pactEscrowAddress: CONTRACTS.avalancheFuji.pactEscrow,
          tokenIn: CONTRACTS.avalancheFuji.mockUsdc,
          targetChainId,
          tokenOut,
          amount: formatUsdcAmount(amountAtomic),
          amountAtomic: amountAtomic.toString(),
          hashLock,
          deadline,
          quoteLatencyMs,
          lightningAvailable,
          lightningUnavailableReason,
          routes: {
            lightning: {
              priority: Priority.SPEED,
              name: "Lightning Route",
              available: lightningAvailable,
              unavailableReason: lightningUnavailableReason,
              estimatedSeconds: "1.0 - 3.0",
              fee: formatUsdcAmount(lightningFeeAtomic),
              feeDisplayUsd: formatUsdcAmount(lightningFeeAtomic),
              feeAtomic: lightningFeeAtomic.toString(),
              totalPayable: formatUsdcAmount(lightningTotalAtomic),
              totalPayableDisplayUsd: formatUsdcAmount(lightningTotalAtomic),
              totalPayableAtomic: lightningTotalAtomic.toString(),
            },
            economy: {
              priority: Priority.COST,
              name: "Economy Route",
              available: economyAvailable,
              unavailableReason: economyUnavailableReason,
              estimatedSeconds: "15 - 45",
              fee: formatUsdcAmount(economyFeeAtomic),
              feeDisplayUsd: "0.005",
              feeAtomic: economyFeeAtomic.toString(),
              totalPayable: formatUsdcAmount(economyTotalAtomic),
              totalPayableDisplayUsd: formatUsdcAmount(economyTotalAtomic),
              totalPayableAtomic: economyTotalAtomic.toString(),
            },
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // 2. GET /api/v1/health (§3)
      // -----------------------------------------------------------------
      if (pathname === "/api/v1/health" && req.method === "GET") {
        const [
          fujiBlock,
          arbBlock,
          baseBlock,
          fujiNative,
          arbNative,
          baseNative,
          fujiUsdc,
          arbUsdc,
          baseUsdc,
        ] = await Promise.all([
          fujiPublicClient.getBlockNumber(),
          arbSepoliaPublicClient.getBlockNumber(),
          baseSepoliaPublicClient.getBlockNumber(),
          fujiPublicClient.getBalance({ address: relayerAccount.address }),
          arbSepoliaPublicClient.getBalance({ address: relayerAccount.address }),
          baseSepoliaPublicClient.getBalance({ address: relayerAccount.address }),
          fujiPublicClient.readContract({
            address: CONTRACTS.avalancheFuji.mockUsdc,
            abi: MOCK_USDC_ABI,
            functionName: "balanceOf",
            args: [relayerAccount.address],
          }),
          arbSepoliaPublicClient.readContract({
            address: CONTRACTS.arbitrumSepolia.mockUsdc,
            abi: MOCK_USDC_ABI,
            functionName: "balanceOf",
            args: [relayerAccount.address],
          }),
          baseSepoliaPublicClient.readContract({
            address: CONTRACTS.baseSepolia.mockUsdc,
            abi: MOCK_USDC_ABI,
            functionName: "balanceOf",
            args: [relayerAccount.address],
          }),
        ]);

        sendJson(res, 200, {
          status: "ok",
          version: "2.0.0",
          relayerAddress: relayerAccount.address,
          timestamp: Math.floor(Date.now() / 1000),
          intentStateCounts: store.getStateCounts(),
          chains: {
            avalancheFuji: {
              chainId: 43113,
              blockNumber: fujiBlock.toString(),
              nativeBalance: formatEther(fujiNative),
              usdcBalance: formatUsdcAmount(fujiUsdc),
              pactEscrow: CONTRACTS.avalancheFuji.pactEscrow,
              mockUsdc: CONTRACTS.avalancheFuji.mockUsdc,
            },
            arbitrumSepolia: {
              chainId: 421614,
              blockNumber: arbBlock.toString(),
              nativeBalance: formatEther(arbNative),
              usdcBalance: formatUsdcAmount(arbUsdc),
              mockUsdc: CONTRACTS.arbitrumSepolia.mockUsdc,
            },
            baseSepolia: {
              chainId: 84532,
              blockNumber: baseBlock.toString(),
              nativeBalance: formatEther(baseNative),
              usdcBalance: formatUsdcAmount(baseUsdc),
              mockUsdc: CONTRACTS.baseSepolia.mockUsdc,
            },
          },
        });
        return;
      }

      // -----------------------------------------------------------------
      // 3. GET /api/v1/intents & /api/v1/intents/:intentId
      // -----------------------------------------------------------------
      if (pathname === "/api/v1/intents" && req.method === "GET") {
        const limit = Number(reqUrl.searchParams.get("limit") ?? 25);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, "limit must be an integer from 1 to 100.");
        sendJson(res, 200, { intents: store.listRecentIntents(limit).map(publicIntent) }, originHeader);
        return;
      }

      if (pathname.startsWith("/api/v1/intents/") && req.method === "GET") {
        const intentId = pathname.replace("/api/v1/intents/", "").trim();
        const intent = store.getIntentById(intentId);
        if (!intent) {
          sendJson(res, 404, { error: `Intent ${intentId} not found` });
          return;
        }
        sendJson(res, 200, { intent: publicIntent(intent) }, originHeader);
        return;
      }

      // -----------------------------------------------------------------
      // 4. GET /api/v1/orders/:orderId (Merchant POS real-time status)
      // -----------------------------------------------------------------
      if (pathname.startsWith("/api/v1/orders/") && req.method === "GET") {
        const orderId = decodeURIComponent(pathname.replace("/api/v1/orders/", "").trim());
        const hashLock = reqUrl.searchParams.get("hashLock");
        const merchant = reqUrl.searchParams.get("merchant");
        const prefix = reqUrl.searchParams.get("prefix") === "1";
        const after = reqUrl.searchParams.has("after") ? Number(reqUrl.searchParams.get("after")) : undefined;
        if (hashLock && !/^0x[a-f0-9]{64}$/i.test(hashLock)) throw new HttpError(400, "Invalid payment hash lock.");
        if (merchant && !isAddress(merchant, { strict: false })) throw new HttpError(400, "Invalid merchant address.");
        if (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) throw new HttpError(400, "Invalid start timestamp.");
        if (prefix && (!orderId.startsWith("STATIC-") || !merchant || after === undefined)) throw new HttpError(400, "Reusable QR lookup requires a merchant and a start timestamp.");
        const intent = store.getIntentByOrderId(orderId, { hashLock, merchant, prefix, after });
        if (!intent) {
          sendJson(res, 404, { orderId, status: "PENDING", intent: null });
          return;
        }
        sendJson(res, 200, {
          orderId,
          status: intent.state,
          isSettled: intent.state === "SETTLED" || intent.state === "CLAIMED",
          intent: publicIntent(intent),
        });
        return;
      }

      // -----------------------------------------------------------------
      // 5. GET /api/v1/merchants/:address/settlements
      // -----------------------------------------------------------------
      const merchantMatch = pathname.match(/^\/api\/v1\/merchants\/([^/]+)\/settlements\/?$/);
      if (merchantMatch && req.method === "GET") {
        const merchantAddr = decodeURIComponent(merchantMatch[1].trim());
        const fromParam = reqUrl.searchParams.get("from");
        const toParam = reqUrl.searchParams.get("to");
        const format = (reqUrl.searchParams.get("format") || "json").toLowerCase();

        const fromTs = fromParam ? Number(fromParam) : undefined;
        const toTs = toParam ? Number(toParam) : undefined;

        if (!isAddress(merchantAddr, { strict: false }) || /^0x0{40}$/i.test(merchantAddr)) throw new HttpError(400, "Invalid merchant address.");
        if (format !== "json" && format !== "csv") throw new HttpError(400, "format must be json or csv.");
        if ([fromTs, toTs].some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw new HttpError(400, "Invalid settlement date range.");
        if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) throw new HttpError(400, "Start date must be before end date.");
        const summary = store.getMerchantSettlements(merchantAddr, fromTs, toTs);

        if (format === "csv") {
          const headers = [
            "intent_id",
            "order_id",
            "sender",
            "target_chain_id",
            "amount_in",
            "fee_paid",
            "state",
            "dest_tx_hash",
            "created_at",
          ];
          const lines = [headers.join(",")];
          for (const row of summary.rows) {
            const csvRow = [
              row.intent_id,
              row.order_id ? `"${row.order_id.replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"` : "",
              row.sender,
              row.target_chain_id,
              row.amount_in,
              row.fee_paid,
              row.state,
              row.dest_tx_hash || "",
              row.created_at,
            ];
            lines.push(csvRow.join(","));
          }
          const csvBody = lines.join("\n");
          res.writeHead(200, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="pact-settlements.csv"',
            "Access-Control-Allow-Origin": originHeader || "*",
                    "Cache-Control": "no-store",
          });
          res.end(csvBody);
          return;
        }

        sendJson(res, 200, { ...summary, rows: summary.rows.map(publicIntent) }, originHeader);
        return;
      }

      sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      console.error(`[API] Error handling ${req.method} ${pathname}:`, err);
      sendJson(res, err instanceof HttpError ? err.statusCode : err instanceof URIError ? 400 : 500, { error: err instanceof HttpError ? err.message : err instanceof URIError ? "Malformed URL encoding." : "Internal server error." }, originHeader);
    }
  });
}
