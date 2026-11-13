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
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { formatEther } from "viem";
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
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export function createRelayerHttpServer(store: RelayerStore): http.Server {
  return http.createServer(async (req, res) => {
    const startHr = performance.now();
    const originHeader = req.headers.origin;

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": originHeader || "*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    try {
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
      if (pathname === "/api/v1/passkeys/register/options" && req.method === "POST") {
        const body = await readJsonBody(req);
        const username = String(body.username || "Pact User");
        const rpID = String(body.rpID || "localhost");
        const userId = randomBytes(16).toString("base64url");
        const challenge = randomBytes(32).toString("base64url");

        sendJson(
          res,
          200,
          {
            userId,
            options: {
              challenge,
              rp: { name: "Pact Protocol", id: rpID },
              user: { id: userId, name: username, displayName: username },
              pubKeyCredParams: [{ alg: -7, type: "public-key" }],
              timeout: 60000,
              attestation: "none",
              authenticatorSelection: {
                residentKey: "preferred",
                requireResidentKey: false,
                userVerification: "preferred",
              },
            },
          },
          originHeader
        );
        return;
      }

      if (pathname === "/api/v1/passkeys/register/verify" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cred = body.cred as { id?: string; response?: { publicKey?: string } } | undefined;
        const authenticatorId = String(cred?.id || "");
        const pubkey = String(cred?.response?.publicKey || "");
        const userId = String(body.userId || "");
        const username = String(body.username || "Pact User");
        const rpId = String(body.rpID || "localhost");

        if (authenticatorId && pubkey) {
          store.savePasskey({
            authenticatorId,
            userId,
            username,
            rpId,
            pubkey,
          });
        }
        sendJson(res, 200, { verified: true }, originHeader);
        return;
      }

      if (pathname === "/api/v1/passkeys/login/options" && req.method === "POST") {
        const body = await readJsonBody(req);
        const rpID = String(body.rpID || "localhost");
        const challenge = randomBytes(32).toString("base64url");
        sendJson(
          res,
          200,
          {
            challenge,
            rpId: rpID,
            timeout: 60000,
            userVerification: "preferred",
          },
          originHeader
        );
        return;
      }

      if (pathname === "/api/v1/passkeys/login/verify" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cred = body.cred as { id?: string } | undefined;
        const authenticatorId = String(cred?.id || "");
        const saved = store.getPasskeyByAuthenticatorId(authenticatorId);
        if (!saved) {
          sendJson(res, 404, { verification: { verified: false }, error: "Passkey not found" }, originHeader);
          return;
        }
        sendJson(
          res,
          200,
          {
            verification: { verified: true },
            pubkey: saved.pubkey,
          },
          originHeader
        );
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
              feeDisplayUsd: Number(formatUsdcAmount(lightningFeeAtomic)).toFixed(2),
              feeAtomic: lightningFeeAtomic.toString(),
              totalPayable: formatUsdcAmount(lightningTotalAtomic),
              totalPayableDisplayUsd: Number(formatUsdcAmount(lightningTotalAtomic)).toFixed(2),
              totalPayableAtomic: lightningTotalAtomic.toString(),
            },
            economy: {
              priority: Priority.COST,
              name: "Economy Route",
              available: true,
              estimatedSeconds: "15 - 45",
              fee: formatUsdcAmount(economyFeeAtomic),
              feeDisplayUsd: "0.005",
              feeAtomic: economyFeeAtomic.toString(),
              totalPayable: formatUsdcAmount(economyTotalAtomic),
              totalPayableDisplayUsd: Number(formatUsdcAmount(economyTotalAtomic)).toFixed(3),
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
        sendJson(res, 200, { intents: store.listRecentIntents(limit) });
        return;
      }

      if (pathname.startsWith("/api/v1/intents/") && req.method === "GET") {
        const intentId = pathname.replace("/api/v1/intents/", "").trim();
        const intent = store.getIntentById(intentId);
        if (!intent) {
          sendJson(res, 404, { error: `Intent ${intentId} not found` });
          return;
        }
        sendJson(res, 200, { intent });
        return;
      }

      // -----------------------------------------------------------------
      // 4. GET /api/v1/orders/:orderId (Merchant POS real-time status)
      // -----------------------------------------------------------------
      if (pathname.startsWith("/api/v1/orders/") && req.method === "GET") {
        const orderId = decodeURIComponent(pathname.replace("/api/v1/orders/", "").trim());
        const intent = store.getIntentByOrderId(orderId);
        if (!intent) {
          sendJson(res, 404, { orderId, status: "PENDING", intent: null });
          return;
        }
        sendJson(res, 200, {
          orderId,
          status: intent.state,
          isSettled: intent.state === "SETTLED" || intent.state === "CLAIMED",
          intent,
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
              row.order_id ? `"${row.order_id.replace(/"/g, '""')}"` : "",
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
            "Access-Control-Allow-Credentials": "true",
            "Cache-Control": "no-store",
          });
          res.end(csvBody);
          return;
        }

        sendJson(res, 200, summary, originHeader);
        return;
      }

      sendJson(res, 404, { error: `Route not found: ${req.method} ${pathname}` });
    } catch (err) {
      console.error(`[API] Error handling ${req.method} ${pathname}:`, err);
      sendJson(res, 500, { error: (err as Error).message || "Internal server error" });
    }
  });
}
