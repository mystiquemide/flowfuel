"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type WalletClient,
} from "viem";
import {
  CREDIT_CONTRACT_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  creditContractAbi,
} from "@flowfuel/core";

export interface EthereumProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export function injectedProvider(): EthereumProvider | null {
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

export function walletClientFor(eth: EthereumProvider): WalletClient {
  return createWalletClient({ transport: custom(eth as never) });
}

export async function connectInjected(): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) {
    throw new Error("No wallet provider found. Install a browser wallet and reload.");
  }
  const client = walletClientFor(eth);
  const [addr] = await client.requestAddresses();
  if (!addr) throw new Error("Wallet returned no address");
  return getAddress(addr);
}

export async function injectedChainId(): Promise<number> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hex = (await eth.request({ method: "eth_chainId" })) as string;
  return Number(BigInt(hex));
}

export async function requestRobinhoodChain(): Promise<void> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${ROBINHOOD_CHAIN_ID.toString(16)}` }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: `0x${ROBINHOOD_CHAIN_ID.toString(16)}`,
          chainName: "Robinhood Chain",
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: ["https://robin.etherscan.io"],
        },
      ],
    });
  }
}

/**
 * Sends activate(units) to the CREDIT contract from the connected wallet and
 * waits for the receipt. Returns the transaction hash once confirmed.
 */
export async function activateCredit(
  account: `0x${string}`,
  amountUnits: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const client = walletClientFor(eth);
  const hash = await client.writeContract({
    account,
    chain: null,
    address: getAddress(CREDIT_CONTRACT_ADDRESS),
    abi: creditContractAbi,
    functionName: "activate",
    args: [amountUnits],
  });
  const publicClient = createPublicClient({
    transport: http("https://rpc.mainnet.chain.robinhood.com"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("Activation transaction reverted on chain");
  }
  return hash;
}

/** Reads an API error body the same way the connect flow does. */
export async function readApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.action ?? body.code ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export interface IssuedNonce {
  nonce: string;
  message: string;
}

export async function issueNonce(
  clientId: string,
  purpose: string,
): Promise<IssuedNonce> {
  const res = await fetch("/api/auth/nonce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId, purpose }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function signNonceMessage(
  account: `0x${string}`,
  message: string,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const client = walletClientFor(eth);
  return client.signMessage({ account, message });
}

/** Converts a decimal USD string to CREDIT base units without float drift. */
export function usdToUnits(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return BigInt(-1);
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * BigInt(1_000_000) + BigInt(padded);
}

export function unitsToUsd(units: bigint): string {
  const whole = units / BigInt(1_000_000);
  const frac = (units % BigInt(1_000_000)).toString().padStart(6, "0");
  return `${whole}.${frac}`;
}

export function truncateMiddle(str: string, lead = 10, tail = 6): string {
  if (str.length <= lead + tail + 3) return str;
  return `${str.slice(0, lead)}...${str.slice(-tail)}`;
}
