import { CREDIT_CONTRACT_ADDRESS } from "./constants";

/**
 * Minimal CREDIT contract surface used by FlowFuel. Verified against the live
 * contract on Robinhood Chain (chain 4663): CREDIT is an ERC-20 with 6
 * decimals, and `activate(uint256)` burns the amount while emitting the
 * Activation event whose first indexed topic is the activation ID.
 */
export const creditContractAbi = [
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
    name: "activate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    name: "Activated",
    type: "event",
    inputs: [
      { name: "activationId", type: "uint256", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "beneficiary", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;

export const CREDIT_DECIMALS = 6;

/** Converts a USD decimal amount to CREDIT base units (6 decimals). */
export function usdToCreditUnits(amountUsd: number): bigint {
  return BigInt(Math.round(amountUsd * 10 ** CREDIT_DECIMALS));
}

export interface ActivationVerification {
  contractAddress: string;
  from: string;
  activationId: number | null;
  amountUnits: bigint;
  blockNumber: number;
}

/**
 * Decodes an `Activated` event log. The event is anonymous-free: topic[0] is
 * the event signature, topic[1] the activation ID, topic[2] the address that
 * invoked the activation (`from`, the Exchange contract for buyAndActivate),
 * topic[3] the beneficiary as bytes32 (who the balance credits), and data
 * carries the amount.
 */
export const ACTIVATION_EVENT_SIGNATURE =
  "0x3a293632e41f6556f85d186d28ae95749534c2c9422cec0e1075886560ca7147";

export function decodeActivationLog(log: {
  topics: readonly string[];
  data: string;
}): { activationId: number; account: string; beneficiary: string; amount: bigint } | null {
  if (log.topics[0]?.toLowerCase() !== ACTIVATION_EVENT_SIGNATURE) return null;
  if (log.topics.length < 4) return null;
  const activationId = Number(BigInt(log.topics[1]!));
  const account = `0x${log.topics[2]!.slice(-40)}`;
  const beneficiary = `0x${log.topics[3]!.slice(-40)}`;
  const amount = BigInt(log.data);
  return { activationId, account, beneficiary, amount };
}

export { CREDIT_CONTRACT_ADDRESS };
