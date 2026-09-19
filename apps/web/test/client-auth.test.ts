import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENCY_COOKIE,
  createAgencySession,
} from "../src/lib/agency-auth";
import {
  CLIENT_COOKIE,
  clientAccessFromRequest,
  clientCookie,
  clientSessionClientId,
  createClientSession,
} from "../src/lib/client-auth";

const CLIENT_A = "11111111-1111-4111-8111-111111111111";
const CLIENT_C = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  process.env.CLIENT_SESSION_SECRET = "c".repeat(64);
  process.env.AGENCY_SESSION_SECRET = "a".repeat(64);
  process.env.AGENCY_PASSWORD = "correct-horse-battery-staple";
});

describe("client sessions", () => {
  it("is short-lived, signed, and bound to one client", () => {
    const now = Date.UTC(2026, 8, 19);
    const token = createClientSession(CLIENT_A, now);
    expect(clientSessionClientId(token, now)).toBe(CLIENT_A);
    expect(clientSessionClientId(token, now + 60 * 60 * 1000 + 1_000)).toBeNull();
    expect(clientSessionClientId(`${token}x`, now)).toBeNull();
    expect(clientSessionClientId(token, now)).not.toBe(CLIENT_C);
    expect(clientCookie(token)).toContain("HttpOnly");
    expect(clientCookie(token)).toContain("Secure");
    expect(clientCookie(token)).toContain("SameSite=Strict");
  });

  it("distinguishes unauthenticated, wrong-client, correct-client, and agency access", () => {
    const now = Date.now();
    const clientToken = createClientSession(CLIENT_A, now);
    const agencyToken = createAgencySession(now);
    const unauthenticated = new Request("https://flowfuel.test/api/clients/client-a");
    const wrongClient = new Request("https://flowfuel.test/api/clients/client-c", {
      headers: { cookie: `${CLIENT_COOKIE}=${clientToken}` },
    });
    const correctClient = new Request("https://flowfuel.test/api/clients/client-a", {
      headers: { cookie: `${CLIENT_COOKIE}=${clientToken}` },
    });
    const agency = new Request("https://flowfuel.test/api/clients/client-c", {
      headers: { cookie: `${AGENCY_COOKIE}=${agencyToken}` },
    });

    expect(clientAccessFromRequest(unauthenticated, CLIENT_A)).toBeNull();
    expect(clientAccessFromRequest(wrongClient, CLIENT_C)).toBe("forbidden");
    expect(clientAccessFromRequest(correctClient, CLIENT_A)).toBe("client");
    expect(clientAccessFromRequest(agency, CLIENT_C)).toBe("agency");
  });
});
