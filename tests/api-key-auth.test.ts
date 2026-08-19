import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { apiKeyMiddleware } from '../src/security/apiKeyAuth.js';

describe('API key authentication', () => {
  function createProtectedApp(key: string) {
    const app = new Hono();
    app.use('/protected', apiKeyMiddleware(key));
    app.get('/protected', (context) => context.json({ ok: true }));
    return app;
  }

  it('allows requests when authentication is disabled', async () => {
    expect((await createProtectedApp('').request('/protected')).status).toBe(200);
  });

  it('requires and validates the configured key', async () => {
    const app = createProtectedApp('secret');
    expect((await app.request('/protected')).status).toBe(401);
    expect((await app.request('/protected', { headers: { 'x-api-key': 'wrong' } })).status).toBe(401);
    expect((await app.request('/protected', { headers: { 'x-api-key': 'secret' } })).status).toBe(200);
  });
});
