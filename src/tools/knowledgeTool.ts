import { tool } from 'langchain';
import { z } from 'zod';
import type { Document } from '@langchain/core/documents';
import { vectorStoreManager } from '../services/vectorStoreManager.js';
import { rewriteRetrievalQuery } from '../services/queryExpansionService.js';
import { config } from '../config.js';
import { modelRerankDocuments } from '../services/modelRerankerService.js';
import { recordToolCall } from '../observability/metrics.js';

export function formatDocuments(documents: Document[]): string {
  return documents.map((doc, index) => {
    const headers = ['h1', 'h2', 'h3'].map((key) => doc.metadata[key]).filter(Boolean).join(' > ');
    const source = String(doc.metadata._file_name ?? '未知来源');
    const evidence = doc.metadata._chunk_id
      ? `证据ID: ${String(doc.metadata._chunk_id)}${doc.metadata._rrf_score ? ` (RRF: ${Number(doc.metadata._rrf_score).toFixed(4)})` : ''}${doc.metadata._model_rerank_score ? ` (模型重排: ${Number(doc.metadata._model_rerank_score).toFixed(4)})` : ''}${doc.metadata._rerank_score ? ` (本地重排: ${Number(doc.metadata._rerank_score).toFixed(4)})` : ''}`
      : '';
    return [
      `【参考资料 ${index + 1}】`,
      headers ? `标题: ${headers}` : '',
      `来源: ${source}`,
      evidence,
      `内容:\n${doc.pageContent}`,
    ].filter(Boolean).join('\n');
  }).join('\n');
}

export const retrieveKnowledge = tool(
  async ({ query }) => {
    const started = Date.now();
    try {
      const candidates = await vectorStoreManager.hybridSearchMany(await rewriteRetrievalQuery(query), Math.max(config.ragTopK * 4, 10));
      const documents = await modelRerankDocuments(query, candidates, config.ragTopK);
      return documents.length ? formatDocuments(documents) : '没有找到相关信息。';
    } catch (error) {
      throw error;
    } finally {
      recordToolCall('retrieve_knowledge', Date.now() - started);
    }
  },
  {
    name: 'retrieve_knowledge',
    description: '从内部知识库检索与用户问题相关的专业资料。',
    schema: z.object({ query: z.string().min(1).describe('用户问题或检索词') }),
  },
);
