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
  EXCHANGE_CONTRACT_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  USDG_CONTRACT_ADDRESS,
  beneficiaryBytes32,
  creditContractAbi,
  exchangeAbi,
  refuelVaultAbi,
  usdgAbi,
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
  if (!addr) throw new Error("The wallet didn't share an address. Approve the connection request and try again.");
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

/**
 * Approves the Exchange contract to spend exactly `amountUnits` of USDG from
 * the connected wallet. The buyAndActivate budget (including exchange fees)
 * comes out of this allowance, so approving exactly the intended input is the
 * correct bound. Waits for the receipt and returns the transaction hash.
 */
export async function approveUsdg(
  account: `0x${string}`,
  amountUnits: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const client = walletClientFor(eth);
  const hash = await client.writeContract({
    account,
    chain: null,
    address: getAddress(USDG_CONTRACT_ADDRESS),
    abi: usdgAbi,
    functionName: "approve",
    args: [getAddress(EXCHANGE_CONTRACT_ADDRESS), amountUnits],
  });
  const publicClient = createPublicClient({
    transport: http("https://rpc.mainnet.chain.robinhood.com"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("USDG approval transaction reverted on chain");
  }
  return hash;
}

async function waitForWalletReceipt(hash: `0x${string}`): Promise<void> {
  const publicClient = createPublicClient({
    transport: http("https://rpc.mainnet.chain.robinhood.com"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Wallet transaction reverted on chain");
}

/** Approves exactly one client deposit for the FlowFuel vault. */
export async function approveUsdgForVault(
  account: `0x${string}`,
  vaultAddress: string,
  amountUnits: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hash = await walletClientFor(eth).writeContract({
    account,
    chain: null,
    address: getAddress(USDG_CONTRACT_ADDRESS),
    abi: usdgAbi,
    functionName: "approve",
    args: [getAddress(vaultAddress), amountUnits],
  });
  await waitForWalletReceipt(hash);
  return hash;
}

export async function depositUsdg(
  account: `0x${string}`,
  vaultAddress: string,
  amountUnits: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hash = await walletClientFor(eth).writeContract({
    account,
    chain: null,
    address: getAddress(vaultAddress),
    abi: refuelVaultAbi,
    functionName: "deposit",
    args: [amountUnits],
  });
  await waitForWalletReceipt(hash);
  return hash;
}

export async function withdrawUsdg(
  account: `0x${string}`,
  vaultAddress: string,
  amountUnits: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hash = await walletClientFor(eth).writeContract({
    account,
    chain: null,
    address: getAddress(vaultAddress),
    abi: refuelVaultAbi,
    functionName: "withdraw",
    args: [amountUnits],
  });
  await waitForWalletReceipt(hash);
  return hash;
}

export async function setRefuelPolicy(
  account: `0x${string}`,
  vaultAddress: string,
  executor: `0x${string}`,
  refillAmount: bigint,
  weeklyCap: bigint,
  maxSlippageBps: number,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hash = await walletClientFor(eth).writeContract({
    account,
    chain: null,
    address: getAddress(vaultAddress),
    abi: refuelVaultAbi,
    functionName: "setPolicy",
    args: [getAddress(executor), refillAmount, weeklyCap, maxSlippageBps],
  });
  await waitForWalletReceipt(hash);
  return hash;
}

export async function disableRefuelPolicy(
  account: `0x${string}`,
  vaultAddress: string,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const hash = await walletClientFor(eth).writeContract({
    account,
    chain: null,
    address: getAddress(vaultAddress),
    abi: refuelVaultAbi,
    functionName: "disablePolicy",
    args: [],
  });
  await waitForWalletReceipt(hash);
  return hash;
}

/**
 * Calls buyAndActivate(usdgIn, minCreditOut, beneficiary, maxFills) on the
 * Exchange from the connected wallet: fills the order book with USDG and
 * activates the bought CREDIT into the wallet's own Orbio balance in one
 * transaction. Waits for the receipt and returns the transaction hash.
 */
export async function buyAndActivateCredit(
  account: `0x${string}`,
  usdgInUnits: bigint,
  minCreditOutUnits: bigint,
  maxFills: bigint,
): Promise<`0x${string}`> {
  const eth = injectedProvider();
  if (!eth) throw new Error("No wallet provider found");
  const client = walletClientFor(eth);
  const hash = await client.writeContract({
    account,
    chain: null,
    address: getAddress(EXCHANGE_CONTRACT_ADDRESS),
    abi: exchangeAbi,
    functionName: "buyAndActivate",
    args: [usdgInUnits, minCreditOutUnits, beneficiaryBytes32(account), maxFills],
  });
  const publicClient = createPublicClient({
    transport: http("https://rpc.mainnet.chain.robinhood.com"),
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("buyAndActivate transaction reverted on chain");
  }
  return hash;
}

let cachedPublicClient: ReturnType<typeof createPublicClient> | null = null;

function robinhoodPublicClient() {
  if (!cachedPublicClient) {
    cachedPublicClient = createPublicClient({
      transport: http("https://rpc.mainnet.chain.robinhood.com"),
    });
  }
  return cachedPublicClient;
}

export interface UsdgQuote {
  creditOut: bigint;
  usdgSpent: bigint;
  feeAtoms: bigint;
  fills: bigint;
  reason: number;
}

/**
 * Quotes the exchange order book for a USDG spend. Read-only, runs in the
 * browser so the quote can refresh as the client edits the amount. Quotes do
 * not reserve liquidity; the submit path re-quotes before transacting.
 */
export async function quoteUsdgToCredit(
  usdgInUnits: bigint,
  maxFills: bigint,
): Promise<UsdgQuote> {
  const quote = (await robinhoodPublicClient().readContract({
    address: getAddress(EXCHANGE_CONTRACT_ADDRESS),
    abi: exchangeAbi,
    functionName: "getQuote",
    args: [usdgInUnits, maxFills],
  })) as UsdgQuote;
  return quote;
}

/** USDG the Exchange contract can already spend for this wallet. */
export async function usdgAllowanceForExchange(
  owner: `0x${string}`,
): Promise<bigint> {
  return (await robinhoodPublicClient().readContract({
    address: getAddress(USDG_CONTRACT_ADDRESS),
    abi: usdgAbi,
    functionName: "allowance",
    args: [getAddress(owner), getAddress(EXCHANGE_CONTRACT_ADDRESS)],
  })) as bigint;
}

/** Order book fill bound enforced by the exchange. */
export async function exchangeMaxFillsOnchain(): Promise<bigint> {
  return (await robinhoodPublicClient().readContract({
    address: getAddress(EXCHANGE_CONTRACT_ADDRESS),
    abi: exchangeAbi,
    functionName: "MAX_FILLS",
    args: [],
  })) as bigint;
}

/** Reads an API error body the same way the connect flow does. */
export async function readApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.action ?? body.code ?? `Something went wrong (HTTP ${res.status}). Try again.`;
  } catch {
    return `Something went wrong (HTTP ${res.status}). Try again.`;
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

/** Proves wallet ownership and receives the short-lived client session cookie. */
export async function authenticateClient(
  clientId: string,
  account: `0x${string}`,
): Promise<void> {
  const { nonce, message } = await issueNonce(clientId, "connect");
  const signature = await signNonceMessage(account, message);
  const res = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientId,
      nonce,
      walletAddress: account,
      signature,
    }),
  });
  if (!res.ok) throw new Error(await readApiError(res));
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
