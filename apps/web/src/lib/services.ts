import { createOrbioClient, type RunDeps } from "@flowfuel/broker";
import {
  createActivationStore,
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  createRefuelExecutionStore,
  createRefuelPolicyStore,
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
import { createRefuelCoordinator } from "@flowfuel/broker";
import { createRefuelVaultClient } from "@flowfuel/broker";

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

export function runDeps(): RunDeps & {
  activations: ReturnType<typeof createActivationStore>;
  refuels: ReturnType<typeof createRefuelExecutionStore>;
} {
  const database = db();
  const vaultAddress = process.env.FLOWFUEL_REFUEL_VAULT_ADDRESS;
  const executorPrivateKey = process.env.REFUEL_EXECUTOR_PRIVATE_KEY as `0x${string}` | undefined;
  const refuel = vaultAddress && executorPrivateKey
    ? createRefuelCoordinator({
        policies: createRefuelPolicyStore(database),
        executions: createRefuelExecutionStore(database),
        vault: createRefuelVaultClient({
          rpcUrl: process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
          vaultAddress,
          executorPrivateKey,
        }),
      })
    : undefined;
  return {
    clients: createClientStore(database),
    credentials: createCredentialStore(database),
    runs: createRunStore(database),
    audit: createAuditStore(database),
    activations: createActivationStore(database),
    refuels: createRefuelExecutionStore(database),
    orbio: createOrbioClient({ baseUrl: orbioBaseUrlFromEnv() }),
    encryptionKey: credentialEncryptionKey(),
    chainId: ROBINHOOD_CHAIN_ID,
    refuel,
  };
}
