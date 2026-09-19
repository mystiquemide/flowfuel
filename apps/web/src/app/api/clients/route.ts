import {
  FlowFuelError,
  createClientRequestSchema,
} from "@flowfuel/core";
import {
  createActivationStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
} from "@flowfuel/db";

import { bearerToken, createOrbioClient, verifyWorkflowToken } from "@flowfuel/broker";
import {
  credentialEncryptionKey,
  databaseUrlFromEnv,
  orbioBaseUrlFromEnv,
  workflowTokenFromEnv,
} from "../../../lib/env";
import { errorResponse, parseJson } from "../../../lib/http";
import { liveActivatedBalance } from "../../../lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugFrom(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Agency ledger. Each row carries the live activated balance read straight
 * from the Orbio gateway at request time; clients without a credential report
 * a null balance rather than a fabricated number.
 */
export async function GET(): Promise<Response> {
  try {
    const { db } = createDb(databaseUrlFromEnv());
    const clients = createClientStore(db);
    const credentials = createCredentialStore(db);
    const runs = createRunStore(db);
    const activations = createActivationStore(db);
    const orbio = createOrbioClient({ baseUrl: orbioBaseUrlFromEnv() });
    const encryptionKey = credentialEncryptionKey();

    const rows = await clients.list();
    const result = await Promise.all(
      rows.map(async (client) => {
        const credential = await credentials.getForClient(client.id);
        const [balance, recent, totalSpent, activation] = await Promise.all([
          liveActivatedBalance({
            orbio,
            encryptionKey,
            client,
            credential,
          }),
          runs.listByClient(client.id, 1),
          runs.sumChargedCost(client.id),
          activations.latestForClient(client.id),
        ]);
        return {
          id: client.id,
          slug: client.slug,
          displayName: client.displayName,
          walletAddress: client.walletAddress,
          chainId: client.chainId,
          status: client.status,
          credentialRegistered: credential !== null,
          epoch: credential?.epoch ?? null,
          activatedBalance: balance.available,
          activatedUsed: balance.used,
          balanceReadAt: balance.readAt,
          balanceUnavailableReason: balance.reason ?? null,
          totalSpentUsd: totalSpent.toFixed(6),
          lastRun: recent[0]
            ? {
                runId: recent[0].id,
                status: recent[0].status,
                startedAt: recent[0].startedAt.toISOString(),
              }
            : null,
          latestActivation: activation
            ? {
                transactionHash: activation.transactionHash,
                amountUsd: activation.amountUsd,
                activationId: activation.activationId,
              }
            : null,
        };
      }),
    );
    return Response.json({ clients: result });
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * Creates a client record (status pending) and returns the connect link the
 * agency sends to the client. Guarded by the shared workflow token: creating
 * clients is an agency operation, not a public one.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (
      !verifyWorkflowToken(
        bearerToken(request.headers.get("authorization")),
        workflowTokenFromEnv(),
      )
    ) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid workflow token");
    }

    const parsed = createClientRequestSchema.safeParse(await parseJson(request));
    if (!parsed.success) {
      throw new FlowFuelError(
        "VALIDATION_FAILED",
        "Client request failed schema validation",
      );
    }

    const { db } = createDb(databaseUrlFromEnv());
    const slug = parsed.data.slug ?? slugFrom(parsed.data.displayName);
    if (!slug) {
      throw new FlowFuelError(
        "VALIDATION_FAILED",
        "Display name produces no usable slug",
      );
    }
    const client = await createClientStore(db).create({
      slug,
      displayName: parsed.data.displayName,
      walletAddress: parsed.data.walletAddress,
    });

    return Response.json(
      {
        id: client.id,
        slug: client.slug,
        displayName: client.displayName,
        walletAddress: client.walletAddress,
        chainId: client.chainId,
        status: client.status,
        connectPath: `/connect/${client.id}`,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
