import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware } from '../src/security/rateLimiter.js';

describe('rate limiter', () => {
  it('rejects requests after the configured window quota', async () => {
    let timestamp = 1_000;
    const app = new Hono();
    app.use('/limited', rateLimitMiddleware({ maxRequests: 2, windowMs: 100, now: () => timestamp }));
    app.get('/limited', (context) => context.text('ok'));
    const first = await app.request('/limited', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    const second = await app.request('/limited', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    const blocked = await app.request('/limited', { headers: { 'x-forwarded-for': '1.2.3.4' } });
    expect(first.status).toBe(200);
    expect(second.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(blocked.status).toBe(429);
    timestamp += 100;
    expect((await app.request('/limited', { headers: { 'x-forwarded-for': '1.2.3.4' } })).status).toBe(200);
  });
});
