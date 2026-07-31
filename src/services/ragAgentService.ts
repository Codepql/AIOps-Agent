import { createAgent } from 'langchain';
import { MemorySaver } from '@langchain/langgraph';
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { config } from '../config.js';
import { databaseManager } from '../core/database.js';
import { createChatModel } from '../core/llmFactory.js';
import { logger } from '../logger.js';
import { defaultLocalAgentTools } from '../tools/index.js';
import { loadMcpToolsSafe } from '../agent/mcpClient.js';

export interface RagStreamEvent {
  type: 'content' | 'complete' | 'error';
  data?: string;
  node?: string;
}

function messageText(content: BaseMessage['content']): string {
  if (typeof content === 'string') return content;
  return content.flatMap((block) => {
    if (typeof block === 'string') return [block];
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') return [block.text];
    return [];
  }).join('');
}

export class RagAgentService {
  private checkpointer = new MemorySaver();
  private agent?: ReturnType<typeof createAgent>;
  private initialization?: Promise<void>;
  private systemPrompt = [
    '你是一个专业的AI助手，能够使用多种工具来帮助用户解决问题。',
    '理解用户需求并选择合适工具；需要实时信息或专业知识时主动使用工具。',
    '基于工具结果准确回答，不编造信息；回答友好、专业、简洁。',
  ].join('\n');

  private async initialize(): Promise<void> {
    if (this.agent) return;
    this.initialization ??= (async () => {
      const mcpTools = await loadMcpToolsSafe();
      this.agent = createAgent({
        model: createChatModel({ model: config.langchainModel, temperature: 0.7, streaming: true }),
        tools: [...defaultLocalAgentTools, ...mcpTools],
        checkpointer: this.checkpointer,
        systemPrompt: this.systemPrompt,
      });
      logger.info({ toolCount: defaultLocalAgentTools.length + mcpTools.length }, 'RAG Agent 初始化完成');
    })();
    await this.initialization;
  }

  async query(question: string, sessionId: string): Promise<string> {
    await this.initialize();
    await this.saveMessage(sessionId, 'USER', question);
    const result = await this.agent!.invoke(
      { messages: [new HumanMessage(question)] },
      { configurable: { thread_id: sessionId } },
    );
    const last = result.messages.at(-1);
    const answer = last ? messageText(last.content) : '';
    if (answer) await this.saveMessage(sessionId, 'ASSISTANT', answer);
    return answer;
  }

  async *queryStream(question: string, sessionId: string): AsyncGenerator<RagStreamEvent> {
    try {
      await this.initialize();
      await this.saveMessage(sessionId, 'USER', question);
      let answer = '';
      const stream = await this.agent!.stream(
        { messages: [new HumanMessage(question)] },
        { configurable: { thread_id: sessionId }, streamMode: 'messages' },
      );
      for await (const item of stream) {
        const pair = item as unknown as [BaseMessage, Record<string, unknown>];
        const [chunk, metadata] = pair;
        if (!(chunk instanceof AIMessageChunk) && !(chunk instanceof AIMessage)) continue;
        const text = messageText(chunk.content);
        if (text) {
          answer += text;
          yield { type: 'content', data: text, node: String(metadata?.langgraph_node ?? 'unknown') };
        }
      }
      if (answer) await this.saveMessage(sessionId, 'ASSISTANT', answer);
      yield { type: 'complete' };
    } catch (error) {
      yield { type: 'error', data: error instanceof Error ? error.message : String(error) };
    }
  }

  async getSessionHistory(sessionId: string): Promise<Array<Record<string, string>>> {
    await databaseManager.initialize();
    const messages = await databaseManager.prisma.chatMessage.findMany({
      where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { createdAt: 'asc' },
    });
    return messages.map((message) => ({
      role: message.role === 'USER' ? 'user' : 'assistant',
      content: message.content,
      timestamp: message.createdAt.toISOString(),
    }));
  }

  async clearSession(sessionId: string): Promise<boolean> {
    try {
      await this.checkpointer.deleteThread(sessionId);
      await databaseManager.initialize();
      await databaseManager.prisma.chatSession.deleteMany({ where: { id: sessionId } });
      return true;
    } catch (error) {
      logger.error({ error, sessionId }, '清空会话失败');
      return false;
    }
  }

  private async saveMessage(sessionId: string, role: 'USER' | 'ASSISTANT', content: string): Promise<void> {
    await databaseManager.initialize();
    await databaseManager.prisma.chatSession.upsert({
      where: { id: sessionId }, create: { id: sessionId }, update: {},
    });
    await databaseManager.prisma.chatMessage.create({ data: { sessionId, role, content } });
  }
}

export const ragAgentService = new RagAgentService();
