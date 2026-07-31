import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { config } from '../../config.js';
import { createChatModel } from '../../core/llmFactory.js';
import type { PlanExecuteStateUpdate, PlanExecuteStateValue } from './state.js';

const ActSchema = z.object({
  action: z.enum(['continue', 'replan', 'respond']),
  new_steps: z.array(z.string()).default([]),
});
const ResponseSchema = z.object({ response: z.string() });

async function generateResponse(state: PlanExecuteStateValue): Promise<PlanExecuteStateUpdate> {
  const history = state.past_steps.map(([step, result]) => `### 步骤: ${step}\n**结果:**\n${result}`).join('\n\n');
  try {
    const model = createChatModel({ model: config.langchainModel, temperature: 0, streaming: false });
    const result = await model.withStructuredOutput(ResponseSchema).invoke([
      new SystemMessage('根据原始任务和已执行步骤生成清晰、结构化、基于事实的 Markdown 最终响应。失败步骤需如实说明。'),
      new HumanMessage(`原始任务: ${state.input}\n\n执行历史:\n${history}`),
    ]);
    return { response: result.response };
  } catch {
    return { response: `# 任务执行结果\n\n## 原始任务\n${state.input}\n\n## 执行的步骤\n${history || '无'}\n\n## 说明\n由于系统异常，无法生成完整响应。` };
  }
}

export async function replanner(state: PlanExecuteStateValue): Promise<PlanExecuteStateUpdate> {
  if (!state.plan.length || state.past_steps.length >= 8) return generateResponse(state);
  try {
    const summary = state.past_steps.map(([step, result]) => `步骤: ${step}\n结果: ${result.slice(0, 300)}`).join('\n\n');
    const model = createChatModel({ model: config.langchainModel, temperature: 0, streaming: false });
    const act = await model.withStructuredOutput(ActSchema).invoke([
      new SystemMessage([
        '根据已执行结果决定下一步。优先级：信息足够则 respond，其次 continue，只有计划明显错误才 replan。',
        '已执行不少于5步时必须 respond；新计划不得多于当前剩余步骤。',
      ].join('\n')),
      new HumanMessage(`原始任务: ${state.input}\n已执行:\n${summary}\n剩余计划: ${state.plan.join(', ')}`),
    ]);
    if (act.action === 'respond' || state.past_steps.length >= 5) return generateResponse(state);
    const newSteps = act.new_steps ?? [];
    if (act.action === 'replan' && newSteps.length) return { plan: newSteps.slice(0, state.plan.length) };
    return {};
  } catch {
    return {};
  }
}
