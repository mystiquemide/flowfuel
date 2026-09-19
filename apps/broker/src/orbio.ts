import { z } from "zod";
import {
  FlowFuelError,
  mapUpstreamError,
  ORBIO_GATEWAY_BASE_URL,
} from "@flowfuel/core";

const modelSchema = z.object({
  id: z.string().min(1),
  object: z.string().optional(),
  created: z.number().optional(),
  owned_by: z.string().optional(),
  name: z.string().optional(),
  context_length: z.number().nullable().optional(),
  pricing: z
    .object({
      prompt: z.string().optional(),
      completion: z.string().optional(),
    })
    .loose()
    .optional(),
});

const modelListSchema = z.object({
  object: z.string().optional(),
  data: z.array(modelSchema),
});

const keyInfoSchema = z.object({
  object: z.literal("key").optional(),
  key: z
    .object({
      kind: z.string().optional(),
      prefix: z.string().optional(),
      label: z.string().nullable().optional(),
      created_at: z.union([z.string(), z.number(), z.null()]).optional(),
    })
    .optional(),
  balance: z.object({
    currency: z.string().optional(),
    available: z.string(),
    used: z.string(),
    available_micro_usd: z.coerce.number().int().nonnegative(),
    used_micro_usd: z.coerce.number().int().nonnegative(),
  }),
  rate_limit: z
    .object({
      requests_per_minute: z.number().optional(),
      concurrent: z.number().optional(),
    })
    .optional(),
});

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string().nullable(),
  tool_calls: z
    .array(
      z.object({
        id: z.string(),
        type: z.literal("function"),
        function: z.object({ name: z.string(), arguments: z.string() }),
      }),
    )
    .optional(),
});

const chatCompletionSchema = z.object({
  id: z.string().min(1),
  object: z.string().optional(),
  created: z.number().optional(),
  model: z.string().min(1),
  provider: z.string().nullable().optional(),
  choices: z
    .array(
      z.object({
        index: z.number().optional(),
        finish_reason: z.string().nullable().optional(),
        message: chatMessageSchema.optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative().optional(),
      cost: z.number().nonnegative(),
      server_tool_use: z
        .object({ web_search_requests: z.number().int().nonnegative().optional() })
        .optional(),
    })
    .loose(),
});

const upstreamErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
        type: z.string().optional(),
      })
      .optional(),
  })
  .loose();

export type OrbioModel = z.infer<typeof modelSchema>;
export type OrbioKeyInfo = z.infer<typeof keyInfoSchema>;
export type OrbioChatCompletion = z.infer<typeof chatCompletionSchema>;

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
}

export interface FunctionToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionInput {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  provider?: unknown;
}

export interface ChatCompletionResult {
  upstreamStatus: number;
  generationId: string;
  model: string;
  provider: string | null;
  content: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  balanceAfter: string | null;
  toolCalls: FunctionToolCall[];
  webSearchRequests: number;
}

export interface OrbioClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function redact(text: string, credential: string): string {
  if (!credential) return text;
  return text.split(credential).join("[redacted]");
}

async function parseUpstreamError(
  response: Response,
  credential: string,
): Promise<string | undefined> {
  try {
    const body = upstreamErrorSchema.parse(await response.json());
    const message = body.error?.message;
    return message ? redact(message, credential) : undefined;
  } catch {
    return undefined;
  }
}

function schemaMismatchError(path: string): FlowFuelError {
  return new FlowFuelError(
    "PROVIDER_FAILED",
    `Orbio response failed schema validation at ${path}`,
    { upstreamStatus: 200 },
  );
}

export function createOrbioClient(options: OrbioClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? ORBIO_GATEWAY_BASE_URL).replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRetries = options.maxRetries ?? 2;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;

  async function request(
    credential: string,
    path: string,
    init: RequestInit,
    context: { credentialPreviouslyVerified?: boolean } = {},
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(retryBaseDelayMs * 2 ** (attempt - 1));
      }
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          ...init,
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            Authorization: `Bearer ${credential}`,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
          },
        });
      } catch (error) {
        lastError = error;
        continue;
      }
      if (response.ok) return response;
      const upstreamMessage = await parseUpstreamError(response, credential);
      if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
        lastError = mapUpstreamError(response.status, context);
        continue;
      }
      const mapped = mapUpstreamError(response.status, context);
      const message = upstreamMessage
        ? `${mapped.message}: ${upstreamMessage}`
        : mapped.message;
      throw new FlowFuelError(mapped.code, redact(message, credential), {
        upstreamStatus: response.status,
        action: mapped.action,
      });
    }
    if (lastError instanceof FlowFuelError) throw lastError;
    const detail =
      lastError instanceof Error ? redact(lastError.message, credential) : null;
    throw new FlowFuelError(
      "PROVIDER_FAILED",
      `Orbio request failed${detail ? `: ${detail}` : ""}`,
    );
  }

  async function listModels(credential: string): Promise<OrbioModel[]> {
    const response = await request(credential, "/models", { method: "GET" });
    const parsed = modelListSchema.safeParse(await response.json());
    if (!parsed.success) throw schemaMismatchError("/models");
    return parsed.data.data;
  }

  async function getKeyInfo(
    credential: string,
    context: { credentialPreviouslyVerified?: boolean } = {},
  ): Promise<OrbioKeyInfo> {
    const response = await request(credential, "/key", { method: "GET" }, context);
    const parsed = keyInfoSchema.safeParse(await response.json());
    if (!parsed.success) throw schemaMismatchError("/key");
    return parsed.data;
  }

  async function createChatCompletion(
    credential: string,
    input: ChatCompletionInput,
    context: { credentialPreviouslyVerified?: boolean } = {},
  ): Promise<ChatCompletionResult> {
    const response = await request(
      credential,
      "/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          max_tokens: input.maxTokens,
          temperature: input.temperature ?? 0,
          ...(input.tools ? { tools: input.tools } : {}),
          ...(input.toolChoice ? { tool_choice: input.toolChoice } : {}),
          ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
          ...(input.provider ? { provider: input.provider } : {}),
        }),
      },
      context,
    );
    const balanceAfter = response.headers.get("x-orbio-balance");
    const parsed = chatCompletionSchema.safeParse(await response.json());
    if (!parsed.success) throw schemaMismatchError("/chat/completions");
    const body = parsed.data;
    const choice = body.choices[0];
    return {
      upstreamStatus: response.status,
      generationId: body.id,
      model: body.model,
      provider: body.provider ?? null,
      content: choice?.message?.content ?? null,
      promptTokens: body.usage.prompt_tokens,
      completionTokens: body.usage.completion_tokens,
      costUsd: body.usage.cost,
      balanceAfter,
      toolCalls: (choice?.message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      webSearchRequests: body.usage.server_tool_use?.web_search_requests ?? 0,
    };
  }

  return { listModels, getKeyInfo, createChatCompletion };
}

export type OrbioClient = ReturnType<typeof createOrbioClient>;
