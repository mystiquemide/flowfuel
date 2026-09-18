import {
  encryptCredential,
  ROBINHOOD_CHAIN_ID,
} from "@flowfuel/core";
import {
  createClientStore,
  createCredentialStore,
  createDb,
  databaseUrl,
} from "@flowfuel/db";

const CLIENT_A_WALLET = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const CLIENT_B_WALLET = "0xA0234103102008dCf310182a829Cd18408373CEC";

async function main() {
  const credential = process.env.CLIENT_A_CREDENTIAL;
  const credentialB = process.env.CLIENT_B_CREDENTIAL;
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!credential || !credentialB || !keyHex) {
    throw new Error(
      "CLIENT_A_CREDENTIAL, CLIENT_B_CREDENTIAL, CREDENTIAL_ENCRYPTION_KEY required",
    );
  }
  const key = Buffer.from(keyHex, "hex");
  const { db, sql } = createDb(databaseUrl());
  try {
    const clients = createClientStore(db);
    const credentials = createCredentialStore(db);
    let a = await clients.getBySlug("client-a");
    a ??= await clients.create({
      slug: "client-a",
      displayName: "Client A",
      walletAddress: CLIENT_A_WALLET,
    });
    let b = await clients.getBySlug("client-b");
    b ??= await clients.create({
      slug: "client-b",
      displayName: "Client B",
      walletAddress: CLIENT_B_WALLET,
    });
    const aad = {
      clientId: a.id,
      walletAddress: a.walletAddress,
      chainId: ROBINHOOD_CHAIN_ID,
      epoch: 0,
    };
    const { credentialFingerprint } = await import("@flowfuel/core");
    await credentials.save({
      clientId: a.id,
      walletAddress: a.walletAddress,
      epoch: 0,
      ciphertext: encryptCredential(key, credential, aad).toString("base64"),
      fingerprint: credentialFingerprint(credential),
    });
    await credentials.markVerified(a.id, "0.009726");
    const aadB = {
      clientId: b.id,
      walletAddress: b.walletAddress,
      chainId: ROBINHOOD_CHAIN_ID,
      epoch: 0,
    };
    await credentials.save({
      clientId: b.id,
      walletAddress: b.walletAddress,
      epoch: 0,
      ciphertext: encryptCredential(key, credentialB, aadB).toString("base64"),
      fingerprint: credentialFingerprint(credentialB),
    });
    console.log(`CLIENT_A_ID=${a.id}`);
    console.log(`CLIENT_B_ID=${b.id}`);
  } finally {
    await sql.end();
  }
}

main();
