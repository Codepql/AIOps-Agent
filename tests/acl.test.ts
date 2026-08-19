import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { aclMiddleware, bindSessionOwner, canAccessSession, getPrincipal } from '../src/security/acl.js';

describe('ACL policy', () => {
  it('enforces role policy for operational routes', async () => {
    const app = new Hono();
    app.use('*', aclMiddleware(true));
    app.post('/api/aiops', (c) => c.text('ok'));
    app.post('/api/upload', (c) => c.text('ok'));
    expect((await app.request('/api/aiops', { method: 'POST', headers: { 'x-user-id': 'alice', 'x-user-roles': 'reader' } })).status).toBe(403);
    expect((await app.request('/api/aiops', { method: 'POST', headers: { 'x-user-id': 'ops', 'x-user-roles': 'oncall' } })).status).toBe(200);
    expect((await app.request('/api/upload', { method: 'POST', headers: { 'x-user-id': 'admin', 'x-user-roles': 'admin' } })).status).toBe(200);
  });

  it('binds sessions to their creator and permits on-call override', () => {
    const reader = { id: 'alice', roles: ['reader'] as ('reader')[] };
    const other = { id: 'bob', roles: ['reader'] as ('reader')[] };
    bindSessionOwner('session-acl-test', reader.id);
    expect(canAccessSession('session-acl-test', reader)).toBe(true);
    expect(canAccessSession('session-acl-test', other)).toBe(false);
    expect(canAccessSession('session-acl-test', { id: 'ops', roles: ['oncall'] })).toBe(true);
  });

  it('parses identity and roles from request headers', () => {
    const app = new Hono();
    app.get('/', (c) => c.json(getPrincipal(c)));
    const response = app.request('/', { headers: { 'x-user-id': 'alice', 'x-user-roles': 'oncall,reader' } });
    return Promise.resolve(response).then(async (result) => {
      expect(await result.json()).toEqual({ id: 'alice', roles: ['oncall', 'reader'] });
    });
  });
});
