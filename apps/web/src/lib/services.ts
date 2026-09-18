import { createOrbioClient, type RunDeps } from "@flowfuel/broker";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  type Db,
  type Sql,
} from "@flowfuel/db";
import { ROBINHOOD_CHAIN_ID } from "@flowfuel/core";

import {
  credentialEncryptionKey,
  databaseUrlFromEnv,
  orbioBaseUrlFromEnv,
} from "./env";
import type { RegistrationDeps } from "./registration";

let conn: { db: Db; sql: Sql } | null = null;

function db(): Db {
  if (!conn) conn = createDb(databaseUrlFromEnv());
  return conn.db;
}

export function registrationDeps(): RegistrationDeps {
  const database = db();
  return {
    clients: createClientStore(database),
    credentials: createCredentialStore(database),
    audit: createAuditStore(database),
    orbio: createOrbioClient({ baseUrl: orbioBaseUrlFromEnv() }),
    encryptionKey: credentialEncryptionKey(),
  };
}

export function runDeps(): RunDeps {
  const database = db();
  return {
    clients: createClientStore(database),
    credentials: createCredentialStore(database),
    runs: createRunStore(database),
    audit: createAuditStore(database),
    orbio: createOrbioClient({ baseUrl: orbioBaseUrlFromEnv() }),
    encryptionKey: credentialEncryptionKey(),
    chainId: ROBINHOOD_CHAIN_ID,
  };
}
