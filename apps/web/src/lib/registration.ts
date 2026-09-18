import { getAddress } from "viem";
import {
  FlowFuelError,
  credentialFingerprint,
  encryptCredential,
  fingerprintsEqual,
  orbioCredentialEpoch,
  verifyWalletRequestSchema,
  type NoncePurpose,
  type RegisterCredentialRequest,
  type VerifyWalletRequest,
} from "@flowfuel/core";
import type { OrbioClient } from "@flowfuel/broker";
import type {
  createAuditStore,
  createClientStore,
  createCredentialStore,
} from "@flowfuel/db";

import { buildNonceMessage, verifyWalletSignature } from "./wallet";

export interface RegistrationDeps {
  clients: Pick<
    ReturnType<typeof createClientStore>,
    "getById" | "createNonce" | "consumeNonce" | "setStatus"
  >;
  credentials: Pick<
    ReturnType<typeof createCredentialStore>,
    "getForClient" | "save" | "markVerified"
  >;
  audit: Pick<ReturnType<typeof createAuditStore>, "append">;
  orbio: Pick<OrbioClient, "getKeyInfo">;
  encryptionKey: Buffer;
}

export interface IssuedNonce {
  nonce: string;
  message: string;
}

export async function issueNonce(
  deps: RegistrationDeps,
  clientId: string,
  purpose: NoncePurpose,
): Promise<IssuedNonce> {
  const client = await deps.clients.getById(clientId);
  if (!client) {
    throw new FlowFuelError("NOT_FOUND", "Client not found");
  }
  const row = await deps.clients.createNonce(clientId, purpose);
  await deps.audit.append({
    clientId,
    actorType: "client",
    eventType: "nonce_issued",
    publicData: { purpose },
  });
  return {
    nonce: row.nonce,
    message: buildNonceMessage(clientId, purpose, row.nonce),
  };
}

export async function verifyWallet(
  deps: RegistrationDeps,
  clientId: string,
  input: VerifyWalletRequest,
): Promise<{ verified: true }> {
  const client = await deps.clients.getById(clientId);
  if (!client) {
    throw new FlowFuelError("NOT_FOUND", "Client not found");
  }
  const checksummed = verifyWalletRequestSchema.parse(input).walletAddress;
  if (getAddress(client.walletAddress) !== checksummed) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Wallet address does not match this client",
    );
  }
  const message = buildNonceMessage(clientId, "connect", input.nonce);
  const valid = await verifyWalletSignature({
    walletAddress: client.walletAddress,
    message,
    signature: input.signature as `0x${string}`,
  });
  if (!valid) {
    throw new FlowFuelError("UNAUTHORIZED", "Signature verification failed");
  }
  const consumed = await deps.clients.consumeNonce(
    input.nonce,
    clientId,
    "connect",
  );
  if (!consumed) {
    throw new FlowFuelError(
      "UNAUTHORIZED",
      "Nonce is expired, consumed, or issued for another purpose",
    );
  }
  await deps.audit.append({
    clientId,
    actorType: "client",
    eventType: "wallet_verified",
    publicData: { walletAddress: client.walletAddress },
  });
  return { verified: true };
}

export interface CredentialStatus {
  status: "ready" | "unfunded";
  balance: string | null;
}

/**
 * Registers or rotates a client's Orbio credential. The nonce purpose is
 * derived from server state: a client with an existing credential row must
 * present a rotate_credential nonce, everyone else register_credential.
 * Rotation only replaces the stored credential after the new one passes a
 * live gateway validation.
 */
export async function registerCredential(
  deps: RegistrationDeps,
  clientId: string,
  input: RegisterCredentialRequest,
): Promise<CredentialStatus> {
  const client = await deps.clients.getById(clientId);
  if (!client) {
    throw new FlowFuelError("NOT_FOUND", "Client not found");
  }
  if (input.walletAddress !== getAddress(client.walletAddress)) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Wallet address does not match this client",
    );
  }
  const embeddedEpoch = orbioCredentialEpoch(input.orbioCredential);
  if (embeddedEpoch !== input.epoch) {
    throw new FlowFuelError(
      "VALIDATION_FAILED",
      "Credential epoch does not match the request epoch",
    );
  }
  const existing = await deps.credentials.getForClient(clientId);
  const purpose: NoncePurpose = existing
    ? "rotate_credential"
    : "register_credential";
  if (existing && input.epoch <= existing.epoch) {
    throw new FlowFuelError(
      "CONFLICT",
      "Rotation requires an epoch greater than the stored epoch",
    );
  }
  const message = buildNonceMessage(clientId, purpose, input.nonce);
  const valid = await verifyWalletSignature({
    walletAddress: client.walletAddress,
    message,
    signature: input.signature as `0x${string}`,
  });
  if (!valid) {
    throw new FlowFuelError("UNAUTHORIZED", "Signature verification failed");
  }
  const consumed = await deps.clients.consumeNonce(
    input.nonce,
    clientId,
    purpose,
  );
  if (!consumed) {
    throw new FlowFuelError(
      "UNAUTHORIZED",
      "Nonce is expired, consumed, or issued for another purpose",
    );
  }

  try {
    const fingerprint = credentialFingerprint(input.orbioCredential);
    const sameCredential =
      existing !== null && fingerprintsEqual(existing.fingerprint, fingerprint);
    const info = await deps.orbio.getKeyInfo(input.orbioCredential, {
      credentialPreviouslyVerified:
        sameCredential && existing.verifiedAt != null,
    });
    const ciphertext = encryptCredential(
      deps.encryptionKey,
      input.orbioCredential,
      {
        clientId,
        walletAddress: client.walletAddress,
        chainId: client.chainId,
        epoch: input.epoch,
      },
    );
    await deps.credentials.save(
      {
        clientId,
        walletAddress: client.walletAddress,
        epoch: input.epoch,
        ciphertext: ciphertext.toString("base64"),
        fingerprint: credentialFingerprint(input.orbioCredential),
      },
      Boolean(existing),
    );
    await deps.credentials.markVerified(clientId, info.balance.available);
    await deps.clients.setStatus(clientId, "ready");
    await deps.audit.append({
      clientId,
      actorType: "client",
      eventType: existing ? "credential_rotated" : "credential_registered",
      publicData: {
        epoch: input.epoch,
        fingerprint: credentialFingerprint(input.orbioCredential),
        balance: info.balance.available,
      },
    });
    return { status: "ready", balance: info.balance.available };
  } catch (err) {
    if (err instanceof FlowFuelError && err.code === "CLIENT_UNFUNDED") {
      if (!existing) await deps.clients.setStatus(clientId, "unfunded");
      return { status: "unfunded", balance: null };
    }
    throw err;
  }
}
