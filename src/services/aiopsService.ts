import { END, MemorySaver, START, StateGraph } from '@langchain/langgraph';
import { executor } from '../agent/aiops/executor.js';
import { planner } from '../agent/aiops/planner.js';
import { replanner } from '../agent/aiops/replanner.js';
import { PlanExecuteState } from '../agent/aiops/state.js';

export type AIOpsEvent = Record<string, unknown> & { type: string };

export class AIOpsService {
  private checkpointer = new MemorySaver();
  private graph = new StateGraph(PlanExecuteState)
    .addNode('planner', planner)
    .addNode('executor', executor)
    .addNode('replanner', replanner)
    .addEdge(START, 'planner')
    .addEdge('planner', 'executor')
    .addEdge('executor', 'replanner')
    .addConditionalEdges('replanner', (state) => state.response ? END : state.plan.length ? 'executor' : END)
    .compile({ checkpointer: this.checkpointer });

  async *execute(userInput: string, sessionId = 'default'): AsyncGenerator<AIOpsEvent> {
    const config = { configurable: { thread_id: sessionId } };
    try {
      const stream = await this.graph.stream(
        { input: userInput, plan: [], past_steps: [], response: '' },
        { ...config, streamMode: 'updates' },
      );
      for await (const event of stream) {
        for (const [node, output] of Object.entries(event as Record<string, Record<string, unknown>>)) {
          if (node === 'planner') yield this.formatPlanner(output);
          else if (node === 'executor') yield this.formatExecutor(output);
          else if (node === 'replanner') yield this.formatReplanner(output);
        }
      }
      const finalState = await this.graph.getState(config);
      yield { type: 'complete', stage: 'complete', message: '任务执行完成', response: String(finalState.values.response ?? '') };
    } catch (error) {
      yield { type: 'error', stage: 'error', message: `任务执行出错: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async *diagnose(sessionId = 'default'): AsyncGenerator<AIOpsEvent> {
    const task = `诊断当前系统是否存在告警。如果存在，使用真实工具数据分析根因并生成纯 Markdown 告警分析报告。报告包含活跃告警清单、每个告警的详情、症状、日志证据、根因、处理建议、整体结论和风险评估。严禁编造；失败步骤需如实说明。`;
    for await (const event of this.execute(task, sessionId)) {
      if (event.type === 'complete') {
        yield {
          type: 'complete', stage: 'diagnosis_complete', message: '诊断流程完成',
          diagnosis: { status: 'completed', report: event.response ?? '' },
        };
      } else yield event;
    }
  }

  private formatPlanner(output: Record<string, unknown>): AIOpsEvent {
    const plan = Array.isArray(output.plan) ? output.plan : [];
    return { type: 'plan', stage: 'plan_created', message: `执行计划已制定，共 ${plan.length} 个步骤`, plan };
  }

  private formatExecutor(output: Record<string, unknown>): AIOpsEvent {
    const plan = Array.isArray(output.plan) ? output.plan : [];
    const pastSteps = Array.isArray(output.past_steps) ? output.past_steps as [string, string][] : [];
    const last = pastSteps.at(-1);
    return last
      ? { type: 'step_complete', stage: 'step_executed', message: `步骤执行完成 (${pastSteps.length}/${pastSteps.length + plan.length})`, current_step: last[0], remaining_steps: plan.length }
      : { type: 'status', stage: 'executor', message: '开始执行步骤' };
  }

  private formatReplanner(output: Record<string, unknown>): AIOpsEvent {
    const response = String(output.response ?? '');
    const plan = Array.isArray(output.plan) ? output.plan : [];
    return response
      ? { type: 'report', stage: 'final_report', message: '最终报告已生成', report: response }
      : { type: 'status', stage: 'replanner', message: `评估完成，${plan.length ? '继续执行剩余步骤' : '准备生成最终响应'}`, remaining_steps: plan.length };
  }
}

export const aiopsService = new AIOpsService();
