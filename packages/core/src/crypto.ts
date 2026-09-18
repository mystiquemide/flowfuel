import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { sha256Hex } from "./hash.js";

const VERSION = 1;
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = 1 + IV_LEN + TAG_LEN;

/**
 * Tenant-bound associated data. Changing any field makes the stored
 * ciphertext undecryptable, which is the client-isolation enforcement point.
 */
export interface CredentialAad {
  clientId: string;
  walletAddress: string;
  chainId: number;
  epoch: number;
}

export function buildAad(aad: CredentialAad): Buffer {
  return Buffer.from(
    `${aad.clientId}|${aad.walletAddress.toLowerCase()}|${aad.chainId}|${aad.epoch}`,
    "utf8",
  );
}

export function parseEncryptionKey(hexKey: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 64 hex characters");
  }
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== KEY_LEN) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes");
  }
  return key;
}

/**
 * Encrypted blob layout: [1B version][12B IV][16B GCM tag][ciphertext].
 * A fresh random IV per call means equal credentials never produce equal
 * ciphertext.
 */
export function encryptCredential(
  key: Buffer,
  plaintext: string,
  aad: CredentialAad,
): Buffer {
  if (key.length !== KEY_LEN) {
    throw new Error("encryption key must be 32 bytes");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildAad(aad));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]);
}

export function decryptCredential(
  key: Buffer,
  blob: Buffer,
  aad: CredentialAad,
): Buffer {
  if (key.length !== KEY_LEN || blob.length < HEADER_LEN + 1) {
    throw new Error("credential decryption failed");
  }
  if (blob[0] !== VERSION) {
    throw new Error("credential decryption failed");
  }
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(1 + IV_LEN, HEADER_LEN);
  const ciphertext = blob.subarray(HEADER_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(buildAad(aad));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // One generic failure for every integrity mismatch. Never leak which
    // check failed.
    throw new Error("credential decryption failed");
  }
}

/**
 * Non-reversible fingerprint for audit rows and rotation checks. Never
 * includes key material and cannot reconstruct the credential.
 */
export function credentialFingerprint(plaintext: string): string {
  return sha256Hex(`flowfuel-cred-v1:${plaintext}`);
}

/**
 * Best-effort plaintext hygiene. The decrypted secret lives only inside this
 * callback and the backing buffer is zeroed afterward. A UTF-8 copy may
 * persist in the JS heap, so callers must convert to string only at the last
 * responsible moment and never log it.
 */
export async function withDecryptedCredential<T>(
  key: Buffer,
  blob: Buffer,
  aad: CredentialAad,
  fn: (credential: Buffer) => T | Promise<T>,
): Promise<T> {
  const plaintext = decryptCredential(key, blob, aad);
  try {
    return await fn(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

export function fingerprintsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
