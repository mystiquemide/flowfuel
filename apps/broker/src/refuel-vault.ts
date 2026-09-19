import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  FlowFuelError,
  REFUEL_WEEK_SECONDS,
  ROBINHOOD_CHAIN_ID,
  refuelVaultAbi,
  unitsToDecimal,
} from "@flowfuel/core";

export interface VaultPolicyState {
  enabled: boolean;
  executor: string;
  refillAmount: bigint;
  weeklyCap: bigint;
  maxSlippageBps: number;
}

export interface VaultState {
  reserve: bigint;
  policy: VaultPolicyState;
  weekEpoch: bigint;
  weekSpent: bigint;
}

export interface RefuelChainResult {
  transactionHash: `0x${string}`;
  beneficiary: string;
  usdgSpent: bigint;
  creditOut: bigint;
  activationId: bigint;
  quoteCreditOut: bigint;
  quoteUsdgSpent: bigint;
  minCreditOut: bigint;
  quoteFeeAtoms: bigint;
  quoteFills: bigint;
  quoteReason: number;
  week: bigint;
  weekSpentAfter: bigint;
}

export interface RefuelVaultClient {
  readonly executorAddress: string;
  readState(client: string): Promise<VaultState>;
  refuel(client: string): Promise<RefuelChainResult>;
}

/** A transaction was sent but its final evidence could not be read safely. */
export class RefuelUnknownOutcomeError extends FlowFuelError {
  readonly transactionHash: `0x${string}`;

  constructor(transactionHash: `0x${string}`, message: string) {
    super("REFUEL_FAILED", message, {
      action: "Do not retry until this transaction is checked on Robinhood Chain.",
    });
    this.transactionHash = transactionHash;
  }
}

interface RefuelVaultOptions {
  rpcUrl: string;
  vaultAddress: string;
  executorPrivateKey: `0x${string}`;
}

function chainFor(rpcUrl: string) {
  return defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function tupleValue<T>(value: unknown, index: number, key: string): T {
  if (Array.isArray(value)) return value[index] as T;
  if (typeof value === "object" && value !== null && key in value) {
    return (value as Record<string, unknown>)[key] as T;
  }
  throw new Error(`Vault response omitted ${key}`);
}

function normalizedKey(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("REFUEL_EXECUTOR_PRIVATE_KEY must be a 32-byte hex key");
  }
  return value as `0x${string}`;
}

export function createRefuelVaultClient(options: RefuelVaultOptions): RefuelVaultClient {
  const chain = chainFor(options.rpcUrl);
  const account = privateKeyToAccount(normalizedKey(options.executorPrivateKey));
  const vaultAddress = getAddress(options.vaultAddress);
  const publicClient = createPublicClient({ chain, transport: http(options.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(options.rpcUrl) });

  return {
    executorAddress: account.address,

    async readState(client: string): Promise<VaultState> {
      const address = getAddress(client);
      const [reserveRaw, policyRaw, usageRaw] = await Promise.all([
        publicClient.readContract({
          address: vaultAddress,
          abi: refuelVaultAbi,
          functionName: "reserves",
          args: [address],
        }),
        publicClient.readContract({
          address: vaultAddress,
          abi: refuelVaultAbi,
          functionName: "policies",
          args: [address],
        }),
        publicClient.readContract({
          address: vaultAddress,
          abi: refuelVaultAbi,
          functionName: "currentWeeklyUsage",
          args: [address],
        }),
      ]);
      return {
        reserve: reserveRaw as bigint,
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
    },

    async refuel(client: string): Promise<RefuelChainResult> {
      const address = getAddress(client);
      let hash: `0x${string}`;
      try {
        hash = await walletClient.writeContract({
          account,
          chain,
          address: vaultAddress,
          abi: refuelVaultAbi,
          functionName: "refuel",
          args: [address],
        });
      } catch {
        throw new FlowFuelError(
          "REFUEL_FAILED",
          "The keeper could not submit the refuel transaction",
          { action: "No reserve was deducted. Retry after checking the policy and keeper gas." },
        );
      }

      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash });
      } catch {
        throw new RefuelUnknownOutcomeError(
          hash,
          "The refuel transaction confirmation could not be read",
        );
      }
      if (receipt.status !== "success") {
        throw new FlowFuelError(
          "REFUEL_FAILED",
          "The refuel transaction reverted on Robinhood Chain",
          { action: "No reserve was deducted. Review the onchain policy and quote." },
        );
      }

      const parsed = parseEventLogs({
        abi: refuelVaultAbi,
        eventName: "Refueled",
        logs: receipt.logs,
        strict: false,
      });
      const event = parsed[0];
      if (!event) {
        throw new RefuelUnknownOutcomeError(
          hash,
          "The confirmed refuel transaction omitted its vault evidence",
        );
      }
      const args = event.args as {
        client: `0x${string}`;
        usdgSpent: bigint;
        creditOut: bigint;
        activationId: bigint;
        week: bigint;
        weekSpentAfter: bigint;
        quoteCreditOut: bigint;
        quoteUsdgSpent: bigint;
        minCreditOut: bigint;
        quoteFeeAtoms: bigint;
        quoteFills: bigint;
        quoteReason: number;
      };
      if (getAddress(args.client) !== address) {
        throw new RefuelUnknownOutcomeError(
          hash,
          "The vault event beneficiary did not match the requested client",
        );
      }
      return {
        transactionHash: hash,
        beneficiary: address,
        usdgSpent: args.usdgSpent,
        creditOut: args.creditOut,
        activationId: args.activationId,
        quoteCreditOut: args.quoteCreditOut,
        quoteUsdgSpent: args.quoteUsdgSpent,
        minCreditOut: args.minCreditOut,
        quoteFeeAtoms: args.quoteFeeAtoms,
        quoteFills: args.quoteFills,
        quoteReason: Number(args.quoteReason),
        week: args.week,
        weekSpentAfter: args.weekSpentAfter,
      };
    },
  };
}

export function refuelStateSummary(state: VaultState): {
  reserveUsdg: string;
  weeklySpentUsdg: string;
  refillAmountUsdg: string;
  weeklyCapUsdg: string;
} {
  return {
    reserveUsdg: unitsToDecimal(state.reserve),
    weeklySpentUsdg: unitsToDecimal(state.weekSpent),
    refillAmountUsdg: unitsToDecimal(state.policy.refillAmount),
    weeklyCapUsdg: unitsToDecimal(state.policy.weeklyCap),
  };
}

export { REFUEL_WEEK_SECONDS };
