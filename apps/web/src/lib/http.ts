import { FlowFuelError, type ApiError } from "@flowfuel/core";

const HTTP_BY_CODE: Record<string, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CLIENT_UNFUNDED: 402,
  CREDENTIAL_REVOKED: 401,
  QUOTA_EXCEEDED: 402,
  PROVIDER_FAILED: 502,
  RECONCILIATION_FAILED: 500,
};

export function errorResponse(err: unknown): Response {
  if (err instanceof FlowFuelError) {
    const body: ApiError = {
      code: err.code,
      upstreamStatus: err.upstreamStatus,
      action: err.action,
    };
    return Response.json(body, {
      status: HTTP_BY_CODE[err.code] ?? 500,
    });
  }
  return Response.json(
    {
      code: "PROVIDER_FAILED",
      upstreamStatus: null,
      action: "Retry later. The provider request did not succeed.",
    } satisfies ApiError,
    { status: 500 },
  );
}

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FlowFuelError("VALIDATION_FAILED", "Request body must be JSON");
  }
}
