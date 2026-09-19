import { describe, expect, it } from "vitest";
import { FlowFuelError } from "@flowfuel/core";

import {
  createWebsiteInspector,
  isGlobalAddress,
  MAX_REDIRECTS,
  MAX_WEBSITE_BYTES,
  type PinnedResponse,
} from "../src/website-tool";

function response(
  body: string | Uint8Array | Uint8Array[],
  status = 200,
  headers: Record<string, string> = {},
): PinnedResponse & { aborted: () => boolean } {
  const chunks = Array.isArray(body) ? body : [body];
  let aborted = false;
  return {
    status,
    headers: new Headers(headers),
    body: (async function* () {
      for (const chunk of chunks) yield typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    })(),
    abort: () => {
      aborted = true;
    },
    aborted: () => aborted,
  };
}

function makeInspector(
  responses: PinnedResponse[],
  lookupAnswers: Record<string, string[]> = {},
) {
  const requests: Array<{ url: string; address: string }> = [];
  const inspector = createWebsiteInspector({
    lookup: async (hostname) =>
      (lookupAnswers[hostname] ?? ["93.184.216.34"]).map((address) => ({ address })),
    request: async (url, address) => {
      requests.push({ url: url.toString(), address });
      const next = responses.shift();
      if (!next) throw new Error("test response queue exhausted");
      return next;
    },
  });
  return { inspector, requests };
}

describe("website target classification", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
  ])("rejects non-global address %s", (address) => {
    expect(isGlobalAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])(
    "accepts global address %s",
    (address) => expect(isGlobalAddress(address)).toBe(true),
  );
});

describe("inspectPublicWebsite", () => {
  it.each(["http://public.test/company", "https://public.test/company"])(
    "reads a normal public %s target through a validated address",
    async (url) => {
      const { inspector, requests } = makeInspector([
        response("<html><title>Public Co</title><body>Hello company</body></html>"),
      ]);
      const result = await inspector(url);
      expect(result.title).toBe("Public Co");
      expect(result.text).toContain("Hello company");
      expect(requests[0]?.address).toBe("93.184.216.34");
    },
  );

  it("blocks localhost and loopback before requesting", async () => {
    const { inspector, requests } = makeInspector([]);
    await expect(inspector("http://127.0.0.1/")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      createWebsiteInspector({
        lookup: async () => [{ address: "127.0.0.1" }],
        request: async () => response("never"),
      })("http://localhost/"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(requests).toHaveLength(0);
  });

  it("rejects a redirect from a public hostname to a private address", async () => {
    const { inspector, requests } = makeInspector([
      response("", 302, { location: "http://127.0.0.1/internal" }),
    ]);
    await expect(inspector("http://public.test/start")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(requests).toHaveLength(1);
  });

  it("rejects embedded credentials and non-HTTP protocols", async () => {
    const { inspector } = makeInspector([]);
    await expect(inspector("http://user:pass@public.test/")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(inspector("ftp://public.test/file")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const oversized = response("", 200, {
      "content-length": String(MAX_WEBSITE_BYTES + 1),
    });
    const { inspector } = makeInspector([oversized]);
    await expect(inspector("http://public.test/large")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(oversized.aborted()).toBe(true);
  });

  it("aborts an oversized chunked response while streaming", async () => {
    const oversized = response([
      new Uint8Array(MAX_WEBSITE_BYTES),
      new Uint8Array([1]),
    ]);
    const { inspector } = makeInspector([oversized]);
    await expect(inspector("http://public.test/chunked")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(oversized.aborted()).toBe(true);
  });

  it("enforces the maximum redirect count", async () => {
    const responses = Array.from({ length: MAX_REDIRECTS + 1 }, () =>
      response("", 302, { location: "http://public.test/next" }),
    );
    const { inspector, requests } = makeInspector(responses);
    await expect(inspector("http://public.test/start")).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
    });
    expect(requests).toHaveLength(MAX_REDIRECTS + 1);
  });

  it("preserves controlled FlowFuel errors from the body cap", async () => {
    const oversized = response([new Uint8Array(MAX_WEBSITE_BYTES + 1)]);
    const { inspector } = makeInspector([oversized]);
    await expect(inspector("http://public.test/chunked")).rejects.toBeInstanceOf(
      FlowFuelError,
    );
  });
});
