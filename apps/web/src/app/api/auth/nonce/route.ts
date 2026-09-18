import { nonceRequestSchema, nonceResponseSchema } from "@flowfuel/core";

import { errorResponse, parseJson } from "../../../../lib/http";
import { registrationDeps } from "../../../../lib/services";
import { issueNonce } from "../../../../lib/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const { clientId, purpose } = nonceRequestSchema.parse(
      await parseJson(request),
    );
    const issued = await issueNonce(registrationDeps(), clientId, purpose);
    return Response.json(nonceResponseSchema.parse(issued));
  } catch (err) {
    return errorResponse(err);
  }
}
