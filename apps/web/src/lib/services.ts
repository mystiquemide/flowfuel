import { createOrbioClient } from "@flowfuel/broker";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  type Db,
  type Sql,
} from "@flowfuel/db";

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
