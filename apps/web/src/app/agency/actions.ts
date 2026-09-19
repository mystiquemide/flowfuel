"use server";

import { executeRun } from "@flowfuel/broker";
import {
  FlowFuelError,
  createClientRequestSchema,
  type RunResponse,
} from "@flowfuel/core";
import { createClientStore, createDb } from "@flowfuel/db";

import { databaseUrlFromEnv } from "../../lib/env";
import { runDeps } from "../../lib/services";
import { cookies } from "next/headers";
import { AGENCY_COOKIE, assertAgencySession } from "../../lib/agency-auth";

async function requireAgency(): Promise<void> {
  const token = (await cookies()).get(AGENCY_COOKIE)?.value;
  assertAgencySession(token);
}

export interface TestRunResult {
  ok: boolean;
  status: string;
  runId?: string;
  taskHash?: string;
  generationId?: string | null;
  costUsd?: string | null;
  balanceAfter?: string | null;
  upstreamStatus?: number | null;
  errorCode?: string;
  action?: string;
}

/**
 * Fires one real run through the same execution path n8n uses. This runs
 * server-side, so the workflow token and the client credential never reach
 * the browser. The verdict the agency sees is the actual run outcome.
 */
export async function runClientTest(clientId: string): Promise<TestRunResult> {
  try {
    await requireAgency();
    const response: RunResponse = await executeRun(runDeps(), {
      clientId,
      workflowRunId: `agency-test-${Date.now()}`,
      task: {
        type: "lead_intelligence",
        input:
          "Research Orbio at https://www.orbio.so as a prospective infrastructure partner for an AI automation agency.",
      },
      model: "mistralai/mistral-nemo",
      maxOutputTokens: 256,
    });
    if (response.status === "succeeded") {
      return {
        ok: true,
        status: "succeeded",
        runId: response.runId,
        generationId: response.receipt.generationId,
        costUsd: response.receipt.costUsd,
        balanceAfter: response.receipt.balanceAfter,
      };
    }
    return {
      ok: false,
      status: response.status,
      runId: response.runId,
      taskHash: response.taskHash,
      upstreamStatus: response.error.upstreamStatus,
      errorCode: response.error.code,
      action: response.error.action,
    };
  } catch (err) {
    if (err instanceof FlowFuelError) {
      return {
        ok: false,
        status: "error",
        errorCode: err.code,
        upstreamStatus: err.upstreamStatus,
        action: err.action,
      };
    }
    return { ok: false, status: "error", errorCode: "PROVIDER_FAILED" };
  }
}

export interface CreateClientResult {
  ok: boolean;
  error?: string;
  client?: {
    id: string;
    slug: string;
    displayName: string;
    connectPath: string;
  };
}

/**
 * Agency-side client creation. Server actions run inside the trusted
 * deployment, which is the local-only guard called for in the design notes.
 * The HTTP route (POST /api/clients) remains for token-authenticated callers.
 */
export async function createClient(input: {
  displayName: string;
  walletAddress: string;
}): Promise<CreateClientResult> {
  try {
    await requireAgency();
  } catch {
    return { ok: false, error: "Agency authentication required" };
  }
  const parsed = createClientRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid client name or wallet address" };
  }
  const slug = parsed.data.displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!slug) {
    return { ok: false, error: "Display name produces no usable slug" };
  }
  try {
    const { db } = createDb(databaseUrlFromEnv());
    const client = await createClientStore(db).create({
      slug,
      displayName: parsed.data.displayName,
      walletAddress: parsed.data.walletAddress,
    });
    return {
      ok: true,
      client: {
        id: client.id,
        slug: client.slug,
        displayName: client.displayName,
        connectPath: `/connect/${client.id}`,
      },
    };
  } catch (err) {
    if (err instanceof FlowFuelError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Failed to create client" };
  }
}
