export const ROBINHOOD_CHAIN_ID = 4663;

export const CREDIT_CONTRACT_ADDRESS =
  "0xe33322da1380e61e5ae5dfb21e7f62924c73004c";

export const ORBIO_GATEWAY_BASE_URL = "https://www.orbio.so/api/v1";

export const ROBINHOOD_EXPLORER_BASE_URL = "https://robin.etherscan.io";

export function explorerTxUrl(transactionHash: string): string {
  return `${ROBINHOOD_EXPLORER_BASE_URL}/tx/${transactionHash}`;
}

export function orbioKeyMessage(chainId: number, epoch: number): string {
  return `Orbio API key · chain ${chainId} · epoch ${epoch}`;
}
