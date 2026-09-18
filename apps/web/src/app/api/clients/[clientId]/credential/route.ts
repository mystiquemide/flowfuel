import {
  credentialStatusResponseSchema,
  registerCredentialRequestSchema,
  uuidSchema,
} from "@flowfuel/core";

import { errorResponse, parseJson } from "../../../../../lib/http";
import { registrationDeps } from "../../../../../lib/services";
import { registerCredential } from "../../../../../lib/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    const input = registerCredentialRequestSchema.parse(
      await parseJson(request),
    );
    const result = await registerCredential(
      registrationDeps(),
      clientId,
      input,
    );
    return Response.json(credentialStatusResponseSchema.parse(result));
  } catch (err) {
    return errorResponse(err);
  }
}
