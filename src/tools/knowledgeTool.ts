import { tool } from 'langchain';
import { z } from 'zod';
import type { Document } from '@langchain/core/documents';
import { vectorStoreManager } from '../services/vectorStoreManager.js';

export function formatDocuments(documents: Document[]): string {
  return documents.map((doc, index) => {
    const headers = ['h1', 'h2', 'h3'].map((key) => doc.metadata[key]).filter(Boolean).join(' > ');
    const source = String(doc.metadata._file_name ?? '未知来源');
    return [
      `【参考资料 ${index + 1}】`,
      headers ? `标题: ${headers}` : '',
      `来源: ${source}`,
      `内容:\n${doc.pageContent}`,
    ].filter(Boolean).join('\n');
  }).join('\n');
}

export const retrieveKnowledge = tool(
  async ({ query }) => {
    const documents = await vectorStoreManager.similaritySearch(query);
    return documents.length ? formatDocuments(documents) : '没有找到相关信息。';
  },
  {
    name: 'retrieve_knowledge',
    description: '从内部知识库检索与用户问题相关的专业资料。',
    schema: z.object({ query: z.string().min(1).describe('用户问题或检索词') }),
  },
);
