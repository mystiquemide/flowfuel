import {
  parseEncryptionKey,
  ROBINHOOD_CHAIN_ID,
} from "@flowfuel/core";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  databaseUrl,
} from "@flowfuel/db";

import { createRunServer } from "./http-server";
import { createOrbioClient } from "./orbio";
import type { RunDeps } from "./run-client-task";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function buildDeps(): RunDeps {
  const { db } = createDb(databaseUrl());
  return {
    clients: createClientStore(db),
    credentials: createCredentialStore(db),
    runs: createRunStore(db),
    audit: createAuditStore(db),
    orbio: createOrbioClient({ baseUrl: process.env.ORBIO_BASE_URL }),
    encryptionKey: parseEncryptionKey(env("CREDENTIAL_ENCRYPTION_KEY")),
    chainId: ROBINHOOD_CHAIN_ID,
  };
}

const server = createRunServer(buildDeps(), env("FLOWFUEL_WORKFLOW_TOKEN"));
const port = Number(process.env.BROKER_PORT ?? process.env.PORT ?? 4010);
server.listen(port, () => {
  console.log(`flowfuel broker listening on :${port}`);
});
