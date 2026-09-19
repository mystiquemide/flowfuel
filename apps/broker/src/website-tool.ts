import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { FlowFuelError } from "@flowfuel/core";

const MAX_BYTES = 64 * 1024;
const MAX_REDIRECTS = 3;

function privateIp(address: string): boolean {
  if (address === "::1" || address === "0.0.0.0") return true;
  if (address.startsWith("10.") || address.startsWith("127.")) return true;
  if (address.startsWith("192.168.") || address.startsWith("169.254.")) return true;
  const second = Number(address.split(".")[1]);
  if (address.startsWith("172.") && second >= 16 && second <= 31) return true;
  const lower = address.toLowerCase();
  return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

async function validateUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FlowFuelError("VALIDATION_FAILED", "Agent tool requested an invalid URL");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new FlowFuelError("VALIDATION_FAILED", "Agent tool URL is not public HTTP(S)");
  }
  if (url.hostname === "localhost") {
    throw new FlowFuelError("VALIDATION_FAILED", "Agent tool cannot access private hosts");
  }
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => privateIp(address))) {
    throw new FlowFuelError("VALIDATION_FAILED", "Agent tool cannot access private hosts");
  }
  return url;
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

export async function inspectPublicWebsite(rawUrl: string): Promise<{
  url: string;
  title: string;
  text: string;
}> {
  let url = await validateUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "FlowFuel-Lead-Intelligence/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new FlowFuelError("PROVIDER_FAILED", "Website inspection redirect failed");
      }
      url = await validateUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new FlowFuelError("PROVIDER_FAILED", `Website inspection returned HTTP ${response.status}`);
    }
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES) {
      throw new FlowFuelError("VALIDATION_FAILED", "Website is too large to inspect safely");
    }
    const html = (await response.text()).slice(0, MAX_BYTES);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? url.hostname;
    return { url: url.toString(), title, text: textFromHtml(html) };
  }
  throw new FlowFuelError("PROVIDER_FAILED", "Website inspection failed");
}
