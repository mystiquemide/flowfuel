import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FlowFuelError } from "@flowfuel/core";
import { agencySessionFromRequest } from "./agency-auth";

export const CLIENT_COOKIE = "flowfuel_client";
export const CLIENT_SESSION_SECONDS = 60 * 60;

function secret(): string {
  const value = process.env.CLIENT_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("CLIENT_SESSION_SECRET must be at least 32 characters");
  }
  return value;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Creates a short-lived, client-bound session without storing a wallet signature. */
export function createClientSession(clientId: string, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + CLIENT_SESSION_SECONDS;
  const payload = `v1.${clientId}.${expires}`;
  return `${payload}.${signature(payload)}`;
}

export function clientSessionClientId(
  token: string | undefined,
  now = Date.now(),
): string | null {
  if (!token) return null;
  const [version, clientId, expiresRaw, provided] = token.split(".");
  if (!version || !clientId || !expiresRaw || !provided || version !== "v1") {
    return null;
  }
  const expires = Number(expiresRaw);
  if (!Number.isSafeInteger(expires) || expires < Math.floor(now / 1000)) {
    return null;
  }
  const expected = signature(`${version}.${clientId}.${expiresRaw}`);
  return timingSafeEqual(digest(provided), digest(expected)) ? clientId : null;
}

function tokenFromRequest(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_COOKIE}=`))
    ?.slice(CLIENT_COOKIE.length + 1);
}

export function clientSessionClientIdFromRequest(request: Request): string | null {
  return clientSessionClientId(tokenFromRequest(request));
}

export function clientSessionFromRequest(
  request: Request,
  clientId: string,
): boolean {
  return clientSessionClientIdFromRequest(request) === clientId;
}

/** Authorizes a detail read while preserving a distinct wrong-client result. */
export function clientAccessFromRequest(
  request: Request,
  clientId: string,
): "agency" | "client" | "forbidden" | null {
  if (agencySessionFromRequest(request)) return "agency";
  const sessionClientId = clientSessionClientIdFromRequest(request);
  if (!sessionClientId) return null;
  return sessionClientId === clientId ? "client" : "forbidden";
}

export function assertClientSession(request: Request, clientId: string): void {
  if (!clientSessionFromRequest(request, clientId)) {
    throw new FlowFuelError("UNAUTHORIZED", "Client authentication required");
  }
}

export function clientCookie(token: string): string {
  return `${CLIENT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${CLIENT_SESSION_SECONDS}`;
}
