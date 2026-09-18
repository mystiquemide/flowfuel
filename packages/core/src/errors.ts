import { z } from "zod";

export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "CLIENT_UNFUNDED",
  "CREDENTIAL_REVOKED",
  "QUOTA_EXCEEDED",
  "PROVIDER_FAILED",
  "RECONCILIATION_FAILED",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

const CLIENT_ACTIONS: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Fix the request fields and try again.",
  UNAUTHORIZED: "Authenticate the request and try again.",
  NOT_FOUND: "Check the referenced record.",
  CONFLICT: "Resolve the conflicting state and retry.",
  RATE_LIMITED: "Wait for the rate limit window and retry.",
  CLIENT_UNFUNDED: "Activate CREDIT for this client wallet.",
  CREDENTIAL_REVOKED: "Re-sign the Orbio key message at a new epoch.",
  QUOTA_EXCEEDED: "Reduce the request size or top up the activated balance.",
  PROVIDER_FAILED: "Retry later. The provider request did not succeed.",
  RECONCILIATION_FAILED: "Investigate the run. Do not treat it as successful.",
};

export class FlowFuelError extends Error {
  readonly code: ErrorCode;
  readonly upstreamStatus: number | null;
  readonly action: string;

  constructor(
    code: ErrorCode,
    message: string,
    options: { upstreamStatus?: number | null; action?: string } = {},
  ) {
    super(message);
    this.name = "FlowFuelError";
    this.code = code;
    this.upstreamStatus = options.upstreamStatus ?? null;
    this.action = options.action ?? CLIENT_ACTIONS[code];
  }
}

export interface UpstreamErrorContext {
  /**
   * True when the stored credential previously passed a live balance read.
   * A 401 then means the key was revoked or rotated, not that the client
   * never funded.
   */
  credentialPreviouslyVerified?: boolean;
}

export function mapUpstreamError(
  status: number,
  context: UpstreamErrorContext = {},
): FlowFuelError {
  if (status === 401) {
    const code: ErrorCode = context.credentialPreviouslyVerified
      ? "CREDENTIAL_REVOKED"
      : "CLIENT_UNFUNDED";
    return new FlowFuelError(code, `Orbio rejected the credential`, {
      upstreamStatus: status,
    });
  }
  if (status === 402) {
    return new FlowFuelError(
      "QUOTA_EXCEEDED",
      "Orbio reports insufficient quota for this request",
      { upstreamStatus: status },
    );
  }
  if (status === 429 || status >= 500) {
    return new FlowFuelError(
      "PROVIDER_FAILED",
      `Orbio upstream failure (HTTP ${status})`,
      { upstreamStatus: status },
    );
  }
  return new FlowFuelError(
    "PROVIDER_FAILED",
    `Unexpected Orbio status (HTTP ${status})`,
    { upstreamStatus: status },
  );
}
