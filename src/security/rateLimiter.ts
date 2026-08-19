import type { MiddlewareHandler } from 'hono';

interface Bucket {
  startedAt: number;
  count: number;
}

export interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}

export function rateLimitMiddleware(options: RateLimitOptions): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? (() => Date.now());
  return async (context, next) => {
    if (options.maxRequests <= 0) return next();
    const key = context.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      ?? context.req.header('x-real-ip')
      ?? 'unknown';
    const currentTime = now();
    const existing = buckets.get(key);
    const bucket = !existing || currentTime - existing.startedAt >= options.windowMs
      ? { startedAt: currentTime, count: 0 }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);
    const remaining = Math.max(0, options.maxRequests - bucket.count);
    context.header('X-RateLimit-Limit', String(options.maxRequests));
    context.header('X-RateLimit-Remaining', String(remaining));
    context.header('X-RateLimit-Reset', String(Math.ceil((bucket.startedAt + options.windowMs) / 1000)));
    if (bucket.count > options.maxRequests) return context.json({ code: 429, message: 'Too Many Requests' }, 429);
    await next();
  };
}
