import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { Document } from '@langchain/core/documents';
import { config, requireModelApiKey } from '../config.js';
import { createChatModel } from '../core/llmFactory.js';
import { rerankDocuments } from './rerankerService.js';
import { recordModelCall } from '../observability/metrics.js';

const RankingSchema = z.object({
  rankings: z.array(z.object({ id: z.string().min(1), score: z.number().min(0).max(1) })).max(20),
});

export async function modelRerankDocuments(query: string, candidates: Document[], limit: number): Promise<Document[]> {
  if (!candidates.length) return [];
  const started = Date.now();
  try {
    requireModelApiKey();
    const items = candidates.map((document, index) => ({
      id: typeof document.metadata._chunk_id === 'string' ? document.metadata._chunk_id : `candidate-${index}`,
      content: document.pageContent.slice(0, 1600),
    }));
    const model = createChatModel({ model: config.langchainModel, temperature: 0, streaming: false });
    const result = await model.withStructuredOutput(RankingSchema).invoke([
      new SystemMessage('你是检索结果重排器，只评估候选资料对用户问题的直接帮助程度，只返回候选 ID 和 0 到 1 的相关性分数。'),
      new HumanMessage(`用户问题:\n${query}\n\n候选资料:\n${JSON.stringify(items)}`),
    ]);
    const byId = new Map(items.map((item, index) => [item.id, candidates[index]! ]));
    const ranked = result.rankings
      .filter((item) => byId.has(item.id))
      .sort((left, right) => right.score - left.score)
      .map((item) => new Document({
        pageContent: byId.get(item.id)!.pageContent,
        metadata: { ...byId.get(item.id)!.metadata, _model_rerank_score: item.score },
      }));
    if (!ranked.length) throw new Error('模型未返回有效候选 ID');
    recordModelCall('reranker', Date.now() - started);
    return ranked.slice(0, limit);
  } catch {
    recordModelCall('reranker', Date.now() - started, true);
    return rerankDocuments(query, candidates, { limit });
  }
}
