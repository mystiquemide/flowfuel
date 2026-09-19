import { beforeEach, describe, expect, it } from "vitest";
import {
  AGENCY_COOKIE,
  assertAgencySession,
  agencySessionFromRequest,
  createAgencySession,
  verifyAgencyPassword,
  verifyAgencySession,
} from "../src/lib/agency-auth";

beforeEach(() => {
  process.env.AGENCY_SESSION_SECRET = "s".repeat(64);
  process.env.AGENCY_PASSWORD = "correct-horse-battery-staple";
});

describe("agency authentication", () => {
  it("accepts the configured password and rejects a wrong one", () => {
    expect(verifyAgencyPassword("correct-horse-battery-staple")).toBe(true);
    expect(verifyAgencyPassword("wrong-password")).toBe(false);
  });

  it("accepts a signed unexpired session and rejects tampering", () => {
    const now = Date.UTC(2026, 8, 19);
    const token = createAgencySession(now);
    expect(verifyAgencySession(token, now)).toBe(true);
    expect(verifyAgencySession(`${token}x`, now)).toBe(false);
    expect(verifyAgencySession(token, now + 9 * 60 * 60 * 1000)).toBe(false);
  });

  it("reads only the signed agency cookie from a request", () => {
    const token = createAgencySession();
    const valid = new Request("https://flowfuel.test/api/clients", {
      headers: { cookie: `${AGENCY_COOKIE}=${token}` },
    });
    const invalid = new Request("https://flowfuel.test/api/clients", {
      headers: { cookie: `${AGENCY_COOKIE}=forged` },
    });
    expect(agencySessionFromRequest(valid)).toBe(true);
    expect(agencySessionFromRequest(invalid)).toBe(false);
  });

  it("rejects privileged agency operations without a valid session", () => {
    expect(() => assertAgencySession(undefined)).toThrow(/Agency authentication required/);
    expect(() => assertAgencySession("forged")).toThrow(/Agency authentication required/);
    expect(() => assertAgencySession(createAgencySession())).not.toThrow();
  });
});
