import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Prisma schema', () => {
  it('defines the project entities and their required relations', async () => {
    const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

    expect(schema).toContain('model ChatSession');
    expect(schema).toContain('model ChatMessage');
    expect(schema).toContain('model KnowledgeDocument');
    expect(schema).toContain('model KnowledgeChunk');
    expect(schema).toContain('@relation(fields: [sessionId], references: [id], onDelete: Cascade)');
    expect(schema).toContain('@relation(fields: [documentId], references: [id], onDelete: Cascade)');
  });
});
