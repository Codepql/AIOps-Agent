import { describe, expect, it, vi } from 'vitest';

vi.mock('mammoth', () => ({ default: {
  extractRawText: vi.fn().mockResolvedValue({ value: 'DOCX paragraph' }),
  convertToHtml: vi.fn().mockResolvedValue({ value: '<h1>Runbook</h1><p>DOCX paragraph</p>' }),
} }));
vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() { return { pages: [{ num: 1, text: 'page one' }, { num: 2, text: 'page two' }] }; }
  },
}));

describe('document parser', () => {
  it('extracts DOCX text through mammoth', async () => {
    const { DocumentParserService } = await import('../src/services/documentParserService.js');
    const fs = await import('node:fs/promises');
    const path = 'tests/.fixture.docx';
    await fs.writeFile(path, Buffer.from('fixture'));
    try {
      await expect(new DocumentParserService().parseFile(path)).resolves.toEqual([{ content: 'DOCX paragraph', metadata: { titlePath: ['Runbook'] } }]);
    } finally {
      await fs.unlink(path);
    }
  });

  it('keeps PDF page boundaries as metadata', async () => {
    const { DocumentParserService } = await import('../src/services/documentParserService.js');
    const fs = await import('node:fs/promises');
    const path = 'tests/.fixture.pdf';
    await fs.writeFile(path, Buffer.from('%PDF fixture'));
    try {
      await expect(new DocumentParserService().parseFile(path)).resolves.toEqual([
        { content: 'page one', metadata: { page: 1 } },
        { content: 'page two', metadata: { page: 2 } },
      ]);
    } finally {
      await fs.unlink(path);
    }
  });
});
