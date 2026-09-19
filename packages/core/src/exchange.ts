/**
 * Minimal Orbio Exchange (order book) and USDG surface used by FlowFuel.
 * Verified against the protocol integration docs and the live contracts on
 * Robinhood Chain (chain 4663). USDG and CREDIT both use 6 decimals.
 */
export const EXCHANGE_CONTRACT_ADDRESS =
  "0x6951ffd32630b05e06f50062aea801625a58ebc0";

export const USDG_CONTRACT_ADDRESS =
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

export const exchangeAbi = [
  {
    name: "getQuote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { type: "uint256", name: "usdgIn" },
      { type: "uint256", name: "maxFills" },
    ],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint256", name: "creditOut" },
          { type: "uint256", name: "usdgSpent" },
          { type: "uint256", name: "feeAtoms" },
          { type: "uint256", name: "fills" },
          { type: "uint8", name: "reason" },
        ],
      },
    ],
  },
  {
    name: "buyAndActivate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "uint256", name: "usdgIn" },
      { type: "uint256", name: "minCreditOut" },
      { type: "bytes32", name: "beneficiary" },
      { type: "uint256", name: "maxFills" },
    ],
    outputs: [
      { type: "uint256", name: "creditOut" },
      { type: "uint256", name: "usdgSpent" },
      { type: "uint256", name: "activationId" },
    ],
  },
  {
    name: "feeBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    name: "MAX_FILLS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const usdgAbi = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "spender" },
      { type: "uint256", name: "amount" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { type: "address", name: "owner" },
      { type: "address", name: "spender" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Encodes an EOA address as the bytes32 beneficiary buyAndActivate expects. */
export function beneficiaryBytes32(address: string): `0x${string}` {
  return `0x${address.toLowerCase().replace("0x", "").padStart(64, "0")}` as `0x${string}`;
}
