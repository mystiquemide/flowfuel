import { FlowFuelError, uuidSchema } from "@flowfuel/core";
import {
  createClientStore,
  createCredentialStore,
  createDb,
} from "@flowfuel/db";

import { databaseUrlFromEnv } from "../../../../lib/env";
import { errorResponse } from "../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    const { db } = createDb(databaseUrlFromEnv());
    const client = await createClientStore(db).getById(clientId);
    if (!client) {
      throw new FlowFuelError("NOT_FOUND", "Client not found");
    }
    const credential = await createCredentialStore(db).getForClient(clientId);
    return Response.json({
      id: client.id,
      slug: client.slug,
      displayName: client.displayName,
      walletAddress: client.walletAddress,
      chainId: client.chainId,
      status: client.status,
      credentialRegistered: credential !== null,
      epoch: credential?.epoch ?? null,
      verifiedBalance: credential?.verifiedBalance ?? null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
