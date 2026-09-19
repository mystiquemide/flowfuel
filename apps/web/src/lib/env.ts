import { ORBIO_GATEWAY_BASE_URL, parseEncryptionKey } from "@flowfuel/core";
import { databaseUrl } from "@flowfuel/db";

let cachedKey: Buffer | null = null;

export function databaseUrlFromEnv(): string {
  return databaseUrl();
}

export function orbioBaseUrlFromEnv(): string {
  return process.env.ORBIO_GATEWAY_URL ?? ORBIO_GATEWAY_BASE_URL;
}

export function credentialEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not set");
  }
  cachedKey = parseEncryptionKey(hex);
  return cachedKey;
}

export function robinhoodRpcUrlFromEnv(): string {
  return (
    process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"
  );
}

export function workflowTokenFromEnv(): string {
  const token = process.env.FLOWFUEL_WORKFLOW_TOKEN;
  if (!token) {
    throw new Error("FLOWFUEL_WORKFLOW_TOKEN is not set");
  }
  return token;
}

export function publicProofRunIds(): Set<string> {
  return new Set(
    (process.env.PUBLIC_PROOF_RUN_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
