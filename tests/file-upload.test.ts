import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ config: { uploadDir: 'C:/srv/onecall/uploads' } }));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('../src/services/vectorIndexService.js', () => ({
  vectorIndexService: { indexSingleFile: vi.fn().mockResolvedValue(undefined) },
}));

describe('file upload response', () => {
  it('returns a relative file path instead of the server filesystem path', async () => {
    const { fileApi } = await import('../src/api/file.js');
    const body = new FormData();
    body.append('file', new File(['runbook'], 'runbook.md', { type: 'text/markdown' }));

    const response = await fileApi.request('/upload', { method: 'POST', body });
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { filename: string; file_path: string } };
    expect(payload.data.filename).toBe('runbook.md');
    expect(payload.data.file_path).toBe('runbook.md');
    expect(payload.data.file_path).not.toContain('C:');
    expect(payload.data.file_path).not.toContain('uploads');
  });
});
