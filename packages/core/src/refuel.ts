import { z } from "zod";
import { decimalStringSchema, transactionHashSchema, walletAddressSchema } from "./schemas";

export const USDG_DECIMALS = 6;
export const REFUEL_MAX_SLIPPAGE_BPS = 1_000;
export const REFUEL_WEEK_SECONDS = 604_800;

/** ABI for the deployed FlowFuelRefuelVault. */
export const refuelVaultAbi = [
  {
    name: "USDG",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "EXCHANGE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    name: "reserves",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address", name: "client" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "policies",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address", name: "client" }],
    outputs: [
      { type: "bool", name: "enabled" },
      { type: "address", name: "executor" },
      { type: "uint256", name: "refillAmount" },
      { type: "uint256", name: "weeklyCap" },
      { type: "uint16", name: "maxSlippageBps" },
    ],
  },
  {
    name: "currentWeeklyUsage",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "address", name: "client" }],
    outputs: [
      { type: "uint256", name: "epoch" },
      { type: "uint256", name: "spent" },
    ],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "amount" }],
    outputs: [],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256", name: "amount" }],
    outputs: [],
  },
  {
    name: "setPolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "executor" },
      { type: "uint256", name: "refillAmount" },
      { type: "uint256", name: "weeklyCap" },
      { type: "uint16", name: "maxSlippageBps" },
    ],
    outputs: [],
  },
  {
    name: "disablePolicy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "refuel",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "client" }],
    outputs: [
      { type: "uint256", name: "creditOut" },
      { type: "uint256", name: "usdgSpent" },
      { type: "uint256", name: "activationId" },
    ],
  },
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "client", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Withdrawn",
    type: "event",
    inputs: [
      { name: "client", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "PolicyUpdated",
    type: "event",
    inputs: [
      { name: "client", type: "address", indexed: true },
      { name: "enabled", type: "bool", indexed: false },
      { name: "executor", type: "address", indexed: true },
      { name: "refillAmount", type: "uint256", indexed: false },
      { name: "weeklyCap", type: "uint256", indexed: false },
      { name: "maxSlippageBps", type: "uint16", indexed: false },
    ],
  },
  {
    name: "Refueled",
    type: "event",
    inputs: [
      { name: "client", type: "address", indexed: true },
      { name: "usdgSpent", type: "uint256", indexed: false },
      { name: "creditOut", type: "uint256", indexed: false },
      { name: "activationId", type: "uint256", indexed: false },
      { name: "week", type: "uint256", indexed: true },
      { name: "weekSpentAfter", type: "uint256", indexed: false },
      { name: "quoteCreditOut", type: "uint256", indexed: false },
      { name: "quoteUsdgSpent", type: "uint256", indexed: false },
      { name: "minCreditOut", type: "uint256", indexed: false },
      { name: "quoteFeeAtoms", type: "uint256", indexed: false },
      { name: "quoteFills", type: "uint256", indexed: false },
      { name: "quoteReason", type: "uint8", indexed: false },
    ],
  },
] as const;

export const refuelPolicyThresholdSchema = decimalStringSchema.refine(
  (value) => Number(value) >= 0 && Number.isFinite(Number(value)),
  "Invalid refuel threshold",
);

export const refuelPolicyThresholdRequestSchema = z.strictObject({
  thresholdUsd: refuelPolicyThresholdSchema,
});
export type RefuelPolicyThresholdRequest = z.infer<
  typeof refuelPolicyThresholdRequestSchema
>;

export const refuelExecutionStatusSchema = z.enum([
  "requested",
  "submitted",
  "confirmed",
  "indexing",
  "indexed",
  "failed",
  "blocked_no_reserve",
  "blocked_weekly_cap",
  "blocked_policy",
]);
export type RefuelExecutionStatus = z.infer<typeof refuelExecutionStatusSchema>;

export const refuelEvidenceSchema = z.strictObject({
  transactionHash: transactionHashSchema.nullable(),
  beneficiary: walletAddressSchema,
  usdgSpent: decimalStringSchema.nullable(),
  creditOut: decimalStringSchema.nullable(),
  activationId: z.string().regex(/^\d+$/).nullable(),
  status: refuelExecutionStatusSchema,
  errorCode: z.string().max(64).nullable().default(null),
});
export type RefuelEvidence = z.infer<typeof refuelEvidenceSchema>;

/** Parses a non-negative decimal into fixed units without floating point math. */
export function decimalToUnits(value: string, decimals = USDG_DECIMALS): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal amount");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error("Too many decimal places");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

export function unitsToDecimal(value: bigint, decimals = USDG_DECIMALS): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}
