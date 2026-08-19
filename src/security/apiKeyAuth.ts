import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

function matches(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function apiKeyMiddleware(expectedKey: string): MiddlewareHandler {
  return async (context, next) => {
    if (!expectedKey) return next();
    const providedKey = context.req.header('x-api-key') ?? '';
    if (!matches(expectedKey, providedKey)) return context.json({ code: 401, message: 'Unauthorized' }, 401);
    return next();
  };
}
