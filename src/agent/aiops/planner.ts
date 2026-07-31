import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { config } from '../../config.js';
import { createChatModel } from '../../core/llmFactory.js';
import { defaultLocalAgentTools, retrieveKnowledge } from '../../tools/index.js';
import { loadMcpToolsSafe } from '../mcpClient.js';
import type { PlanExecuteStateUpdate, PlanExecuteStateValue } from './state.js';
import { formatToolsDescription } from './utils.js';

const PlanSchema = z.object({
  steps: z.array(z.string()).min(1).max(8).describe('按顺序执行的具体步骤'),
});

export async function planner(state: PlanExecuteStateValue): Promise<PlanExecuteStateUpdate> {
  try {
    const experience = await retrieveKnowledge.invoke({ query: state.input }).catch(() => '');
    const tools = [...defaultLocalAgentTools, ...await loadMcpToolsSafe()];
    const model = createChatModel({ model: config.langchainModel, temperature: 0, streaming: false });
    const structured = model.withStructuredOutput(PlanSchema);
    const result = await structured.invoke([
      new SystemMessage([
        '你是专家级规划者，把复杂任务分解为简单、独立、可执行的步骤。',
        '职责仅是制定计划，工具调用由 Executor 完成。',
        `可用工具:\n${formatToolsDescription(tools)}`,
        experience ? `相关经验文档:\n${experience}` : '',
        '每一步应明确目标、所需工具及参数；步骤间有依赖关系；不要添加无关步骤。',
      ].filter(Boolean).join('\n\n')),
      new HumanMessage(state.input),
    ]);
    return { plan: result.steps };
  } catch {
    return { plan: ['收集相关信息', '分析数据', '生成报告'] };
  }
}
