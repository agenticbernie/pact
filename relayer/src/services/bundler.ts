/**
 * Pact Protocol — ERC-4337 v0.7 Bundler & Gas Sponsorship Engine (FR-01, FR-02, FR-03, NFR-04)
 *
 * Executes ZeroDev Kernel v3.1 UserOperations directly against canonical EntryPoint v0.7
 * (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) on Avalanche Fuji (43113) and sponsors
 * gas deposits (`depositTo`) so Smart Accounts operate with 0 native AVAX required.
 */
import {
  concatHex,
  numberToHex,
  pad,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from "viem";
import {
  entryPoint07Abi,
  entryPoint07Address,
  getUserOperationHash,
  toPackedUserOperation,
  type UserOperation,
} from "viem/account-abstraction";
import {
  CONTRACTS,
  fujiPublicClient,
  fujiWalletClient,
  relayerAccount,
  withChainLock,
} from "../config/chains.js";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method: string;
  params?: unknown[];
}

interface StoredUserOpReceipt {
  userOpHash: Hex;
  sender: Address;
  nonce: Hex;
  actualGasCost: Hex;
  actualGasUsed: Hex;
  success: boolean;
  logs: unknown[];
  receipt: Record<string, unknown>;
}

const userOpReceipts = new Map<string, StoredUserOpReceipt>();

function toBigIntSafe(val: unknown, fallback = 0n): bigint {
  if (typeof val === "bigint") return val;
  if (typeof val === "number") return BigInt(val);
  if (typeof val === "string" && val.length > 0) {
    return BigInt(val);
  }
  return fallback;
}

function normalizeUserOperation07(raw: Record<string, unknown>): UserOperation<"0.7"> {
  return {
    sender: raw.sender as Address,
    nonce: toBigIntSafe(raw.nonce, 0n),
    factory: (raw.factory as Address | undefined) || undefined,
    factoryData: (raw.factoryData as Hex | undefined) || undefined,
    callData: (raw.callData as Hex) || "0x",
    callGasLimit: toBigIntSafe(raw.callGasLimit, 600_000n),
    verificationGasLimit: toBigIntSafe(raw.verificationGasLimit, 800_000n),
    preVerificationGas: toBigIntSafe(raw.preVerificationGas, 100_000n),
    maxFeePerGas: toBigIntSafe(raw.maxFeePerGas, 25_000_000_000n),
    maxPriorityFeePerGas: toBigIntSafe(raw.maxPriorityFeePerGas, 1_500_000_000n),
    paymaster: (raw.paymaster as Address | undefined) || undefined,
    paymasterVerificationGasLimit: raw.paymaster
      ? toBigIntSafe(raw.paymasterVerificationGasLimit, 100_000n)
      : undefined,
    paymasterPostOpGasLimit: raw.paymaster
      ? toBigIntSafe(raw.paymasterPostOpGasLimit, 100_000n)
      : undefined,
    paymasterData: (raw.paymasterData as Hex | undefined) || undefined,
    signature: (raw.signature as Hex) || "0x",
  };
}

function serializeReceiptForRpc(r: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(r, (_key, value) =>
      typeof value === "bigint" ? numberToHex(value) : value
    )
  ) as Record<string, unknown>;
}

export async function handleBundlerJsonRpc(
  body: JsonRpcRequest | JsonRpcRequest[]
): Promise<unknown> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => handleSingleJsonRpc(item)));
  }
  return handleSingleJsonRpc(body);
}

async function handleSingleJsonRpc(req: JsonRpcRequest): Promise<unknown> {
  const id = req.id ?? 1;
  const method = req.method;
  const params = req.params ?? [];

  try {
    switch (method) {
      case "eth_chainId": {
        return { jsonrpc: "2.0", id, result: numberToHex(CONTRACTS.avalancheFuji.chainId) };
      }

      case "eth_supportedEntryPoints": {
        return { jsonrpc: "2.0", id, result: [entryPoint07Address] };
      }

      case "zd_getUserOperationGasPrice":
      case "pimlico_getUserOperationGasPrice": {
        const gasPrice = await fujiPublicClient.getGasPrice();
        const maxPriorityFeePerGas = 100_000_000n; // 0.1 gwei
        const maxFeePerGas =
          gasPrice + maxPriorityFeePerGas > 1_000_000_000n
            ? gasPrice + maxPriorityFeePerGas
            : 1_000_000_000n; // 1 gwei
        const priceObj = {
          maxFeePerGas: numberToHex(maxFeePerGas),
          maxPriorityFeePerGas: numberToHex(maxPriorityFeePerGas),
        };
        return {
          jsonrpc: "2.0",
          id,
          result: {
            slow: priceObj,
            standard: priceObj,
            fast: priceObj,
          },
        };
      }

      case "eth_estimateUserOperationGas": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            preVerificationGas: numberToHex(100_000n),
            verificationGasLimit: numberToHex(2_000_000n),
            callGasLimit: numberToHex(600_000n),
            paymasterVerificationGasLimit: "0x0",
            paymasterPostOpGasLimit: "0x0",
          },
        };
      }

      case "pm_getPaymasterStubData":
      case "pm_getPaymasterData":
      case "pm_sponsorUserOperation":
      case "zd_sponsorUserOperation": {
        // We sponsor gas by prefunding the Smart Account's EntryPoint v0.7 deposit directly!
        return {
          jsonrpc: "2.0",
          id,
          result: {
            preVerificationGas: numberToHex(100_000n),
            verificationGasLimit: numberToHex(2_000_000n),
            callGasLimit: numberToHex(600_000n),
            paymaster: undefined,
            paymasterData: "0x",
            paymasterVerificationGasLimit: "0x0",
            paymasterPostOpGasLimit: "0x0",
          },
        };
      }

      case "eth_sendUserOperation": {
        const rawUserOp = params[0] as Record<string, unknown>;
        const epAddr = ((params[1] as Address) || entryPoint07Address) as Address;
        const userOp = normalizeUserOperation07(rawUserOp);

        const userOpHash = getUserOperationHash({
          userOperation: userOp,
          entryPointAddress: epAddr,
          entryPointVersion: "0.7",
          chainId: CONTRACTS.avalancheFuji.chainId,
        });

        const packedOp = toPackedUserOperation(userOp);

        console.log(
          `[Bundler] Executing UserOperation ${userOpHash} for Smart Account ${userOp.sender}...`
        );

        await withChainLock(CONTRACTS.avalancheFuji.chainId, async () => {
          // 1. Check & sponsor EntryPoint v0.7 deposit for Smart Account (FR-03: Gas Sponsorship)
          const currentDeposit = await fujiPublicClient.readContract({
            address: entryPoint07Address,
            abi: entryPoint07Abi,
            functionName: "balanceOf",
            args: [userOp.sender],
          });

          const minDeposit = parseEther("0.003");
          if (currentDeposit < minDeposit) {
            const topUpAmount = parseEther("0.006");
            console.log(
              `[Paymaster] Sponsoring ${userOp.sender} on EntryPoint v0.7 with 0.006 AVAX...`
            );
            const depTx = await fujiWalletClient.writeContract({
              address: entryPoint07Address,
              abi: entryPoint07Abi,
              functionName: "depositTo",
              args: [userOp.sender],
              value: topUpAmount,
            });
            await fujiPublicClient.waitForTransactionReceipt({
              hash: depTx,
              pollingInterval: 250,
            });
          }

          // 2. Simulate on-chain validation (EntryPoint + Kernel v3 + CallPolicy) before broadcasting
          await fujiPublicClient.simulateContract({
            address: entryPoint07Address,
            abi: entryPoint07Abi,
            functionName: "handleOps",
            args: [[packedOp], relayerAccount.address],
            account: relayerAccount,
            gas: 4_000_000n,
          });

          // 3. Execute EntryPoint.handleOps on Avalanche Fuji
          const handleOpsTx = await fujiWalletClient.writeContract({
            address: entryPoint07Address,
            abi: entryPoint07Abi,
            functionName: "handleOps",
            args: [[packedOp], relayerAccount.address],
            gas: 4_000_000n,
          });

          const txReceipt = await fujiPublicClient.waitForTransactionReceipt({
            hash: handleOpsTx,
            pollingInterval: 250,
          });

          const opEvents = parseEventLogs({
            abi: entryPoint07Abi,
            eventName: "UserOperationEvent",
            logs: txReceipt.logs,
          });

          const matchedEvent = opEvents.find(
            (e) => e.args.userOpHash.toLowerCase() === userOpHash.toLowerCase()
          );
          const success = matchedEvent ? matchedEvent.args.success : txReceipt.status === "success";
          const actualGasCost = matchedEvent ? matchedEvent.args.actualGasCost : 0n;
          const actualGasUsed = matchedEvent ? matchedEvent.args.actualGasUsed : txReceipt.gasUsed;

          const serializedReceipt = serializeReceiptForRpc({
            ...txReceipt,
            status: txReceipt.status === "success" ? "0x1" : "0x0",
          });

          const stored: StoredUserOpReceipt = {
            userOpHash,
            sender: userOp.sender,
            nonce: numberToHex(userOp.nonce),
            actualGasCost: numberToHex(actualGasCost),
            actualGasUsed: numberToHex(actualGasUsed),
            success,
            logs: serializedReceipt.logs as unknown[],
            receipt: serializedReceipt,
          };

          userOpReceipts.set(userOpHash.toLowerCase(), stored);
          console.log(
            `[Bundler] -> UserOperation ${userOpHash} confirmed on Fuji! tx=${handleOpsTx} success=${success}`
          );

          if (!success) {
            throw new Error(`UserOperation ${userOpHash} inner execution reverted in tx ${handleOpsTx}`);
          }
        });

        return { jsonrpc: "2.0", id, result: userOpHash };
      }

      case "eth_getUserOperationReceipt": {
        const hash = String(params[0] || "").toLowerCase();
        const stored = userOpReceipts.get(hash);
        return {
          jsonrpc: "2.0",
          id,
          result: stored ?? null,
        };
      }

      case "eth_getUserOperationByHash": {
        const hash = String(params[0] || "").toLowerCase();
        const stored = userOpReceipts.get(hash);
        if (!stored) {
          return { jsonrpc: "2.0", id, result: null };
        }
        return {
          jsonrpc: "2.0",
          id,
          result: {
            userOperation: {
              sender: stored.sender,
              nonce: stored.nonce,
            },
            entryPoint: entryPoint07Address,
            transactionHash: stored.receipt.transactionHash,
            blockHash: stored.receipt.blockHash,
            blockNumber: stored.receipt.blockNumber,
          },
        };
      }

      default: {
        // Proxy standard eth_* calls to Avalanche Fuji public client
        const rpcRes = await fujiPublicClient.transport.request({
          method,
          params,
        });
        return { jsonrpc: "2.0", id, result: rpcRes };
      }
    }
  } catch (err) {
    const message = (err as Error).message || String(err);
    console.error(`[Bundler RPC Error] method=${method}:`, message);
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32500,
        message,
      },
    };
  }
}
