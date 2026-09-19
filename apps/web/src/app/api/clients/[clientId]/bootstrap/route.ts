import { FlowFuelError, uuidSchema } from "@flowfuel/core";
import {
  createClientStore,
  createDb,
} from "@flowfuel/db";

import { databaseUrlFromEnv } from "../../../../../lib/env";
import { errorResponse } from "../../../../../lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public link bootstrap. This is intentionally limited to the identity and
 * onboarding state needed before the wallet proves ownership. Operational
 * balances, runs, spend, activation history, and credential metadata remain
 * behind the client session or agency session.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    const { db } = createDb(databaseUrlFromEnv());
    const clients = createClientStore(db);
    const client = uuidSchema.safeParse(clientId).success
      ? await clients.getById(clientId)
      : await clients.getBySlug(clientId);
    if (!client) throw new FlowFuelError("NOT_FOUND", "Client not found");

    return Response.json({
      id: client.id,
      displayName: client.displayName,
      walletAddress: client.walletAddress,
      chainId: client.chainId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
