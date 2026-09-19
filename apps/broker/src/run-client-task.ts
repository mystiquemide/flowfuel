import {
  FlowFuelError,
  idempotencyKey,
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

export interface RunDeps {
  clients: Pick<ReturnType<typeof createClientStore>, "getById">;
  credentials: Pick<ReturnType<typeof createCredentialStore>, "getForClient">;
  runs: Pick<
    ReturnType<typeof createRunStore>,
    "create" | "getById" | "getByIdempotencyKey" | "complete"
  >;
  audit: Pick<ReturnType<typeof createAuditStore>, "append">;
  orbio: OrbioClient;
  encryptionKey: Buffer;
  chainId: number;
  rateLimiter?: RateLimiter;
}

const TASK_PROMPTS: Record<RunRequest["task"]["type"], string> = {
  lead_summary:
    "You are a concise sales assistant. Summarize the qualified lead and propose the next action.",
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
  };
}

function responseFromRun(run: RunRow, client: ClientRow): RunResponse {
  if (run.status === "succeeded") {
    return {
      runId: run.id,
      status: "succeeded",
      result: "",
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
      return responseFromRun(existing, client);
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
  if (existing) return responseFromRun(existing, client);

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

  const run = await deps.runs.create({
    clientId: request.clientId,
    workflowRunId: request.workflowRunId,
    taskType: request.task.type,
    model: request.model,
    taskHash: hash,
    idempotencyKey: key,
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
        const completion = await deps.orbio.createChatCompletion(
          plaintext,
          {
            model: request.model,
            messages: [
              { role: "system", content: TASK_PROMPTS[request.task.type] },
              { role: "user", content: request.task.input },
            ],
            maxTokens: request.maxOutputTokens,
          },
          context,
        );
        let balanceAfter: string | null = null;
        let afterReadError: FlowFuelError | null = null;
        try {
          const after = await deps.orbio.getKeyInfo(plaintext, context);
          balanceAfter = after.balance.available;
        } catch (error) {
          // The completion already charged the client. A failed balance
          // re-read means the charge cannot be verified, which must never
          // present as a clean success.
          afterReadError =
            error instanceof FlowFuelError
              ? error
              : new FlowFuelError("PROVIDER_FAILED", "Balance re-read failed");
        }
        return { before, completion, balanceAfter, afterReadError };
      },
    );

    const fields = {
      generationId: outcome.completion.generationId,
      balanceBefore: outcome.before.balance.available,
      balanceAfter: outcome.balanceAfter,
      costUsd: decimal(outcome.completion.costUsd),
      promptTokens: outcome.completion.promptTokens,
      completionTokens: outcome.completion.completionTokens,
      upstreamStatus: outcome.completion.upstreamStatus,
    };

    const reconciled =
      outcome.afterReadError === null &&
      outcome.balanceAfter !== null &&
      outcome.completion.generationId.length > 0 &&
      outcome.completion.costUsd != null &&
      reconcileBalances(
        fields.balanceBefore,
        outcome.balanceAfter,
        outcome.completion.costUsd,
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
      result: outcome.completion.content ?? "",
      receipt: receiptFromRun(succeeded, client),
    };
  } catch (error) {
    const mapped =
      error instanceof FlowFuelError
        ? error
        : new FlowFuelError("PROVIDER_FAILED", "Unexpected run failure");
    const failed = await finish(statusForError(mapped.code), {
      errorCode: mapped.code,
      upstreamStatus: mapped.upstreamStatus,
      balanceBefore: balanceBeforeSeen,
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
