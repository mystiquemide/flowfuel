import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  buildAad,
  credentialFingerprint,
  decryptCredential,
  encryptCredential,
  fingerprintsEqual,
  parseEncryptionKey,
  withDecryptedCredential,
  type CredentialAad,
} from "../src/index.js";

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);

const AAD: CredentialAad = {
  clientId: "3f6a7b2c-1111-4a2b-8c3d-9e4f5a6b7c8d",
  walletAddress: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
  chainId: 4663,
  epoch: 0,
};

const SECRET = `sk-orb-0-${"QUJD".repeat(20)}`;

describe("encryptCredential/decryptCredential", () => {
  it("round-trips a credential", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    const out = decryptCredential(KEY, blob, AAD);
    expect(out.toString("utf8")).toBe(SECRET);
  });

  it("produces different ciphertext for equal credentials (unique IV)", () => {
    const a = encryptCredential(KEY, SECRET, AAD);
    const b = encryptCredential(KEY, SECRET, AAD);
    expect(a.equals(b)).toBe(false);
    expect(decryptCredential(KEY, a, AAD).toString()).toBe(SECRET);
    expect(decryptCredential(KEY, b, AAD).toString()).toBe(SECRET);
  });

  it("fails with the wrong key", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    expect(() => decryptCredential(OTHER_KEY, blob, AAD)).toThrow(
      "credential decryption failed",
    );
  });

  it("fails when the IV is tampered", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    const tampered = Buffer.from(blob);
    tampered[1] = tampered[1]! ^ 0xff;
    expect(() => decryptCredential(KEY, tampered, AAD)).toThrow(
      "credential decryption failed",
    );
  });

  it("fails when the tag is tampered", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    const tampered = Buffer.from(blob);
    tampered[13] = tampered[13]! ^ 0xff;
    expect(() => decryptCredential(KEY, tampered, AAD)).toThrow(
      "credential decryption failed",
    );
  });

  it("fails when ciphertext is tampered", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    expect(() => decryptCredential(KEY, tampered, AAD)).toThrow(
      "credential decryption failed",
    );
  });

  it.each([
    ["client id", { ...AAD, clientId: "9c8b7a6d-2222-4b3c-9d4e-1f2a3b4c5d6e" }],
    ["wallet", { ...AAD, walletAddress: "0xA0234103102008dCf310182a829Cd18408373CEC" }],
    ["chain", { ...AAD, chainId: 1 }],
    ["epoch", { ...AAD, epoch: 1 }],
  ])("fails under a different %s", (_label, aad) => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    expect(() => decryptCredential(KEY, blob, aad)).toThrow(
      "credential decryption failed",
    );
  });

  it("wallet AAD is case-insensitive", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    const out = decryptCredential(KEY, blob, {
      ...AAD,
      walletAddress: AAD.walletAddress.toLowerCase(),
    });
    expect(out.toString()).toBe(SECRET);
  });

  it("rejects a truncated blob", () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    expect(() => decryptCredential(KEY, blob.subarray(0, 10), AAD)).toThrow(
      "credential decryption failed",
    );
  });
});

describe("buildAad", () => {
  it("is deterministic and binds all fields", () => {
    expect(buildAad(AAD).toString()).toBe(
      `${AAD.clientId}|${AAD.walletAddress.toLowerCase()}|4663|0`,
    );
  });
});

describe("parseEncryptionKey", () => {
  it("parses 64 hex chars into 32 bytes", () => {
    const key = parseEncryptionKey("ab".repeat(32));
    expect(key.length).toBe(32);
  });

  it.each(["xyz", "ab".repeat(16), "ab".repeat(33), ""])(
    "rejects %s",
    (bad) => {
      expect(() => parseEncryptionKey(bad)).toThrow();
    },
  );
});

describe("credentialFingerprint", () => {
  it("is deterministic and non-reversible", () => {
    const fp = credentialFingerprint(SECRET);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).toBe(credentialFingerprint(SECRET));
    expect(fp).not.toContain(SECRET.slice(0, 8));
  });

  it("differs for different credentials", () => {
    expect(credentialFingerprint(SECRET)).not.toBe(
      credentialFingerprint(`${SECRET}x`),
    );
  });
});

describe("fingerprintsEqual", () => {
  it("compares equal fingerprints", () => {
    const fp = credentialFingerprint(SECRET);
    expect(fingerprintsEqual(fp, fp)).toBe(true);
    expect(fingerprintsEqual(fp, credentialFingerprint("other"))).toBe(false);
    expect(fingerprintsEqual(fp, "short")).toBe(false);
  });
});

describe("withDecryptedCredential", () => {
  it("exposes the plaintext only inside the callback and zeroes the buffer", async () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    let captured: Buffer | null = null;
    const result = await withDecryptedCredential(KEY, blob, AAD, (cred) => {
      captured = cred;
      return cred.toString("utf8");
    });
    expect(result).toBe(SECRET);
    expect(captured).not.toBeNull();
    expect(captured!.every((b) => b === 0)).toBe(true);
  });

  it("zeroes the buffer even when the callback throws", async () => {
    const blob = encryptCredential(KEY, SECRET, AAD);
    let captured: Buffer | null = null;
    await expect(
      withDecryptedCredential(KEY, blob, AAD, (cred) => {
        captured = cred;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(captured!.every((b) => b === 0)).toBe(true);
  });
});
