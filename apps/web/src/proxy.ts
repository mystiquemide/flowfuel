import { NextResponse, type NextRequest } from "next/server";
import { AGENCY_COOKIE, verifyAgencySession } from "./lib/agency-auth";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/agency/login") return NextResponse.next();
  const token = request.cookies.get(AGENCY_COOKIE)?.value;
  if (!verifyAgencySession(token)) {
    return NextResponse.redirect(new URL("/agency/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/agency/:path*"] };
