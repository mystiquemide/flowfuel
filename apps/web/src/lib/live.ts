import { withDecryptedCredential, type CredentialAad } from "@flowfuel/core";
import type { OrbioClient } from "@flowfuel/broker";
import type { ClientRow } from "@flowfuel/db";

export interface LiveBalance {
  /** Null when the client has no usable credential or the gateway rejects it. */
  available: string | null;
  /** Gateway lifetime consumption on this credential. Null when unavailable. */
  used: string | null;
  /** Why the balance could not be read. Omitted on success. */
  reason?: "no_credential" | "gateway_rejected";
  readAt: string;
}

/**
 * Reads the client's activated Orbio balance straight from the gateway using
 * the stored credential. The plaintext exists only inside
 * withDecryptedCredential for the duration of the /key call.
 */
export async function liveActivatedBalance(input: {
  orbio: Pick<OrbioClient, "getKeyInfo">;
  encryptionKey: Buffer;
  client: ClientRow;
  credential: {
    walletAddress: string;
    epoch: number;
    ciphertext: string;
    verifiedAt: Date | null;
  } | null;
}): Promise<LiveBalance> {
  const readAt = new Date().toISOString();
  const { credential } = input;
  if (!credential) {
    return { available: null, used: null, reason: "no_credential", readAt };
  }
  const aad: CredentialAad = {
    clientId: input.client.id,
    walletAddress: credential.walletAddress,
    chainId: input.client.chainId,
    epoch: credential.epoch,
  };
  try {
    const info = await withDecryptedCredential(
      input.encryptionKey,
      Buffer.from(credential.ciphertext, "base64"),
      aad,
      async (blob) =>
        input.orbio.getKeyInfo(blob.toString("utf8"), {
          credentialPreviouslyVerified: credential.verifiedAt != null,
        }),
    );
    return { available: info.balance.available, used: info.balance.used, readAt };
  } catch {
    return { available: null, used: null, reason: "gateway_rejected", readAt };
  }
}
