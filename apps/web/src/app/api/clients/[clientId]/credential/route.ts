import {
  credentialStatusResponseSchema,
  registerCredentialRequestSchema,
  revokeCredentialRequestSchema,
  uuidSchema,
} from "@flowfuel/core";

import { errorResponse, parseJson } from "../../../../../lib/http";
import { registrationDeps } from "../../../../../lib/services";
import {
  registerCredential,
  revokeCredential,
} from "../../../../../lib/registration";

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

/**
 * Signed revocation. The wallet owner signs a revoke_credential nonce; the
 * stored credential is deleted and the client flips to revoked. There is no
 * fallback credential, so the client's next run is blocked unfunded.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const { clientId } = await context.params;
    uuidSchema.parse(clientId);
    const input = revokeCredentialRequestSchema.parse(await parseJson(request));
    const result = await revokeCredential(registrationDeps(), clientId, input);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
