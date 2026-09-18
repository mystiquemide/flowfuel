function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/**
 * Derives the Orbio API credential from a wallet signature over
 * `orbioKeyMessage(chainId, epoch)`. Runs in the browser and in Node.
 * Format: sk-orb-<epoch>-<base64 signature bytes>.
 */
export function deriveOrbioCredential(
  signatureHex: string,
  epoch: number,
): string {
  return `sk-orb-${epoch}-${bytesToBase64(hexToBytes(signatureHex))}`;
}

/**
 * Reads the epoch embedded in a credential's prefix. Returns null when the
 * shape is not a wallet-derived Orbio credential.
 */
export function orbioCredentialEpoch(credential: string): number | null {
  const match = /^sk-orb-(\d+)-/.exec(credential);
  return match ? Number.parseInt(match[1]!, 10) : null;
}
