import { describe, expect, it } from "vitest";
import { FlowFuelError, mapUpstreamError } from "../src/index";

describe("mapUpstreamError", () => {
  it("maps 401 with an unverified credential to CLIENT_UNFUNDED", () => {
    const err = mapUpstreamError(401, { credentialPreviouslyVerified: false });
    expect(err.code).toBe("CLIENT_UNFUNDED");
    expect(err.upstreamStatus).toBe(401);
  });

  it("maps 401 with a previously verified credential to CREDENTIAL_REVOKED", () => {
    const err = mapUpstreamError(401, { credentialPreviouslyVerified: true });
    expect(err.code).toBe("CREDENTIAL_REVOKED");
  });

  it("maps 402 to QUOTA_EXCEEDED", () => {
    expect(mapUpstreamError(402).code).toBe("QUOTA_EXCEEDED");
  });

  it("maps 429 to PROVIDER_FAILED", () => {
    expect(mapUpstreamError(429).code).toBe("PROVIDER_FAILED");
  });

  it.each([500, 502, 503])("maps %i to PROVIDER_FAILED", (status) => {
    expect(mapUpstreamError(status).code).toBe("PROVIDER_FAILED");
  });

  it("maps unexpected statuses to PROVIDER_FAILED", () => {
    expect(mapUpstreamError(418).code).toBe("PROVIDER_FAILED");
  });
});

describe("FlowFuelError", () => {
  it("carries a client-facing action hint", () => {
    const err = new FlowFuelError("CLIENT_UNFUNDED", "no balance");
    expect(err.action).toContain("CREDIT");
    expect(err.code).toBe("CLIENT_UNFUNDED");
  });
});
