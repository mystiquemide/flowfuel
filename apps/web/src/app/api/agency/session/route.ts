import { FlowFuelError } from "@flowfuel/core";
import {
  agencyCookie,
  createAgencySession,
  verifyAgencyPassword,
} from "../../../../lib/agency-auth";
import { errorResponse, parseJson } from "../../../../lib/http";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await parseJson(request)) as { password?: unknown };
    if (typeof body.password !== "string" || !verifyAgencyPassword(body.password)) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid agency credentials");
    }
    return Response.json(
      { authenticated: true },
      { headers: { "Set-Cookie": agencyCookie(createAgencySession()) } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(): Promise<Response> {
  return Response.json(
    { authenticated: false },
    { headers: { "Set-Cookie": "flowfuel_agency=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } },
  );
}
