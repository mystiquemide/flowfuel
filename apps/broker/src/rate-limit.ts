/**
 * Fixed-window rate limiter for the run path. Two buckets are checked for
 * every new run: a per-client cap so one client cannot burn its balance
 * through a burst, and a global cap that keeps the broker under Orbio's own
 * per-key request limit (120 requests/minute). Replays never reach the
 * limiter because idempotent lookups return before it runs.
 */
export interface RateLimiterOptions {
  perClientPerMinute: number;
  globalPerMinute: number;
  now?: () => number;
}

const MINUTE_MS = 60_000;

export interface RateLimiter {
  /** Returns true when the key may start a new run in this window. */
  allow(key: string): boolean;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, { start: number; count: number }>();

  const hit = (key: string, max: number): boolean => {
    const current = windows.get(key);
    const t = now();
    if (!current || t - current.start >= MINUTE_MS) {
      windows.set(key, { start: t, count: 1 });
      return true;
    }
    if (current.count >= max) return false;
    current.count += 1;
    return true;
  };

  return {
    allow(key: string): boolean {
      // The global bucket is consumed first so a rejected client does not
      // burn its own window while the broker is saturated.
      if (!hit("global", options.globalPerMinute)) return false;
      return hit(`client:${key}`, options.perClientPerMinute);
    },
  };
}

export const RUN_RATE_LIMIT = {
  perClientPerMinute: 20,
  globalPerMinute: 120,
} as const;
