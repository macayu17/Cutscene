// What has to be true before this server faces the public internet: an upload
// cannot exhaust the disk, one client cannot create recordings without bound, and
// nothing is kept forever. None of it needs a database.

export const RETENTION_DAYS = Number(process.env.CUTSCENE_RETENTION_DAYS ?? 30);
export const STORE_LIMIT_BYTES = Number(process.env.CUTSCENE_STORE_LIMIT_BYTES ?? 20 * 1024 * 1024 * 1024);
export const WRITE_BURST = Number(process.env.CUTSCENE_WRITE_BURST ?? 20);
export const WRITE_PER_MINUTE = Number(process.env.CUTSCENE_WRITE_PER_MINUTE ?? 20);

export function expiryFrom(now: Date, days = RETENTION_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1_000).toISOString();
}

export function isExpired(expiresAt: string, now: Date): boolean {
  const deadline = Date.parse(expiresAt);
  // An unreadable expiry is treated as expired: a recording nobody can date is not
  // one this server should keep serving.
  return Number.isNaN(deadline) || deadline <= now.getTime();
}

export type RateLimiter = { take: (key: string, now: number) => boolean };

/**
 * Token bucket, one bucket per client. `capacity` is the burst, `perMinute` the
 * sustained rate.
 * ponytail: in memory, so limits reset on restart and are per process. Move to a
 * shared store only when this runs on more than one instance.
 */
export function createRateLimiter(capacity: number, perMinute: number): RateLimiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const refillPerMs = perMinute / 60_000;
  return {
    take(key, now) {
      const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
      const tokens = Math.min(capacity, bucket.tokens + (now - bucket.at) * refillPerMs);
      // Drop idle buckets so a stream of distinct clients cannot grow this forever.
      for (const [other, value] of buckets) {
        if (now - value.at > 3_600_000) buckets.delete(other);
      }
      if (tokens < 1) {
        buckets.set(key, { tokens, at: now });
        return false;
      }
      buckets.set(key, { tokens: tokens - 1, at: now });
      return true;
    },
  };
}

/** The client address, trusting a forwarding header only when the deployment says to. */
export function clientKey(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined,
  trustProxy = process.env.CUTSCENE_TRUST_PROXY === '1'): string {
  if (trustProxy) {
    const forwarded = headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? 'unknown';
}
