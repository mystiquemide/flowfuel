import { lookup as dnsLookup } from "node:dns/promises";
import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
} from "node:http";
import { request as httpsRequest } from "node:https";
import ipaddr from "ipaddr.js";
import { FlowFuelError } from "@flowfuel/core";

export const MAX_WEBSITE_BYTES = 64 * 1024;
export const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

type AddressRecord = { address: string };
type LookupImpl = (
  hostname: string,
  options: { all: true },
) => Promise<AddressRecord[]>;

export interface PinnedResponse {
  status: number;
  headers: Headers;
  body: AsyncIterable<Uint8Array>;
  abort: () => void;
}

type RequestImpl = (url: URL, address: string) => Promise<PinnedResponse>;

export interface WebsiteToolOptions {
  lookup?: LookupImpl;
  request?: RequestImpl;
}

interface ValidatedUrl {
  url: URL;
  address: string;
}

function validationError(message: string): FlowFuelError {
  return new FlowFuelError("VALIDATION_FAILED", message);
}

/**
 * Only IANA global-unicast space is allowed. `ipaddr.js` owns the special
 * range table, which covers private, loopback, link-local, carrier-grade NAT,
 * documentation, benchmark, multicast, unspecified, mapped, and reserved
 * ranges without relying on string prefixes.
 */
export function isGlobalAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (
    parsed.kind() === "ipv6" &&
    "isIPv4MappedAddress" in parsed &&
    parsed.isIPv4MappedAddress()
  ) {
    return false;
  }
  return parsed.range() === "unicast";
}

function hostnameForSocket(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "");
}

async function defaultLookup(
  hostname: string,
  options: { all: true },
): Promise<AddressRecord[]> {
  return dnsLookup(hostname, options);
}

async function validateUrl(
  raw: string,
  lookup: LookupImpl,
): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw validationError("Agent tool requested an invalid URL");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password
  ) {
    throw validationError("Agent tool URL is not public HTTP(S)");
  }

  const hostname = hostnameForSocket(url);
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isGlobalAddress(address))
  ) {
    throw validationError("Agent tool cannot access private or reserved hosts");
  }

  // The address is carried into the request layer. The request layer connects
  // to this literal IP and never asks Node to resolve the original hostname.
  return { url, address: addresses[0]!.address };
}

function headersFromIncomingMessage(response: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Makes the socket connection to the already validated address. Host remains
 * the requested origin and HTTPS SNI remains the requested DNS name, so the
 * server receives correct virtual-host and certificate information while the
 * TCP destination stays pinned.
 */
function requestPinned(url: URL, address: string): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const requester = isHttps ? httpsRequest : httpRequest;
    const hostname = hostnameForSocket(url);
    const options = {
      protocol: url.protocol,
      hostname: address,
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        Host: url.host,
        "User-Agent": "FlowFuel-Lead-Intelligence/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      ...(isHttps && !ipaddr.isValid(hostname)
        ? { servername: hostname }
        : {}),
    };

    const request: ClientRequest = requester(options, (response) => {
      resolve({
        status: response.statusCode ?? 0,
        headers: headersFromIncomingMessage(response),
        body: response,
        abort: () => {
          response.destroy();
          request?.destroy();
        },
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request?.destroy(new Error("website request timed out"));
    });
    request.once("error", reject);
    request.end();
  });
}

async function readBoundedBody(response: PinnedResponse): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_WEBSITE_BYTES) {
    response.abort();
    throw validationError("Website is too large to inspect safely");
  }

  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > MAX_WEBSITE_BYTES) {
        response.abort();
        throw validationError("Website is too large to inspect safely");
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof FlowFuelError) throw error;
    throw new FlowFuelError(
      "PROVIDER_FAILED",
      "Website response could not be read safely",
    );
  }
  return Buffer.concat(chunks).toString("utf8");
}

function textFromHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6_000);
}

export function createWebsiteInspector(options: WebsiteToolOptions = {}) {
  const lookup = options.lookup ?? defaultLookup;
  const request = options.request ?? requestPinned;

  return async function inspectPublicWebsite(rawUrl: string): Promise<{
    url: string;
    title: string;
    text: string;
  }> {
    let validated = await validateUrl(rawUrl, lookup);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const response = await request(validated.url, validated.address);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        response.abort();
        if (!location || redirect === MAX_REDIRECTS) {
          throw new FlowFuelError(
            "PROVIDER_FAILED",
            "Website inspection redirect failed",
          );
        }
        let next: string;
        try {
          next = new URL(location, validated.url).toString();
        } catch {
          throw validationError("Agent tool redirect is not a valid URL");
        }
        validated = await validateUrl(next, lookup);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        response.abort();
        throw new FlowFuelError(
          "PROVIDER_FAILED",
          `Website inspection returned HTTP ${response.status}`,
        );
      }

      const html = await readBoundedBody(response);
      const title =
        /<title[^>]*>([\s\S]*?)<\/title>/i
          .exec(html)?.[1]
          ?.replace(/\s+/g, " ")
          .trim() ?? validated.url.hostname;
      return {
        url: validated.url.toString(),
        title,
        text: textFromHtml(html),
      };
    }
    throw new FlowFuelError("PROVIDER_FAILED", "Website inspection failed");
  };
}

export const inspectPublicWebsite = createWebsiteInspector();
