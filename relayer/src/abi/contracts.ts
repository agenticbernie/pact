/**
 * Pact Protocol — Viem Contract ABIs (PactEscrow & MockUSDC)
 * Matches deployed Solidity 0.8.20 contracts in /contracts/src
 */

export const PACT_ESCROW_ABI = [
  {
    type: "function",
    name: "calculateFee",
    stateMutability: "pure",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "priority", type: "uint8" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "createIntent",
    stateMutability: "payable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "targetChainId", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "priority", type: "uint8" },
      { name: "hashLock", type: "bytes32" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "intentId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "claimEscrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "intentId", type: "bytes32" },
      { name: "secret", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getIntent",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "tokenIn", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "targetChainId", type: "uint256" },
          { name: "receiver", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "priority", type: "uint8" },
          { name: "hashLock", type: "bytes32" },
          { name: "deadline", type: "uint256" },
          { name: "feePaid", type: "uint256" },
          { name: "isFulfilled", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "isRefunded",
    stateMutability: "view",
    inputs: [{ name: "intentId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "PaymentIntentCreated",
    inputs: [
      { name: "intentId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "targetChainId", type: "uint256", indexed: true },
      { name: "receiver", type: "address", indexed: false },
      { name: "tokenIn", type: "address", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "feePaid", type: "uint256", indexed: false },
      { name: "priority", type: "uint8", indexed: false },
      { name: "hashLock", type: "bytes32", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentSettled",
    inputs: [
      { name: "intentId", type: "bytes32", indexed: true },
      { name: "relayer", type: "address", indexed: true },
      { name: "secret", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PaymentRefunded",
    inputs: [
      { name: "intentId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
  },
] as const;

export const MOCK_USDC_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const PACT_BATCH_DISPATCHER_ABI = [
  {
    type: "function",
    name: "batchTransfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "intentIds", type: "bytes32[]" },
      { name: "receivers", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [],
  },
] as const;
