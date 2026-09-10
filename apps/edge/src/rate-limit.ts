/**
 * Fixed-window rate limiter: 30 requests per minute per client key.
 * Missing binding fails closed (deny with RATE_LIMITED shape at the route).
 */

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterMs: number;
};

export function createRateLimiter(input: { limitPerMinute?: number; windowMs?: number } = {}) {
  const limit = input.limitPerMinute ?? 30;
  const windowMs = input.windowMs ?? 60 * 1000;
  const hits = new Map<string, number[]>();
  return {
    check(key: string, nowMs: number): RateLimitDecision {
      const seen = (hits.get(key) ?? []).filter((at) => at > nowMs - windowMs);
      if (seen.length >= limit) {
        const oldest = seen[0] ?? nowMs;
        hits.set(key, seen);
        return { allowed: false, retryAfterMs: oldest + windowMs - nowMs };
      }
      seen.push(nowMs);
      hits.set(key, seen);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
