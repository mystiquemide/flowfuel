import { verifyMessage } from "viem";
import type { NoncePurpose } from "@flowfuel/core";

/**
 * Canonical message a client signs to prove wallet control for one nonce.
 * The same string is produced by the nonce endpoint and verified server-side.
 */
export function buildNonceMessage(
  clientId: string,
  purpose: NoncePurpose,
  nonce: string,
): string {
  return `FlowFuel · ${purpose} · client ${clientId} · nonce ${nonce}`;
}

/**
 * Recovers the signer of an EIP-191 personal_sign message and compares it to
 * the expected wallet address.
 */
export async function verifyWalletSignature(input: {
  walletAddress: string;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: input.walletAddress as `0x${string}`,
      message: input.message,
      signature: input.signature,
    });
  } catch {
    return false;
  }
}
