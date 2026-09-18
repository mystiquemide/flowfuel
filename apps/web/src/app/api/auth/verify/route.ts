import { verifyWalletRequestSchema } from "@flowfuel/core";

import { errorResponse, parseJson } from "../../../../lib/http";
import { registrationDeps } from "../../../../lib/services";
import { verifyWallet } from "../../../../lib/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const input = verifyWalletRequestSchema.parse(await parseJson(request));
    const result = await verifyWallet(
      registrationDeps(),
      input.clientId,
      input,
    );
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
