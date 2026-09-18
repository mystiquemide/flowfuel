import {
  bearerToken,
  executeRun,
  verifyWorkflowToken,
} from "@flowfuel/broker";
import {
  FlowFuelError,
  runRequestSchema,
} from "@flowfuel/core";

import { workflowTokenFromEnv } from "../../../lib/env";
import { errorResponse, parseJson } from "../../../lib/http";
import { runDeps } from "../../../lib/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (
      !verifyWorkflowToken(
        bearerToken(request.headers.get("authorization")),
        workflowTokenFromEnv(),
      )
    ) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid workflow token");
    }

    const parsed = runRequestSchema.safeParse(await parseJson(request));
    if (!parsed.success) {
      throw new FlowFuelError(
        "VALIDATION_FAILED",
        "Run request failed schema validation",
      );
    }

    const response = await executeRun(runDeps(), parsed.data);
    return Response.json(response, {
      status: response.status === "succeeded" ? 200 : 422,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
