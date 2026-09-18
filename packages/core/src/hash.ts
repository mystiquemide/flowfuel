import { createHash } from "node:crypto";
import type { Task } from "./schemas";

/**
 * Server-side only. The broker hashes the canonical task before resolving a
 * credential so funded and unfunded attempts prove they ran the same work.
 */
export function canonicalTaskString(task: Task): string {
  return stableStringify({ type: task.type, input: task.input });
}

export function taskHash(task: Task): string {
  return sha256Hex(canonicalTaskString(task));
}

export function idempotencyKey(clientId: string, workflowRunId: string): string {
  return sha256Hex(`${clientId}:${workflowRunId}`);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
