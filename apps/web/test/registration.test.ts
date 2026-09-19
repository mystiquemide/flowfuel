import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "node:crypto";
import {
  FlowFuelError,
  decryptCredential,
  orbioCredentialEpoch,
  registerCredentialRequestSchema,
  type NoncePurpose,
} from "@flowfuel/core";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  databaseUrl,
} from "@flowfuel/db";
import { migrateDb } from "@flowfuel/db/migrate";

import {
  issueNonce,
  registerCredential,
  revokeCredential,
  updateClientStatus,
  verifyWallet,
  type RegistrationDeps,
} from "../src/lib/registration";
import { buildNonceMessage } from "../src/lib/wallet";

// Integration tests run against a dedicated database so the dev data survives.
process.env.DATABASE_URL =
  "postgres://flowfuel:flowfuel@localhost:55432/flowfuel_test";

const { db, sql } = createDb(databaseUrl());
const clientStore = createClientStore(db);
const credentialStore = createCredentialStore(db);
const auditStore = createAuditStore(db);
const encryptionKey = randomBytes(32);

const fundedOrbio = {
  getKeyInfo: async () => ({
    balance: {
      available: "0.010000",
      used: "0",
      available_micro_usd: 10000,
      used_micro_usd: 0,
    },
  }),
};

const unfundedOrbio = {
  getKeyInfo: async () => {
    throw new FlowFuelError("CLIENT_UNFUNDED", "Orbio rejected the credential", {
      upstreamStatus: 401,
    });
  },
};

function deps(orbio: RegistrationDeps["orbio"]): RegistrationDeps {
  return { clients: clientStore, credentials: credentialStore, audit: auditStore, orbio, encryptionKey };
}

function fakeCredential(epoch: number): string {
  return `sk-orb-${epoch}-${Buffer.alloc(65, 7).toString("base64")}`;
}

let seq = 0;
async function makeClient() {
  seq += 1;
  const account = privateKeyToAccount(generatePrivateKey());
  const client = await clientStore.create({
    slug: `t06-${Date.now()}-${seq}`,
    displayName: `T06 Client ${seq}`,
    walletAddress: account.address,
  });
  return { account, client };
}

async function sign(account: ReturnType<typeof privateKeyToAccount>, message: string) {
  return account.signMessage({ message });
}

async function registerInput(
  account: ReturnType<typeof privateKeyToAccount>,
  clientId: string,
  purpose: NoncePurpose,
  epoch: number,
) {
  const { nonce } = await issueNonce(deps(fundedOrbio), clientId, purpose);
  const signature = await sign(account, buildNonceMessage(clientId, purpose, nonce));
  return {
    walletAddress: account.address,
    epoch,
    orbioCredential: fakeCredential(epoch),
    consent: true as const,
    nonce,
    signature,
  };
}

beforeAll(async () => {
  await migrateDb(db);
});

beforeEach(async () => {
  await sql.unsafe(
    "TRUNCATE audit_events, runs, activations, client_credentials, wallet_nonces, clients RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await sql.end();
});

describe("wallet verification", () => {
  it("verifies a signed connect nonce", async () => {
    const { account, client } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "connect");
    const signature = await sign(account, buildNonceMessage(client.id, "connect", nonce));
    const result = await verifyWallet(deps(fundedOrbio), client.id, {
      clientId: client.id,
      nonce,
      walletAddress: account.address,
      signature,
    });
    expect(result.verified).toBe(true);
  });

  it("rejects replay of a consumed nonce", async () => {
    const { account, client } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "connect");
    const signature = await sign(account, buildNonceMessage(client.id, "connect", nonce));
    const input = { clientId: client.id, nonce, walletAddress: account.address, signature };
    await verifyWallet(deps(fundedOrbio), client.id, input);
    await expect(verifyWallet(deps(fundedOrbio), client.id, input)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects an expired nonce", async () => {
    const { account, client } = await makeClient();
    const row = await clientStore.createNonce(client.id, "connect", -60);
    const signature = await sign(account, buildNonceMessage(client.id, "connect", row.nonce));
    await expect(
      verifyWallet(deps(fundedOrbio), client.id, {
        clientId: client.id,
        nonce: row.nonce,
        walletAddress: account.address,
        signature,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a signature from the wrong wallet", async () => {
    const { client } = await makeClient();
    const intruder = privateKeyToAccount(generatePrivateKey());
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "connect");
    const signature = await sign(intruder, buildNonceMessage(client.id, "connect", nonce));
    await expect(
      verifyWallet(deps(fundedOrbio), client.id, {
        clientId: client.id,
        nonce,
        walletAddress: intruder.address,
        signature,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects a nonce issued for a different purpose", async () => {
    const { account, client } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "register_credential");
    const signature = await sign(account, buildNonceMessage(client.id, "connect", nonce));
    await expect(
      verifyWallet(deps(fundedOrbio), client.id, {
        clientId: client.id,
        nonce,
        walletAddress: account.address,
        signature,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a nonce bound to another client", async () => {
    const { account, client } = await makeClient();
    const { client: other } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), other.id, "connect");
    const signature = await sign(account, buildNonceMessage(other.id, "connect", nonce));
    await expect(
      verifyWallet(deps(fundedOrbio), client.id, {
        clientId: client.id,
        nonce,
        walletAddress: account.address,
        signature,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("credential registration", () => {
  it("registers a funded credential and stores tenant-bound ciphertext", async () => {
    const { account, client } = await makeClient();
    const input = await registerInput(account, client.id, "register_credential", 0);
    const result = await registerCredential(deps(fundedOrbio), client.id, input);
    expect(result).toEqual({ status: "ready", balance: "0.010000" });
    const stored = await credentialStore.getForClient(client.id);
    expect(stored?.epoch).toBe(0);
    expect(stored?.verifiedAt).not.toBeNull();
    const plaintext = decryptCredential(
      encryptionKey,
      Buffer.from(stored!.ciphertext, "base64"),
      { clientId: client.id, walletAddress: client.walletAddress, chainId: 4663, epoch: 0 },
    );
    expect(plaintext.toString()).toBe(input.orbioCredential);
    expect(() =>
      decryptCredential(
        encryptionKey,
        Buffer.from(stored!.ciphertext, "base64"),
        { clientId: crypto.randomUUID(), walletAddress: client.walletAddress, chainId: 4663, epoch: 0 },
      ),
    ).toThrow();
    const refreshed = await clientStore.getById(client.id);
    expect(refreshed?.status).toBe("ready");
  });

  it("returns honest unfunded status without storing a credential", async () => {
    const { account, client } = await makeClient();
    const input = await registerInput(account, client.id, "register_credential", 0);
    const result = await registerCredential(deps(unfundedOrbio), client.id, input);
    expect(result).toEqual({ status: "unfunded", balance: null });
    expect(await credentialStore.getForClient(client.id)).toBeNull();
    const refreshed = await clientStore.getById(client.id);
    expect(refreshed?.status).toBe("unfunded");
  });

  it("rejects a credential whose prefix epoch mismatches the request", async () => {
    const { account, client } = await makeClient();
    const input = await registerInput(account, client.id, "register_credential", 0);
    input.orbioCredential = fakeCredential(1);
    await expect(
      registerCredential(deps(fundedOrbio), client.id, input),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects consent: false at the contract level", () => {
    expect(() =>
      registerCredentialRequestSchema.parse({
        walletAddress: "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F",
        epoch: 0,
        orbioCredential: fakeCredential(0),
        consent: false,
        nonce: crypto.randomUUID(),
        signature: `0x${"ab".repeat(65)}`,
      }),
    ).toThrow();
  });

  it("requires a rotate nonce once a credential exists", async () => {
    const { account, client } = await makeClient();
    const first = await registerInput(account, client.id, "register_credential", 0);
    await registerCredential(deps(fundedOrbio), client.id, first);
    const again = await registerInput(account, client.id, "register_credential", 1);
    await expect(
      registerCredential(deps(fundedOrbio), client.id, again),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects rotation to an epoch that is not greater", async () => {
    const { account, client } = await makeClient();
    const first = await registerInput(account, client.id, "register_credential", 0);
    await registerCredential(deps(fundedOrbio), client.id, first);
    const rotate = await registerInput(account, client.id, "rotate_credential", 0);
    await expect(
      registerCredential(deps(fundedOrbio), client.id, rotate),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps the old credential when the rotated one is unfunded", async () => {
    const { account, client } = await makeClient();
    const first = await registerInput(account, client.id, "register_credential", 0);
    await registerCredential(deps(fundedOrbio), client.id, first);
    const rotate = await registerInput(account, client.id, "rotate_credential", 1);
    const result = await registerCredential(deps(unfundedOrbio), client.id, rotate);
    expect(result.status).toBe("unfunded");
    const stored = await credentialStore.getForClient(client.id);
    expect(stored?.epoch).toBe(0);
    const plaintext = decryptCredential(
      encryptionKey,
      Buffer.from(stored!.ciphertext, "base64"),
      { clientId: client.id, walletAddress: client.walletAddress, chainId: 4663, epoch: 0 },
    );
    expect(plaintext.toString()).toBe(first.orbioCredential);
  });

  it("rotates to a higher epoch only after live validation", async () => {
    const { account, client } = await makeClient();
    const first = await registerInput(account, client.id, "register_credential", 0);
    await registerCredential(deps(fundedOrbio), client.id, first);
    const rotate = await registerInput(account, client.id, "rotate_credential", 1);
    const result = await registerCredential(deps(fundedOrbio), client.id, rotate);
    expect(result.status).toBe("ready");
    const stored = await credentialStore.getForClient(client.id);
    expect(stored?.epoch).toBe(1);
    expect(stored?.rotatedAt).not.toBeNull();
    const plaintext = decryptCredential(
      encryptionKey,
      Buffer.from(stored!.ciphertext, "base64"),
      { clientId: client.id, walletAddress: client.walletAddress, chainId: 4663, epoch: 1 },
    );
    expect(plaintext.toString()).toBe(rotate.orbioCredential);
    expect(orbioCredentialEpoch(plaintext.toString())).toBe(1);
  });
});

describe("signed client actions", () => {
  it("pauses and resumes a client with wallet signatures", async () => {
    const { account, client } = await makeClient();
    const pauseNonce = await issueNonce(deps(fundedOrbio), client.id, "pause_client");
    const pauseSig = await sign(
      account,
      buildNonceMessage(client.id, "pause_client", pauseNonce.nonce),
    );
    const paused = await updateClientStatus(deps(fundedOrbio), client.id, {
      status: "paused",
      nonce: pauseNonce.nonce,
      signature: pauseSig,
    });
    expect(paused.status).toBe("paused");
    expect((await clientStore.getById(client.id))?.status).toBe("paused");

    const resumeNonce = await issueNonce(deps(fundedOrbio), client.id, "pause_client");
    const resumeSig = await sign(
      account,
      buildNonceMessage(client.id, "pause_client", resumeNonce.nonce),
    );
    const resumed = await updateClientStatus(deps(fundedOrbio), client.id, {
      status: "ready",
      nonce: resumeNonce.nonce,
      signature: resumeSig,
    });
    expect(resumed.status).toBe("ready");
    expect((await clientStore.getById(client.id))?.status).toBe("ready");
  });

  it("rejects replay of a consumed pause nonce", async () => {
    const { account, client } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "pause_client");
    const signature = await sign(
      account,
      buildNonceMessage(client.id, "pause_client", nonce),
    );
    await updateClientStatus(deps(fundedOrbio), client.id, {
      status: "paused",
      nonce,
      signature,
    });
    await expect(
      updateClientStatus(deps(fundedOrbio), client.id, {
        status: "ready",
        nonce,
        signature,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await clientStore.getById(client.id))?.status).toBe("paused");
  });

  it("rejects a pause signature from the wrong wallet", async () => {
    const { client } = await makeClient();
    const stranger = privateKeyToAccount(generatePrivateKey());
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "pause_client");
    const signature = await sign(
      stranger,
      buildNonceMessage(client.id, "pause_client", nonce),
    );
    await expect(
      updateClientStatus(deps(fundedOrbio), client.id, {
        status: "paused",
        nonce,
        signature,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("revokes the stored credential and drops the client to revoked", async () => {
    const { account, client } = await makeClient();
    const input = await registerInput(account, client.id, "register_credential", 0);
    await registerCredential(deps(fundedOrbio), client.id, input);
    expect(await credentialStore.getForClient(client.id)).not.toBeNull();

    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "revoke_credential");
    const signature = await sign(
      account,
      buildNonceMessage(client.id, "revoke_credential", nonce),
    );
    const result = await revokeCredential(deps(fundedOrbio), client.id, {
      nonce,
      signature,
    });
    expect(result).toEqual({ revoked: true });
    expect(await credentialStore.getForClient(client.id)).toBeNull();
    expect((await clientStore.getById(client.id))?.status).toBe("revoked");
  });

  it("rejects revoke with a pause-purpose nonce", async () => {
    const { account, client } = await makeClient();
    const { nonce } = await issueNonce(deps(fundedOrbio), client.id, "pause_client");
    const signature = await sign(
      account,
      buildNonceMessage(client.id, "pause_client", nonce),
    );
    await expect(
      revokeCredential(deps(fundedOrbio), client.id, { nonce, signature }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await clientStore.getById(client.id))?.status).toBe("pending");
  });
});
