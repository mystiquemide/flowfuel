import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time workflow token check. Hashing both sides first makes the
 * comparison length-independent so the token length itself never leaks
 * through timing.
 */
export function verifyWorkflowToken(
  provided: string | null | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim();
}
