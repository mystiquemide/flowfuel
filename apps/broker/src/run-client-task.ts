import {
  FlowFuelError,
  decryptRunResult,
  encryptRunResult,
  generationEvidenceSchema,
  idempotencyKey,
  leadIntelligenceResultSchema,
  reconcileBalances,
  taskHash,
  withDecryptedCredential,
  type AllowedModel,
  type AuditEventType,
  type ErrorCode,
  type RunReceiptSummary,
  type RunRequest,
  type RunResponse,
  type RunStatus,
} from "@flowfuel/core";
import type {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createRunStore,
  ClientRow,
  CompleteRunInput,
  RunRow,
} from "@flowfuel/db";

import type { OrbioClient } from "./orbio";
import { createRateLimiter, RUN_RATE_LIMIT, type RateLimiter } from "./rate-limit";
import { inspectPublicWebsite } from "./website-tool";

export interface RunDeps {
  clients: Pick<ReturnType<typeof createClientStore>, "getById">;
  credentials: Pick<ReturnType<typeof createCredentialStore>, "getForClient">;
  runs: Pick<
    ReturnType<typeof createRunStore>,
    "create" | "getById" | "getByIdempotencyKey" | "complete"
  >;
  audit: Pick<ReturnType<typeof createAuditStore>, "append">;
  activations?: { latestForClient(clientId: string): Promise<{ transactionHash: string } | null> };
  orbio: OrbioClient;
  encryptionKey: Buffer;
  chainId: number;
  rateLimiter?: RateLimiter;
  inspectWebsite?: typeof inspectPublicWebsite;
}

const TASK_PROMPTS: Record<RunRequest["task"]["type"], string> = {
  lead_intelligence:
    "You are a lead intelligence agent. Inspect the supplied public company website, identify evidence relevant to qualification, assess opportunity and risk, then recommend the next sales action. Never invent evidence.",
};

const INSPECT_TOOL = {
  type: "function",
  function: {
    name: "inspect_public_website",
    description: "Read a lead's public website before qualification.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public HTTP(S) company website URL" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
};

const LEAD_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    qualification: { type: "string", enum: ["high", "medium", "low"] },
    findings: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommendedAction: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "qualification", "findings", "risks", "recommendedAction", "confidence", "sources"],
  additionalProperties: false,
};

// In-process serialization. Single deployment runs one broker process, so a
// promise chain per client is sufficient. A multi-replica deployment would
// need a database advisory lock instead.
const clientLocks = new Map<string, Promise<unknown>>();
const inflight = new Map<string, Promise<RunResponse>>();
const defaultRateLimiter = createRateLimiter(RUN_RATE_LIMIT);

async function withClientLock<T>(
  clientId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = clientLocks.get(clientId) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  const stored = next.catch(() => undefined);
  clientLocks.set(clientId, stored);
  try {
    return await next;
  } finally {
    if (clientLocks.get(clientId) === stored) clientLocks.delete(clientId);
  }
}

const ERROR_STATUS: Record<string, Exclude<RunStatus, "running">> = {
  CLIENT_UNFUNDED: "client_unfunded",
  QUOTA_EXCEEDED: "quota_exceeded",
  VALIDATION_FAILED: "validation_failed",
};

const STATUS_AUDIT: Record<Exclude<RunStatus, "running">, AuditEventType> = {
  succeeded: "run_succeeded",
  client_unfunded: "run_unfunded",
  quota_exceeded: "run_quota_exceeded",
  provider_failed: "run_provider_failed",
  validation_failed: "run_validation_failed",
  reconciliation_failed: "run_reconciliation_failed",
};

function statusForError(code: string): Exclude<RunStatus, "running"> {
  return ERROR_STATUS[code] ?? "provider_failed";
}

function decimal(value: number | null | undefined): string | null {
  return value == null ? null : value.toFixed(6);
}

function receiptFromRun(run: RunRow, client: ClientRow): RunReceiptSummary {
  return {
    clientWallet: client.walletAddress as `0x${string}`,
    generationId: run.generationId,
    model: run.model as AllowedModel,
    taskHash: run.taskHash,
    costUsd: run.costUsd,
    balanceBefore: run.balanceBefore,
    balanceAfter: run.balanceAfter,
    generations: generationEvidenceSchema.array().parse(run.generations),
  };
}

async function responseFromRun(
  deps: RunDeps,
  run: RunRow,
  client: ClientRow,
): Promise<RunResponse> {
  if (run.status === "succeeded") {
    if (!run.resultCiphertext) {
      throw new FlowFuelError("PROVIDER_FAILED", "Stored run result is unavailable");
    }
    const result = decryptRunResult(
      deps.encryptionKey,
      Buffer.from(run.resultCiphertext, "base64"),
      { runId: run.id, clientId: run.clientId, taskHash: run.taskHash },
    ).toString("utf8");
    return {
      runId: run.id,
      status: "succeeded",
      result,
      receipt: receiptFromRun(run, client),
    };
  }
  const status = run.status === "running" ? "provider_failed" : run.status;
  return {
    runId: run.id,
    status: status as Exclude<RunStatus, "running" | "succeeded">,
    taskHash: run.taskHash,
    error: {
      code: (run.errorCode as ErrorCode | null) ?? "PROVIDER_FAILED",
      upstreamStatus: run.upstreamStatus,
      action: "The original request already ran. No second charge was made.",
    },
  };
}

/**
 * Executes one n8n task against the client's own Orbio balance. The client's
 * plaintext credential exists only inside withDecryptedCredential for the
 * duration of the gateway calls. There is no fallback credential path.
 */
export async function executeRun(
  deps: RunDeps,
  request: RunRequest,
): Promise<RunResponse> {
  const client = await deps.clients.getById(request.clientId);
  if (!client) {
    throw new FlowFuelError("NOT_FOUND", "Unknown clientId", {
      action: "Register the client before running tasks.",
    });
  }

  const hash = taskHash(request.task);
  const key = idempotencyKey(request.clientId, request.workflowRunId);

  const existing = await deps.runs.getByIdempotencyKey(key);
  if (existing) {
    if (existing.status !== "running") {
      return responseFromRun(deps, existing, client);
    }
    const pending = inflight.get(key);
    if (pending) return pending;
    throw new FlowFuelError(
      "CONFLICT",
      "A run with this workflowRunId is already in progress",
      { action: "Wait for the in-flight run to finish, then retry." },
    );
  }

  const promise = withClientLock(request.clientId, () =>
    executeLocked(deps, request, client, hash, key),
  );
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

async function executeLocked(
  deps: RunDeps,
  request: RunRequest,
  client: ClientRow,
  hash: string,
  key: string,
): Promise<RunResponse> {
  // Re-check inside the lock: a queued duplicate must not create a second row.
  const existing = await deps.runs.getByIdempotencyKey(key);
  if (existing) return responseFromRun(deps, existing, client);

  if (client.status === "paused") {
    throw new FlowFuelError(
      "CLIENT_PAUSED",
      "Client automation is paused",
    );
  }

  const limiter = deps.rateLimiter ?? defaultRateLimiter;
  if (!limiter.allow(request.clientId)) {
    throw new FlowFuelError(
      "RATE_LIMITED",
      "Run rate limit exceeded for this client",
      { action: "Wait for the rate limit window and retry." },
    );
  }

  const activation = await deps.activations?.latestForClient(request.clientId).catch(() => null);
  const run = await deps.runs.create({
    clientId: request.clientId,
    workflowRunId: request.workflowRunId,
    taskType: request.task.type,
    model: request.model,
    taskHash: hash,
    idempotencyKey: key,
    activationTxHash: activation?.transactionHash ?? null,
  });

  const finish = async (
    status: Exclude<RunStatus, "running">,
    fields: Omit<CompleteRunInput, "status"> = {},
  ): Promise<RunRow> => {
    const completed = await deps.runs.complete(run.id, { status, ...fields });
    const final = completed ?? { ...run, status, ...fields };
    await deps.audit.append({
      clientId: client.id,
      actorType: "workflow",
      eventType: STATUS_AUDIT[status],
      publicData: {
        runId: run.id,
        status,
        generationId: fields.generationId ?? null,
        costUsd: fields.costUsd ?? null,
        taskHash: hash,
        upstreamStatus: fields.upstreamStatus ?? null,
      },
    });
    return final as RunRow;
  };

  const credential = await deps.credentials.getForClient(request.clientId);
  if (!credential) {
    const failed = await finish("client_unfunded", {
      errorCode: "CLIENT_UNFUNDED",
    });
    return {
      runId: failed.id,
      status: "client_unfunded",
      taskHash: hash,
      error: {
        code: "CLIENT_UNFUNDED",
        upstreamStatus: null,
        action: "Activate CREDIT for this client wallet.",
      },
    };
  }

  const verified = credential.verifiedAt != null;
  let balanceBeforeSeen: string | null = null;
  let balanceAfterSeen: string | null = null;
  const generationEvidenceSeen: Array<{
    generationId: string;
    phase: "plan" | "analysis";
    costUsd: string;
    promptTokens: number;
    completionTokens: number;
  }> = [];
  let totalCostSeen = 0;

  try {
    const outcome = await withDecryptedCredential(
      deps.encryptionKey,
      Buffer.from(credential.ciphertext, "base64"),
      {
        clientId: client.id,
        walletAddress: credential.walletAddress,
        chainId: deps.chainId,
        epoch: credential.epoch,
      },
      async (blob) => {
        const plaintext = blob.toString("utf8");
        const context = { credentialPreviouslyVerified: verified };
        const before = await deps.orbio.getKeyInfo(plaintext, context);
        balanceBeforeSeen = before.balance.available;
        const plan = await deps.orbio.createChatCompletion(
          plaintext,
          {
            model: request.model,
            messages: [
              { role: "system", content: TASK_PROMPTS[request.task.type] },
              { role: "user", content: `Lead input:\n${request.task.input}\n\nCall inspect_public_website before deciding.` },
            ],
            maxTokens: Math.min(request.maxOutputTokens, 400),
            tools: [INSPECT_TOOL],
            toolChoice: "required",
          },
          context,
        );
        generationEvidenceSeen.push({
          generationId: plan.generationId,
          phase: "plan",
          costUsd: decimal(plan.costUsd)!,
          promptTokens: plan.promptTokens,
          completionTokens: plan.completionTokens,
        });
        totalCostSeen += plan.costUsd;
        const call = plan.toolCalls.find((item) => item.name === "inspect_public_website");
        if (!call) {
          throw new FlowFuelError("PROVIDER_FAILED", "Agent did not request the required website inspection");
        }
        let requestedUrl: unknown;
        try {
          requestedUrl = JSON.parse(call.arguments).url;
        } catch {
          throw new FlowFuelError("PROVIDER_FAILED", "Agent returned invalid tool arguments");
        }
        if (typeof requestedUrl !== "string") {
          throw new FlowFuelError("PROVIDER_FAILED", "Agent omitted the website URL");
        }
        const observation = await (deps.inspectWebsite ?? inspectPublicWebsite)(requestedUrl);
        const completion = await deps.orbio.createChatCompletion(
          plaintext,
          {
            model: request.model,
            messages: [
              { role: "system", content: TASK_PROMPTS[request.task.type] },
              { role: "user", content: `Original lead input:\n${request.task.input}\n\nObserved website: ${observation.title}\nURL: ${observation.url}\nPublic page text:\n${observation.text}` },
            ],
            maxTokens: request.maxOutputTokens,
            responseFormat: {
              type: "json_schema",
              json_schema: { name: "lead_intelligence", strict: true, schema: LEAD_RESULT_JSON_SCHEMA },
            },
            provider: { require_parameters: true },
          },
          context,
        );
        generationEvidenceSeen.push({
          generationId: completion.generationId,
          phase: "analysis",
          costUsd: decimal(completion.costUsd)!,
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
        });
        totalCostSeen += completion.costUsd;
        let parsedResult: unknown;
        try {
          parsedResult = JSON.parse(completion.content ?? "");
        } catch {
          throw new FlowFuelError("PROVIDER_FAILED", "Agent returned invalid JSON");
        }
        const result = leadIntelligenceResultSchema.parse(parsedResult);
        let balanceAfter: string | null = null;
        let afterReadError: FlowFuelError | null = null;
        try {
          // Multi-generation requests can leave a short-lived gateway reserve
          // in the balance. Poll until the measured delta matches the sum of
          // reported generation costs, or fail closed after a bounded wait.
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const after = await deps.orbio.getKeyInfo(plaintext, context);
            balanceAfter = after.balance.available;
            balanceAfterSeen = balanceAfter;
            if (reconcileBalances(before.balance.available, balanceAfter, totalCostSeen)) break;
            if (attempt < 11) {
              await new Promise((resolve) => setTimeout(resolve, 1_000));
            }
          }
        } catch (error) {
          // The completion already charged the client. A failed balance
          // re-read means the charge cannot be verified, which must never
          // present as a clean success.
          afterReadError =
            error instanceof FlowFuelError
              ? error
              : new FlowFuelError("PROVIDER_FAILED", "Balance re-read failed");
        }
        return { before, completion, balanceAfter, afterReadError, result };
      },
    );

    const fields = {
      generationId: outcome.completion.generationId,
      balanceBefore: outcome.before.balance.available,
      balanceAfter: outcome.balanceAfter,
      costUsd: decimal(totalCostSeen),
      promptTokens: generationEvidenceSeen.reduce((sum, item) => sum + item.promptTokens, 0),
      completionTokens: generationEvidenceSeen.reduce((sum, item) => sum + item.completionTokens, 0),
      upstreamStatus: outcome.completion.upstreamStatus,
      generations: generationEvidenceSeen,
      resultCiphertext: encryptRunResult(
        deps.encryptionKey,
        JSON.stringify(outcome.result),
        { runId: run.id, clientId: client.id, taskHash: hash },
      ).toString("base64"),
    };

    const reconciled =
      outcome.afterReadError === null &&
      outcome.balanceAfter !== null &&
      outcome.completion.generationId.length > 0 &&
      outcome.completion.costUsd != null &&
      reconcileBalances(
        fields.balanceBefore,
        outcome.balanceAfter,
        totalCostSeen,
      );

    if (!reconciled) {
      const failed = await finish("reconciliation_failed", {
        ...fields,
        errorCode: "RECONCILIATION_FAILED",
        upstreamStatus:
          outcome.afterReadError?.upstreamStatus ?? fields.upstreamStatus,
      });
      return {
        runId: failed.id,
        status: "reconciliation_failed",
        taskHash: hash,
        error: {
          code: "RECONCILIATION_FAILED",
          upstreamStatus:
            outcome.afterReadError?.upstreamStatus ?? fields.upstreamStatus,
          action: "Investigate the run. Do not treat it as successful.",
        },
      };
    }

    const succeeded = await finish("succeeded", fields);

    return {
      runId: succeeded.id,
      status: "succeeded",
      result: JSON.stringify(outcome.result),
      receipt: receiptFromRun(succeeded, client),
    };
  } catch (error) {
    const mapped =
      error instanceof FlowFuelError
        ? error
        : new FlowFuelError("PROVIDER_FAILED", "Unexpected run failure");
    if (totalCostSeen > 0 && balanceAfterSeen === null) {
      try {
        const credentialAgain = await deps.credentials.getForClient(request.clientId);
        if (credentialAgain) {
          balanceAfterSeen = await withDecryptedCredential(
            deps.encryptionKey,
            Buffer.from(credentialAgain.ciphertext, "base64"),
            { clientId: client.id, walletAddress: credentialAgain.walletAddress, chainId: deps.chainId, epoch: credentialAgain.epoch },
            async (blob) => (await deps.orbio.getKeyInfo(blob.toString("utf8"), { credentialPreviouslyVerified: verified })).balance.available,
          );
        }
      } catch {}
    }
    const failed = await finish(statusForError(mapped.code), {
      errorCode: mapped.code,
      upstreamStatus: mapped.upstreamStatus,
      balanceBefore: balanceBeforeSeen,
      balanceAfter: balanceAfterSeen,
      costUsd: totalCostSeen > 0 ? decimal(totalCostSeen) : null,
      generations: generationEvidenceSeen,
    });
    return {
      runId: failed.id,
      status: failed.status as Exclude<RunStatus, "running" | "succeeded">,
      taskHash: hash,
      error: {
        code: mapped.code,
        upstreamStatus: mapped.upstreamStatus,
        action: mapped.action,
      },
    };
  }
}
