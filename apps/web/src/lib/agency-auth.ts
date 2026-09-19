import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { FlowFuelError } from "@flowfuel/core";

export const AGENCY_COOKIE = "flowfuel_agency";
const SESSION_SECONDS = 8 * 60 * 60;

function secret(): string {
  const value = process.env.AGENCY_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AGENCY_SESSION_SECRET must be at least 32 characters");
  }
  return value;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function verifyAgencyPassword(provided: string): boolean {
  const expected = process.env.AGENCY_PASSWORD;
  if (!expected || expected.length < 12) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

export function createAgencySession(now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_SECONDS;
  const payload = `v1.${expires}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAgencySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [version, expiresRaw, signature] = token.split(".");
  if (version !== "v1" || !expiresRaw || !signature) return false;
  const expires = Number(expiresRaw);
  if (!Number.isSafeInteger(expires) || expires < Math.floor(now / 1000)) return false;
  const expected = createHmac("sha256", secret())
    .update(`${version}.${expiresRaw}`)
    .digest("base64url");
  return timingSafeEqual(digest(signature), digest(expected));
}

export function assertAgencySession(token: string | undefined): void {
  if (!verifyAgencySession(token)) {
    throw new FlowFuelError("UNAUTHORIZED", "Agency authentication required");
  }
}

export function agencySessionFromRequest(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AGENCY_COOKIE}=`))
    ?.slice(AGENCY_COOKIE.length + 1);
  return verifyAgencySession(token);
}

export function agencyCookie(token: string): string {
  return `${AGENCY_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}
