import {
  parseEncryptionKey,
  ROBINHOOD_CHAIN_ID,
} from "@flowfuel/core";
import {
  createAuditStore,
  createActivationStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  createRefuelExecutionStore,
  createRefuelPolicyStore,
  databaseUrl,
} from "@flowfuel/db";

import { createRunServer } from "./http-server";
import { createOrbioClient } from "./orbio";
import type { RunDeps } from "./run-client-task";
import { createRefuelCoordinator } from "./refuel";
import { createRefuelVaultClient } from "./refuel-vault";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function buildDeps(): RunDeps {
  const { db } = createDb(databaseUrl());
  const vaultAddress = process.env.FLOWFUEL_REFUEL_VAULT_ADDRESS;
  const executorPrivateKey = process.env.REFUEL_EXECUTOR_PRIVATE_KEY as `0x${string}` | undefined;
  const refuel = vaultAddress && executorPrivateKey
    ? createRefuelCoordinator({
        policies: createRefuelPolicyStore(db),
        executions: createRefuelExecutionStore(db),
        vault: createRefuelVaultClient({
          rpcUrl: process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
          vaultAddress,
          executorPrivateKey,
        }),
      })
    : undefined;
  return {
    clients: createClientStore(db),
    credentials: createCredentialStore(db),
    runs: createRunStore(db),
    audit: createAuditStore(db),
    activations: createActivationStore(db),
    refuels: createRefuelExecutionStore(db),
    orbio: createOrbioClient({ baseUrl: process.env.ORBIO_BASE_URL }),
    encryptionKey: parseEncryptionKey(env("CREDENTIAL_ENCRYPTION_KEY")),
    chainId: ROBINHOOD_CHAIN_ID,
    refuel,
  };
}

const server = createRunServer(buildDeps(), env("FLOWFUEL_WORKFLOW_TOKEN"));
const port = Number(process.env.BROKER_PORT ?? process.env.PORT ?? 4010);
server.listen(port, () => {
  console.log(`flowfuel broker listening on :${port}`);
});
