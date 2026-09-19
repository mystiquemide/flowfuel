import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  type PublicClient,
} from "viem";
import {
  CREDIT_CONTRACT_ADDRESS,
  FlowFuelError,
  ROBINHOOD_CHAIN_ID,
  creditContractAbi,
  decodeActivationLog,
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

export interface VerifiedActivation {
  transactionHash: string;
  activationId: number;
  amountUnits: bigint;
  blockNumber: number;
}

/**
 * Verifies an activate() transaction on Robinhood Chain. The chain is the
 * authority here: the receipt must be successful, target the CREDIT contract,
 * come from the client's wallet, and carry an Activation event for that same
 * wallet. Anything else is rejected, so no signature is required to record
 * an activation.
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
  if (receipt.status !== "success") {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Activation transaction reverted on chain",
    );
  }
  if (
    !receipt.to ||
    getAddress(receipt.to) !== getAddress(CREDIT_CONTRACT_ADDRESS)
  ) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Transaction did not call the CREDIT contract",
    );
  }
  if (getAddress(receipt.from) !== getAddress(expectedWallet)) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Activation was not sent by this client's wallet",
    );
  }

  const expected = getAddress(expectedWallet).toLowerCase();
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(CREDIT_CONTRACT_ADDRESS)) {
      continue;
    }
    const decoded = decodeActivationLog({
      topics: log.topics as readonly string[],
      data: log.data,
    });
    if (
      decoded &&
      getAddress(decoded.account).toLowerCase() === expected
    ) {
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
