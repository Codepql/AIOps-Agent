import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const settings = vi.hoisted(() => ({ staticDir: '' }));
vi.mock('../src/config.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/config.js')>();
  return { ...original, config: {
    ...original.config, apiKey: 'test-secret', aclEnabled: true,
    get staticDir() { return settings.staticDir; },
  } };
});

import { createApp } from '../src/app.js';

const headers = { 'x-api-key': 'test-secret', 'x-user-id': 'scraper', 'x-user-roles': 'observability' };

describe('HTTP access boundaries', () => {
  let root: string;
  const app = createApp();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'onecall-http-'));
    settings.staticDir = join(root, 'static');
    await mkdir(settings.staticDir);
    await mkdir(join(root, 'static-private'));
    await writeFile(join(settings.staticDir, 'app.js'), 'console.log("ok")');
    await writeFile(join(root, 'static-private', 'secret.txt'), 'private');
    await symlink(join(root, 'static-private'), join(settings.staticDir, 'outside'), 'junction');
  });

  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it.each(['/metrics', '/metrics/prometheus'])('protects %s with API key and ACL', async (path) => {
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(path, { headers: { ...headers, 'x-api-key': 'wrong' } })).status).toBe(401);
    expect((await app.request(path, { headers: { ...headers, 'x-user-roles': 'reader' } })).status).toBe(403);
    expect((await app.request(path, { headers })).status).toBe(200);
    expect((await app.request(path, { headers: { ...headers, 'x-user-roles': 'admin' } })).status).toBe(200);
  });

  it('serves regular static files and returns 404 for directories and missing files', async () => {
    const response = await app.request('/static/app.js');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/javascript');
    expect(await response.text()).toBe('console.log("ok")');
    expect((await app.request('/static/')).status).toBe(404);
    expect((await app.request('/static/missing.js')).status).toBe(404);
  });

  it('blocks links to files outside the static directory', async () => {
    expect((await app.request('/static/outside/secret.txt')).status).toBe(404);
  });

  it('allows browser preflight for document deletion with ACL headers', async () => {
    const response = await app.request('/api/index/document-id', {
      method: 'OPTIONS', headers: {
        origin: 'https://frontend.example',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'x-api-key,x-user-id,x-user-roles',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')?.split(',')).toContain('DELETE');
    const allowedHeaders = response.headers.get('access-control-allow-headers')?.toLowerCase().split(',');
    expect(allowedHeaders).toEqual(expect.arrayContaining(['x-api-key', 'x-user-id', 'x-user-roles']));
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.has('access-control-allow-credentials')).toBe(false);
  });
});
