export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    commit: process.env.FLOWFUEL_COMMIT_SHA ?? "unknown",
    service: "flowfuel-web",
  });
}
