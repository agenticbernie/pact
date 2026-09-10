export const PACT_ABI = {
  "controller": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "pool_",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "merchant_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "NATIVE_ASSET",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "POLICY_VERSION",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint32",
          "internalType": "uint32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "activateCard",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "agentActiveCard",
      "inputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "applyVerifiedCreditForAgent",
      "inputs": [
        {
          "name": "agent",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "evidenceId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "ascAuthority",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "availableCredit",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "cardAllowlist",
      "inputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "cards",
      "inputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "agent",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "asset",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "ownerConfiguredCap",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "verifiedCredit",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "verifiedCreditExpiry",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "spent",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "perTransactionLimit",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "status",
          "type": "uint8",
          "internalType": "enum CardStatus"
        },
        {
          "name": "policyVersion",
          "type": "uint32",
          "internalType": "uint32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "closeCard",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "createCard",
      "inputs": [
        {
          "name": "agent",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "ownerConfiguredCap",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "perTransactionLimit",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "allowlistedMerchants",
          "type": "bytes32[]",
          "internalType": "bytes32[]"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "isCardExpired",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "merchant",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IMerchantSimulator"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "nextCardId",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "pay",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "asset",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "deadline",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "intentHash",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "pool",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IPactCreditPool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "preflightPay",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "asset",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "deadline",
          "type": "uint64",
          "internalType": "uint64"
        }
      ],
      "outputs": [
        {
          "name": "allowed",
          "type": "bool",
          "internalType": "bool"
        },
        {
          "name": "reason",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "renounceOwnership",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "resumeCard",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setAscAuthority",
      "inputs": [
        {
          "name": "ascAuthority_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "suspendCard",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferOwnership",
      "inputs": [
        {
          "name": "newOwner",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "updatePolicy",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "ownerConfiguredCap",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "perTransactionLimit",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "internalType": "uint64"
        },
        {
          "name": "allowlistedMerchants",
          "type": "bytes32[]",
          "internalType": "bytes32[]"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "usedEvidence",
      "inputs": [
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "usedNonces",
      "inputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "event",
      "name": "CardActivated",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CardClosed",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CardCreated",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "owner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "agent",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "ownerConfiguredCap",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "perTransactionLimit",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CardResumed",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CardSuspended",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "CreditVerified",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "agent",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "evidenceId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OwnershipTransferred",
      "inputs": [
        {
          "name": "previousOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "newOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "PaymentSettled",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "merchantId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "nonce",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "intentHash",
          "type": "bytes32",
          "indexed": false,
          "internalType": "bytes32"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "PolicyUpdated",
      "inputs": [
        {
          "name": "cardId",
          "type": "uint256",
          "indexed": true,
          "internalType": "uint256"
        },
        {
          "name": "ownerConfiguredCap",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "perTransactionLimit",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "expiresAt",
          "type": "uint64",
          "indexed": false,
          "internalType": "uint64"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AuthorityAlreadySet",
      "inputs": []
    },
    {
      "type": "error",
      "name": "CardExpired",
      "inputs": []
    },
    {
      "type": "error",
      "name": "CreditExceeded",
      "inputs": []
    },
    {
      "type": "error",
      "name": "EvidenceAlreadyApplied",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidAsset",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidCardStatus",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidPolicy",
      "inputs": []
    },
    {
      "type": "error",
      "name": "MerchantInactive",
      "inputs": []
    },
    {
      "type": "error",
      "name": "MerchantNotAllowed",
      "inputs": []
    },
    {
      "type": "error",
      "name": "NonceAlreadyUsed",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OwnableInvalidOwner",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "OwnableUnauthorizedAccount",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "PaymentDeadlineExpired",
      "inputs": []
    },
    {
      "type": "error",
      "name": "PoolBalanceLow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "RenounceDisabled",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnauthorizedCaller",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnknownAgent",
      "inputs": []
    }
  ],
  "pool": [
    {
      "type": "constructor",
      "inputs": [
        {
          "name": "merchant_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "availableBalance",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "controller",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "fundPool",
      "inputs": [],
      "outputs": [],
      "stateMutability": "payable"
    },
    {
      "type": "function",
      "name": "merchant",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract IMerchantSimulator"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "renounceOwnership",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setController",
      "inputs": [
        {
          "name": "controller_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "settleNative",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferOwnership",
      "inputs": [
        {
          "name": "newOwner",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "withdraw",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "internalType": "address payable"
        },
        {
          "name": "amount",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "OwnershipTransferred",
      "inputs": [
        {
          "name": "previousOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "newOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "PoolFunded",
      "inputs": [
        {
          "name": "from",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "PoolWithdrawn",
      "inputs": [
        {
          "name": "to",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AuthorityAlreadySet",
      "inputs": []
    },
    {
      "type": "error",
      "name": "FailedCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InsufficientBalance",
      "inputs": [
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidPolicy",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OwnableInvalidOwner",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "OwnableUnauthorizedAccount",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "PoolBalanceLow",
      "inputs": []
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "RenounceDisabled",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnauthorizedCaller",
      "inputs": []
    }
  ],
  "merchantSimulator": [
    {
      "type": "constructor",
      "inputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "isMerchantActive",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "merchants",
      "inputs": [
        {
          "name": "",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [
        {
          "name": "recipient",
          "type": "address",
          "internalType": "address payable"
        },
        {
          "name": "active",
          "type": "bool",
          "internalType": "bool"
        },
        {
          "name": "totalReceived",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "owner",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "pool",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "address"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "receivePayment",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        }
      ],
      "outputs": [],
      "stateMutability": "payable"
    },
    {
      "type": "function",
      "name": "registerMerchant",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "recipient",
          "type": "address",
          "internalType": "address payable"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "renounceOwnership",
      "inputs": [],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setMerchantActive",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "internalType": "bytes32"
        },
        {
          "name": "active",
          "type": "bool",
          "internalType": "bool"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "setPool",
      "inputs": [
        {
          "name": "pool_",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "function",
      "name": "transferOwnership",
      "inputs": [
        {
          "name": "newOwner",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "MerchantPaymentReceived",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "amount",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        },
        {
          "name": "totalReceived",
          "type": "uint256",
          "indexed": false,
          "internalType": "uint256"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "MerchantRegistered",
      "inputs": [
        {
          "name": "merchantId",
          "type": "bytes32",
          "indexed": true,
          "internalType": "bytes32"
        },
        {
          "name": "recipient",
          "type": "address",
          "indexed": false,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "event",
      "name": "OwnershipTransferred",
      "inputs": [
        {
          "name": "previousOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        },
        {
          "name": "newOwner",
          "type": "address",
          "indexed": true,
          "internalType": "address"
        }
      ],
      "anonymous": false
    },
    {
      "type": "error",
      "name": "AuthorityAlreadySet",
      "inputs": []
    },
    {
      "type": "error",
      "name": "FailedCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InsufficientBalance",
      "inputs": [
        {
          "name": "balance",
          "type": "uint256",
          "internalType": "uint256"
        },
        {
          "name": "needed",
          "type": "uint256",
          "internalType": "uint256"
        }
      ]
    },
    {
      "type": "error",
      "name": "InvalidAmount",
      "inputs": []
    },
    {
      "type": "error",
      "name": "InvalidPolicy",
      "inputs": []
    },
    {
      "type": "error",
      "name": "MerchantInactive",
      "inputs": []
    },
    {
      "type": "error",
      "name": "MerchantNotAllowed",
      "inputs": []
    },
    {
      "type": "error",
      "name": "OwnableInvalidOwner",
      "inputs": [
        {
          "name": "owner",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "OwnableUnauthorizedAccount",
      "inputs": [
        {
          "name": "account",
          "type": "address",
          "internalType": "address"
        }
      ]
    },
    {
      "type": "error",
      "name": "ReentrancyGuardReentrantCall",
      "inputs": []
    },
    {
      "type": "error",
      "name": "RenounceDisabled",
      "inputs": []
    },
    {
      "type": "error",
      "name": "UnauthorizedCaller",
      "inputs": []
    }
  ]
} as const;
