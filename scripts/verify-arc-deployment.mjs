#!/usr/bin/env node
/** Read-only Arc deployment verifier. Never creates a signer or sends a request. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, getAddress, keccak256 } from "ethers";

const EXPECTED = {
  chainId: 5042002,
  block: 62906924,
  deployer: "0xb8bdcc633cd8e67250358d807918f99dc0c14d52",
  merchantSimulator: "0xaC030dDAA1fc29c1738332C3B9524EcfD0b4174F",
  pool: "0x5e1771de29Bd1a084900d032fd4DB2Ac7cF7528B",
  controller: "0x7A474c005433DEf5fC496D2016F6Ae794EDFC423",
  merchantId: "0x020568146fc6eca5159842a3e6d4da71e6aaaf285a0c4ab978902e30fdc77a70",
  merchantRecipient: "0xCb051F15436C352c6498Ec8702246FeaEdD35bB4",
  poolBalance: 1000000000000000000n,
};

const ABI = [
  "function owner() view returns (address)",
  "function pool() view returns (address)",
  "function controller() view returns (address)",
  "function merchant() view returns (address)",
  "function availableBalance() view returns (uint256)",
  "function merchants(bytes32) view returns (address recipient, bool active, uint256 totalReceived)",
  "function isMerchantActive(bytes32) view returns (bool)",
];

function args(argv) {
  const result = { rpc: process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.io", config: "config/networks/arc-testnet.json" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--rpc-url" && argv[i + 1]) result.rpc = argv[++i];
    else if (argv[i] === "--config" && argv[i + 1]) result.config = argv[++i];
  }
  return result;
}

function same(a, b) {
  return getAddress(a) === getAddress(b);
}

function maskImmutableBytes(bytecode, immutableReferences) {
  const bytes = bytecode.slice(2).split("");
  for (const ranges of Object.values(immutableReferences ?? {})) {
    for (const { start, length } of ranges) {
      bytes.fill("0", start * 2, (start + length) * 2);
    }
  }
  return `0x${bytes.join("")}`;
}

const pause = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function readRpc(operation) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === 3 || !String(error?.message ?? error).toLowerCase().includes("rate limit")) throw error;
      await pause(750 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

const CONTRACT_ARTIFACTS = {
  merchantSimulator: ["MerchantSimulator", "contracts/out-arc/MerchantSimulator.sol/MerchantSimulator.json"],
  pool: ["PactCreditPool", "contracts/out-arc/PactCreditPool.sol/PactCreditPool.json"],
  controller: ["PactCardController", "contracts/out-arc/PactCardController.sol/PactCardController.json"],
};

async function main() {
  const options = args(process.argv.slice(2));
  const config = JSON.parse(readFileSync(resolve(options.config), "utf8"));
  const provider = new JsonRpcProvider(options.rpc);
  const observedChainId = Number((await readRpc(() => provider.getNetwork())).chainId);
  if (observedChainId !== EXPECTED.chainId || config.chainId !== EXPECTED.chainId) {
    throw new Error(`CHAIN_MISMATCH expected=${EXPECTED.chainId} observed=${observedChainId}`);
  }

  const artifact = JSON.parse(readFileSync(resolve("contracts/broadcast/DeployPaymentSystem.s.sol/5042002/run-latest.json"), "utf8"));
  const artifactRows = [];
  for (const [index, transaction] of (artifact.transactions ?? []).entries()) {
    const liveTransaction = await readRpc(() => provider.getTransaction(transaction.hash));
    const liveReceipt = await readRpc(() => provider.getTransactionReceipt(transaction.hash));
    artifactRows.push({
      index,
      artifactType: transaction.transactionType,
      artifactContractName: transaction.contractName,
      artifactAddress: transaction.contractAddress,
      hash: transaction.hash,
      artifactSelector: transaction.transaction?.input?.slice(0, 10) ?? null,
      liveReceiptStatus: liveReceipt?.status ?? null,
      liveFrom: liveReceipt?.from ?? liveTransaction?.from ?? null,
      liveBlockNumber: liveReceipt?.blockNumber ?? null,
      liveTo: liveTransaction?.to ?? null,
      liveCreatedAddress: liveReceipt?.contractAddress ?? null,
      liveSelector: liveTransaction?.data?.slice(0, 10) ?? null,
    });
  }
  const expectedContracts = {
    merchantSimulator: EXPECTED.merchantSimulator,
    pool: EXPECTED.pool,
    controller: EXPECTED.controller,
  };
  const expectedContractNames = { merchantSimulator: "MerchantSimulator", pool: "PactCreditPool", controller: "PactCardController" };
  const deploymentTxs = Object.entries(expectedContracts).map(([name, address]) => {
    const row = artifactRows.find((candidate) => candidate.liveCreatedAddress && same(candidate.liveCreatedAddress, address));
    if (!row || row.liveReceiptStatus !== 1 || row.liveBlockNumber !== EXPECTED.block) throw new Error(`DEPLOYMENT_RECEIPT_MISMATCH ${name}`);
    return [name, address, row.hash];
  });
  const artifactDiscrepancies = artifactRows
    .filter((row) => row.artifactType === "CREATE" && (!row.liveCreatedAddress || row.artifactAddress?.toLowerCase() !== row.liveCreatedAddress.toLowerCase() || row.artifactContractName !== expectedContractNames[Object.entries(expectedContracts).find(([, address]) => address.toLowerCase() === row.liveCreatedAddress?.toLowerCase())?.[0]]))
    .map((row) => ({ index: row.index, hash: row.hash, artifactContractName: row.artifactContractName, artifactAddress: row.artifactAddress, liveCreatedAddress: row.liveCreatedAddress }));

  const bytecode = {};
  for (const [name, [contractName, artifactPath]] of Object.entries(CONTRACT_ARTIFACTS)) {
    const compiled = JSON.parse(readFileSync(resolve(artifactPath), "utf8"));
    const address = expectedContracts[name];
    const liveCode = await readRpc(() => provider.getCode(address));
    const compiledRuntime = compiled.deployedBytecode?.object ?? "";
    const normalizedCompiledRuntime = compiledRuntime.startsWith("0x") ? compiledRuntime : `0x${compiledRuntime}`;
    const normalizedLiveRuntime = liveCode === "0x" ? liveCode : maskImmutableBytes(liveCode, compiled.deployedBytecode?.immutableReferences);
    const normalizedCompiled = compiledRuntime ? maskImmutableBytes(normalizedCompiledRuntime, compiled.deployedBytecode?.immutableReferences) : "0x";
    bytecode[name] = {
      contractName,
      address,
      liveRuntimeBytecodeHash: liveCode === "0x" ? null : keccak256(liveCode),
      compiledRuntimeBytecodeHash: compiledRuntime ? keccak256(normalizedCompiled) : null,
      runtimeBytecodeMatch: liveCode !== "0x" && compiledRuntime ? normalizedLiveRuntime.toLowerCase() === normalizedCompiled.toLowerCase() : false,
      abiFunctionCount: compiled.abi.filter((entry) => entry.type === "function").length,
    };
  }

  const [merchant, pool, controller] = [EXPECTED.merchantSimulator, EXPECTED.pool, EXPECTED.controller].map((address) => new Contract(address, ABI, provider));
  const merchantCode = await readRpc(() => provider.getCode(EXPECTED.merchantSimulator));
  const poolCode = await readRpc(() => provider.getCode(EXPECTED.pool));
  const controllerCode = await readRpc(() => provider.getCode(EXPECTED.controller));
  const merchantOwner = await readRpc(() => merchant.owner());
  const poolOwner = await readRpc(() => pool.owner());
  const controllerOwner = await readRpc(() => controller.owner());
  const merchantPool = await readRpc(() => merchant.pool());
  const poolController = await readRpc(() => pool.controller());
  const poolMerchant = await readRpc(() => pool.merchant());
  const controllerPool = await readRpc(() => controller.pool());
  const controllerMerchant = await readRpc(() => controller.merchant());
  const balance = await readRpc(() => pool.availableBalance());
  const merchantRecord = await readRpc(() => merchant.merchants(EXPECTED.merchantId));
  const active = await readRpc(() => merchant.isMerchantActive(EXPECTED.merchantId));
  const checks = {
    bytecode: [merchantCode, poolCode, controllerCode].every((code) => code !== "0x"),
    ownership: [merchantOwner, poolOwner, controllerOwner].every((ownerAddress) => same(ownerAddress, EXPECTED.deployer)),
    wiring: same(merchantPool, EXPECTED.pool) && same(poolController, EXPECTED.controller) && same(poolMerchant, EXPECTED.merchantSimulator) && same(controllerPool, EXPECTED.pool) && same(controllerMerchant, EXPECTED.merchantSimulator),
    merchant: same(merchantRecord.recipient, EXPECTED.merchantRecipient) && active === true && merchantRecord.totalReceived === 0n,
    poolBalance: balance === EXPECTED.poolBalance,
  };
  const result = { chainId: observedChainId, block: EXPECTED.block, deployer: EXPECTED.deployer, contracts: { merchantSimulator: EXPECTED.merchantSimulator, pool: EXPECTED.pool, controller: EXPECTED.controller }, deploymentTxs: Object.fromEntries(deploymentTxs.map(([name, , hash]) => [name, hash])), transactionReconciliation: artifactRows, bytecode, checks, observed: { poolBalance: balance.toString(), merchantRecipient: merchantRecord.recipient, merchantActive: active, merchantTotalReceived: merchantRecord.totalReceived.toString() }, artifactDiscrepancies };
  console.log(JSON.stringify(result, null, 2));
  if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
}

await main();
