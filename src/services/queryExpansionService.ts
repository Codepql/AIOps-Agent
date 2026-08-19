import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { config, requireModelApiKey } from '../config.js';
import { createChatModel } from '../core/llmFactory.js';
import { recordModelCall } from '../observability/metrics.js';

const technicalToken = /(?:[A-Za-z][A-Za-z0-9_.:/-]{2,}|\b\d{3,5}\b)/g;

/** Builds deterministic retrieval views; an LLM rewrite can be plugged in later. */
export function expandRetrievalQuery(query: string): string[] {
  const normalized = query.replace(/[\u3001，。！？；：]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const variants = new Set<string>([query.trim(), normalized]);
  const technicalTerms = normalized.match(technicalToken) ?? [];
  if (technicalTerms.length > 1) variants.add(technicalTerms.join(' '));
  for (const term of technicalTerms) {
    if (/\d{3,5}/.test(term) || /[-_:/.]/.test(term)) variants.add(term);
  }
  return [...variants].filter(Boolean).slice(0, 5);
}

const RewriteSchema = z.object({
  queries: z.array(z.string().min(1)).min(1).max(5),
});

export async function rewriteRetrievalQuery(query: string): Promise<string[]> {
  const fallback = expandRetrievalQuery(query);
  const started = Date.now();
  try {
    requireModelApiKey();
    const model = createChatModel({ model: config.langchainModel, temperature: 0, streaming: false });
    const result = await model.withStructuredOutput(RewriteSchema).invoke([
      new SystemMessage([
        '你是运维知识库检索查询改写器。',
        '从原始故障描述中提取服务名、环境、错误码、症状和排查动作，生成最多 5 条互补的短检索查询。',
        '保留原始技术名词和错误码，不要编造不存在的服务、时间或结论。',
      ].join('\n')),
      new HumanMessage(query),
    ]);
    const queries = [...new Set([query.trim(), ...result.queries.flatMap(expandRetrievalQuery)])].filter(Boolean).slice(0, 8);
    recordModelCall('query_rewrite', Date.now() - started);
    return queries;
  } catch {
    recordModelCall('query_rewrite', Date.now() - started, true);
    return fallback;
  }
}
