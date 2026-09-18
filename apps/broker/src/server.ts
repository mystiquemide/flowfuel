import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  FlowFuelError,
  parseEncryptionKey,
  ROBINHOOD_CHAIN_ID,
  runRequestSchema,
  type ApiError,
} from "@flowfuel/core";
import {
  createAuditStore,
  createClientStore,
  createCredentialStore,
  createDb,
  createRunStore,
  databaseUrl,
} from "@flowfuel/db";

import { bearerToken, verifyWorkflowToken } from "./auth";
import { createOrbioClient } from "./orbio";
import { executeRun, type RunDeps } from "./run-client-task";

const MAX_BODY_BYTES = 64 * 1024;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function buildDeps(): RunDeps {
  const { db } = createDb(databaseUrl());
  return {
    clients: createClientStore(db),
    credentials: createCredentialStore(db),
    runs: createRunStore(db),
    audit: createAuditStore(db),
    orbio: createOrbioClient({ baseUrl: process.env.ORBIO_BASE_URL }),
    encryptionKey: parseEncryptionKey(env("CREDENTIAL_ENCRYPTION_KEY")),
    chainId: ROBINHOOD_CHAIN_ID,
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new FlowFuelError("VALIDATION_FAILED", "Request body too large");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new FlowFuelError("VALIDATION_FAILED", "Request body must be JSON");
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, error: FlowFuelError): void {
  const body: ApiError = {
    code: error.code,
    upstreamStatus: error.upstreamStatus,
    action: error.action,
  };
  const status =
    error.code === "UNAUTHORIZED"
      ? 401
      : error.code === "NOT_FOUND"
        ? 404
        : error.code === "CONFLICT"
          ? 409
          : 400;
  sendJson(res, status, body);
}

const deps = buildDeps();
const workflowToken = env("FLOWFUEL_WORKFLOW_TOKEN");

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (
      !verifyWorkflowToken(bearerToken(req.headers.authorization), workflowToken)
    ) {
      throw new FlowFuelError("UNAUTHORIZED", "Invalid workflow token");
    }

    if (req.method === "POST" && url.pathname === "/api/runs") {
      const parsed = runRequestSchema.safeParse(await readBody(req));
      if (!parsed.success) {
        throw new FlowFuelError(
          "VALIDATION_FAILED",
          "Run request failed schema validation",
        );
      }
      const response = await executeRun(deps, parsed.data);
      sendJson(res, response.status === "succeeded" ? 200 : 422, response);
      return;
    }

    const runMatch = /^\/api\/runs\/([0-9a-fA-F-]{36})$/.exec(url.pathname);
    if (req.method === "GET" && runMatch) {
      const run = await deps.runs.getById(runMatch[1]!);
      if (!run) throw new FlowFuelError("NOT_FOUND", "Unknown runId");
      sendJson(res, 200, {
        runId: run.id,
        status: run.status,
        clientId: run.clientId,
        taskHash: run.taskHash,
        generationId: run.generationId,
        costUsd: run.costUsd,
        balanceBefore: run.balanceBefore,
        balanceAfter: run.balanceAfter,
        errorCode: run.errorCode,
        upstreamStatus: run.upstreamStatus,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
      });
      return;
    }

    throw new FlowFuelError("NOT_FOUND", "Unknown route");
  } catch (error) {
    if (error instanceof FlowFuelError) {
      sendError(res, error);
    } else {
      sendError(
        res,
        new FlowFuelError("PROVIDER_FAILED", "Internal broker error"),
      );
    }
  }
});

const port = Number(process.env.BROKER_PORT ?? process.env.PORT ?? 4010);
server.listen(port, () => {
  console.log(`flowfuel broker listening on :${port}`);
});
