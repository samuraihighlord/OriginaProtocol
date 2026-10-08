const hits = new Map<string, number[]>();

/**
 * Sliding-window limiter, per key. In memory, so on serverless hosting it is per instance: a cheap brake on abuse
 * of the provider wallet, not a hard guarantee. Returns 0 when allowed, else the seconds until the next slot opens.
 */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
  }
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return 0;
}
