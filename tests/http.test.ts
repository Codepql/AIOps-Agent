import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('HTTP contracts', () => {
  const app = createApp();

  it('serves the migrated frontend', async () => {
    const response = await app.request('/');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves a caller-provided request id', async () => {
    const response = await app.request('/', { headers: { 'x-request-id': 'trace-123' } });
    expect(response.headers.get('x-request-id')).toBe('trace-123');
  });

  it('rejects invalid chat requests with 422', async () => {
    const response = await app.request('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    expect(response.status).toBe(422);
  });

  it('rejects path traversal in directory indexing', async () => {
    const response = await app.request('/api/index_directory?directory_path=..', { method: 'POST' });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ detail: expect.stringContaining('uploads') });
  });
});
