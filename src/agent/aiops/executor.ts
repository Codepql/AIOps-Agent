import { createAgent } from 'langchain';
import { HumanMessage } from '@langchain/core/messages';
import { config } from '../../config.js';
import { createChatModel } from '../../core/llmFactory.js';
import { defaultLocalAgentTools } from '../../tools/index.js';
import { loadMcpToolsSafe } from '../mcpClient.js';
import type { PlanExecuteStateUpdate, PlanExecuteStateValue } from './state.js';
import { contentToString } from './utils.js';

export async function executor(state: PlanExecuteStateValue): Promise<PlanExecuteStateUpdate> {
  if (!state.plan.length) return {};
  const [task, ...remaining] = state.plan;
  try {
    const tools = [...defaultLocalAgentTools, ...await loadMcpToolsSafe()];
    const agent = createAgent({
      model: createChatModel({ model: config.langchainModel, temperature: 0, streaming: false }),
      tools,
      systemPrompt: [
        '你负责执行当前具体任务步骤，可以使用给定工具。',
        '只返回实际获取的信息；工具失败时说明原因；不要编造数据；专注当前步骤。',
      ].join('\n'),
    });
    const result = await agent.invoke({ messages: [new HumanMessage(`请执行以下任务: ${task}`)] });
    const output = result.messages.at(-1);
    return { plan: remaining, past_steps: [[task!, output ? contentToString(output.content) : '']] };
  } catch (error) {
    return {
      plan: remaining,
      past_steps: [[task!, `执行失败: ${error instanceof Error ? error.message : String(error)}`]],
    };
  }
}
