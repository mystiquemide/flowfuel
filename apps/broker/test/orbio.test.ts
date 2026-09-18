import { describe, expect, it, vi } from "vitest";
import { FlowFuelError } from "@flowfuel/core";
import { createOrbioClient } from "../src/orbio.js";

const CREDENTIAL = "sk-orb-0-testcredential";

const noSleep = () => Promise.resolve();

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function clientWith(fetchImpl: typeof fetch) {
  return createOrbioClient({
    baseUrl: "https://orbio.test/api/v1",
    fetchImpl,
    sleepImpl: noSleep,
    maxRetries: 2,
    retryBaseDelayMs: 1,
  });
}

const keyBody = {
  object: "key",
  key: { kind: "wallet", prefix: "sk-orb-0", label: null, created_at: null },
  balance: {
    currency: "USD",
    available: "0.009775",
    used: "0.000225",
    available_micro_usd: "9775",
    used_micro_usd: "225",
  },
  rate_limit: { requests_per_minute: 120, concurrent: 32 },
};

const completionBody = {
  id: "gen-1789751575-CyrHvdxgcahcaZ5WIfzE",
  object: "chat.completion",
  created: 1789751575,
  model: "google/gemini-2.5-flash",
  provider: "Google",
  system_fingerprint: null,
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "CLIENT_A_OK" },
    },
  ],
  usage: {
    prompt_tokens: 8,
    completion_tokens: 5,
    total_tokens: 13,
    cost: 0.0000149,
    is_byok: false,
    prompt_tokens_details: { cached_tokens: 0 },
    cost_details: { upstream_inference_cost: 0.0000149 },
  },
};

const chatInput = {
  model: "google/gemini-2.5-flash",
  messages: [{ role: "user" as const, content: "Reply with exactly OK" }],
  maxTokens: 12,
};

describe("orbio client fixtures", () => {
  it("parses GET /models 200 and tolerates unknown fields", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        object: "list",
        data: [
          {
            id: "google/gemini-2.5-flash",
            object: "model",
            owned_by: "google",
            name: "Gemini 2.5 Flash",
            context_length: 1000000,
            pricing: { prompt: "0.0000003", completion: "0.0000025" },
            future_field: { nested: true },
          },
        ],
        extra_top_level: "ignored",
      }),
    ) as unknown as typeof fetch;
    const models = await clientWith(fetchImpl).listModels(CREDENTIAL);
    expect(models).toHaveLength(1);
    expect(models[0]?.id).toBe("google/gemini-2.5-flash");
  });

  it("parses GET /key 200 balance", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, keyBody)) as unknown as typeof fetch;
    const info = await clientWith(fetchImpl).getKeyInfo(CREDENTIAL);
    expect(info.balance.available).toBe("0.009775");
    expect(info.balance.available_micro_usd).toBe(9775);
    expect(info.balance.used_micro_usd).toBe(225);
  });

  it("parses POST /chat/completions 200 with generation, cost, balance header", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, completionBody, { "x-orbio-balance": "0.008713" }),
    ) as unknown as typeof fetch;
    const result = await clientWith(fetchImpl).createChatCompletion(
      CREDENTIAL,
      chatInput,
    );
    expect(result.generationId).toBe("gen-1789751575-CyrHvdxgcahcaZ5WIfzE");
    expect(result.content).toBe("CLIENT_A_OK");
    expect(result.costUsd).toBeCloseTo(0.0000149, 7);
    expect(result.balanceAfter).toBe("0.008713");
    expect(result.promptTokens).toBe(8);
    expect(result.completionTokens).toBe(5);
  });

  it("sends Authorization and JSON body correctly", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, completionBody),
    ) as unknown as typeof fetch;
    await clientWith(fetchImpl).createChatCompletion(CREDENTIAL, chatInput);
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://orbio.test/api/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${CREDENTIAL}`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(body.max_tokens).toBe(12);
  });

  it("maps 401 to CLIENT_UNFUNDED for unverified credential and does not retry", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, {
        error: {
          code: "invalid_api_key",
          message: "This Orbio API key is unknown or has been revoked.",
          type: "invalid_request_error",
        },
      }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlowFuelError);
    expect((err as FlowFuelError).code).toBe("CLIENT_UNFUNDED");
    expect((err as FlowFuelError).upstreamStatus).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps 401 to CREDENTIAL_REVOKED when credential was previously verified", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: { code: "invalid_api_key" } }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL, { credentialPreviouslyVerified: true })
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("CREDENTIAL_REVOKED");
  });

  it("maps 402 to QUOTA_EXCEEDED and does not retry", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(402, {
        error: {
          code: "insufficient_quota",
          message: "Insufficient balance for this request.",
        },
      }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .createChatCompletion(CREDENTIAL, chatInput)
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("QUOTA_EXCEEDED");
    expect((err as FlowFuelError).upstreamStatus).toBe(402);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 429 within bound then raises PROVIDER_FAILED", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(429, { error: { code: "rate_limited" } }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL)
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("PROVIDER_FAILED");
    expect((err as FlowFuelError).upstreamStatus).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries 5xx within bound then raises PROVIDER_FAILED", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, { error: { message: "upstream down" } }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .listModels(CREDENTIAL)
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("PROVIDER_FAILED");
    expect((err as FlowFuelError).upstreamStatus).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("succeeds when a retryable failure recovers", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse(500, { error: { message: "boom" } })
        : jsonResponse(200, keyBody);
    }) as unknown as typeof fetch;
    const info = await clientWith(fetchImpl).getKeyInfo(CREDENTIAL);
    expect(info.balance.available_micro_usd).toBe(9775);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("raises PROVIDER_FAILED on network failure after retries", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL)
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("PROVIDER_FAILED");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("raises PROVIDER_FAILED on malformed 200 body", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, { unexpected: true }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL)
      .catch((e: unknown) => e);
    expect((err as FlowFuelError).code).toBe("PROVIDER_FAILED");
  });

  it("never leaks the credential into thrown errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(400, {
        error: {
          code: "bad_request",
          message: `key ${CREDENTIAL} is malformed`,
        },
      }),
    ) as unknown as typeof fetch;
    const err = await clientWith(fetchImpl)
      .getKeyInfo(CREDENTIAL)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FlowFuelError);
    expect(JSON.stringify(err)).not.toContain(CREDENTIAL);
    expect((err as FlowFuelError).message).toContain("[redacted]");
  });
});

const LIVE_CREDENTIAL = process.env.FLOWFUEL_TEST_CREDENTIAL;
const live = LIVE_CREDENTIAL ? describe : describe.skip;

live("orbio client live", () => {
  const liveClient = createOrbioClient({ timeoutMs: 20_000, maxRetries: 1 });

  it("reads the live balance", async () => {
    const info = await liveClient.getKeyInfo(LIVE_CREDENTIAL!);
    expect(info.balance.available_micro_usd).toBeGreaterThan(0);
    expect(info.key?.prefix).toBe("sk-orb-0");
  });

  it("runs a minimal live completion with a real generation id", async () => {
    const result = await liveClient.createChatCompletion(LIVE_CREDENTIAL!, {
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: "Reply with exactly FLOWFUEL_T05_OK" }],
      maxTokens: 12,
    });
    expect(result.generationId).toMatch(/^gen-/);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.content).toContain("FLOWFUEL_T05_OK");
  }, 30_000);
});
