import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  type PublicClient,
} from "viem";
import {
  CREDIT_CONTRACT_ADDRESS,
  EXCHANGE_CONTRACT_ADDRESS,
  FlowFuelError,
  ROBINHOOD_CHAIN_ID,
  USDG_CONTRACT_ADDRESS,
  creditContractAbi,
  decodeActivationLog,
  exchangeAbi,
  refuelVaultAbi,
  usdgAbi,
  unitsToDecimal,
} from "@flowfuel/core";

import { robinhoodRpcUrlFromEnv } from "./env";

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [robinhoodRpcUrlFromEnv()] },
  },
});

let cached: PublicClient | null = null;

export function publicClient(): PublicClient {
  if (!cached) {
    cached = createPublicClient({
      chain: robinhoodChain,
      transport: http(robinhoodRpcUrlFromEnv()),
    });
  }
  return cached;
}

/** Transferable (unactivated) CREDIT held by the wallet, in base units. */
export async function creditBalanceOf(walletAddress: string): Promise<bigint> {
  return (await publicClient().readContract({
    address: getAddress(CREDIT_CONTRACT_ADDRESS),
    abi: creditContractAbi,
    functionName: "balanceOf",
    args: [getAddress(walletAddress)],
  })) as bigint;
}

/** USDG held by the wallet, in base units (6 decimals). */
export async function usdgBalanceOf(walletAddress: string): Promise<bigint> {
  return (await publicClient().readContract({
    address: getAddress(USDG_CONTRACT_ADDRESS),
    abi: usdgAbi,
    functionName: "balanceOf",
    args: [getAddress(walletAddress)],
  })) as bigint;
}

export interface ExchangeQuote {
  creditOut: bigint;
  usdgSpent: bigint;
  feeAtoms: bigint;
  fills: bigint;
  reason: number;
}

/**
 * Quotes a USDG to CREDIT order book fill. The quote does not reserve
 * liquidity, so callers should re-quote immediately before transacting.
 */
export async function exchangeQuoteForUsdg(
  usdgInUnits: bigint,
  maxFills: bigint,
): Promise<ExchangeQuote> {
  const quote = (await publicClient().readContract({
    address: getAddress(EXCHANGE_CONTRACT_ADDRESS),
    abi: exchangeAbi,
    functionName: "getQuote",
    args: [usdgInUnits, maxFills],
  })) as {
    creditOut: bigint;
    usdgSpent: bigint;
    feeAtoms: bigint;
    fills: bigint;
    reason: number;
  };
  return quote;
}

/** Upper bound on order book fills the exchange will walk in one call. */
export async function exchangeMaxFills(): Promise<bigint> {
  return (await publicClient().readContract({
    address: getAddress(EXCHANGE_CONTRACT_ADDRESS),
    abi: exchangeAbi,
    functionName: "MAX_FILLS",
    args: [],
  })) as bigint;
}

export interface RefuelVaultState {
  reserve: bigint;
  policy: {
    enabled: boolean;
    executor: string;
    refillAmount: bigint;
    weeklyCap: bigint;
    maxSlippageBps: number;
  };
  weekEpoch: bigint;
  weekSpent: bigint;
}

function tupleValue<T>(value: unknown, index: number, key: string): T {
  if (Array.isArray(value)) return value[index] as T;
  if (typeof value === "object" && value !== null && key in value) {
    return (value as Record<string, unknown>)[key] as T;
  }
  throw new Error(`Vault response omitted ${key}`);
}

/** Reads the client-owned reserve and policy from the configured vault. */
export async function refuelVaultState(
  vaultAddress: string,
  clientAddress: string,
): Promise<RefuelVaultState> {
  const vault = getAddress(vaultAddress);
  const client = getAddress(clientAddress);
  const [reserve, policyRaw, usageRaw] = await Promise.all([
    publicClient().readContract({
      address: vault,
      abi: refuelVaultAbi,
      functionName: "reserves",
      args: [client],
    }),
    publicClient().readContract({
      address: vault,
      abi: refuelVaultAbi,
      functionName: "policies",
      args: [client],
    }),
    publicClient().readContract({
      address: vault,
      abi: refuelVaultAbi,
      functionName: "currentWeeklyUsage",
      args: [client],
    }),
  ]);
  return {
    reserve: reserve as bigint,
    policy: {
      enabled: tupleValue<boolean>(policyRaw, 0, "enabled"),
      executor: getAddress(tupleValue<string>(policyRaw, 1, "executor")),
      refillAmount: tupleValue<bigint>(policyRaw, 2, "refillAmount"),
      weeklyCap: tupleValue<bigint>(policyRaw, 3, "weeklyCap"),
      maxSlippageBps: Number(tupleValue<bigint | number>(policyRaw, 4, "maxSlippageBps")),
    },
    weekEpoch: tupleValue<bigint>(usageRaw, 0, "epoch"),
    weekSpent: tupleValue<bigint>(usageRaw, 1, "spent"),
  };
}

export function refuelVaultStateForUi(state: RefuelVaultState) {
  return {
    reserveUsdg: unitsToDecimal(state.reserve),
    weeklySpentUsdg: unitsToDecimal(state.weekSpent),
    refillAmountUsdg: unitsToDecimal(state.policy.refillAmount),
    weeklyCapUsdg: unitsToDecimal(state.policy.weeklyCap),
  };
}

export interface VerifiedActivation {
  transactionHash: string;
  activationId: number;
  amountUnits: bigint;
  blockNumber: number;
}

export interface ActivationReceiptLike {
  status: string;
  to: string | null;
  from: string;
  logs: readonly {
    address: string;
    topics: readonly string[];
    data: string;
  }[];
  blockNumber: bigint | number;
}

/**
 * Validates a fetched receipt against the activation rules: success, a CREDIT
 * or Exchange target, the client's wallet as sender, and an Activation event
 * emitted by CREDIT for that wallet. Pure, so the rules are testable without
 * an RPC.
 */
export function verifyActivationReceipt(
  receipt: ActivationReceiptLike,
  expectedWallet: string,
  transactionHash: string,
): VerifiedActivation {
  if (receipt.status !== "success") {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Activation transaction reverted on chain",
    );
  }
  const target = receipt.to ? getAddress(receipt.to) : null;
  if (
    target !== getAddress(CREDIT_CONTRACT_ADDRESS) &&
    target !== getAddress(EXCHANGE_CONTRACT_ADDRESS)
  ) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Transaction did not call the CREDIT or Exchange contract",
    );
  }
  if (getAddress(receipt.from) !== getAddress(expectedWallet)) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Activation was not sent by this client's wallet",
    );
  }

  const expected = getAddress(expectedWallet).toLowerCase();
  // The Activated event's beneficiary is who the balance credits: the wallet
  // for a direct activate(), and still the wallet for buyAndActivate() where
  // `from` is the Exchange contract. Binding on beneficiary covers both.
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(CREDIT_CONTRACT_ADDRESS)) {
      continue;
    }
    const decoded = decodeActivationLog({
      topics: log.topics as readonly string[],
      data: log.data,
    });
    if (!decoded) continue;
    if (getAddress(decoded.beneficiary).toLowerCase() === expected) {
      return {
        transactionHash,
        activationId: decoded.activationId,
        amountUnits: decoded.amount,
        blockNumber: Number(receipt.blockNumber),
      };
    }
  }

  throw new FlowFuelError(
    "VALIDATION_FAILED",
    "No Activation event for this client's wallet in the transaction",
  );
}

/**
 * Verifies an activation transaction on Robinhood Chain. The chain is the
 * authority here: the receipt must be successful, target the CREDIT or
 * Exchange contract (buyAndActivate emits the Activation event from CREDIT
 * while targeting the Exchange), come from the client's wallet, and carry an
 * Activation event for that same wallet. Anything else is rejected, so no
 * signature is required to record an activation.
 */
export async function verifyActivationTransaction(
  transactionHash: string,
  expectedWallet: string,
): Promise<VerifiedActivation> {
  const client = publicClient();
  const hash = transactionHash as `0x${string}`;

  const receipt = await client
    .getTransactionReceipt({ hash })
    .catch(() => null);
  if (!receipt) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Transaction not found on Robinhood Chain",
      { action: "Wait for confirmation, then submit the hash again." },
    );
  }
  return verifyActivationReceipt(receipt, expectedWallet, transactionHash);
}
