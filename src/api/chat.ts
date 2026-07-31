import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { ClearRequestSchema, ChatRequestSchema } from '../models/request.js';
import { ragAgentService } from '../services/ragAgentService.js';

export const chatApi = new Hono();

chatApi.post('/chat', async (context) => {
  const parsed = ChatRequestSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ detail: parsed.error.issues }, 422);
  try {
    const answer = await ragAgentService.query(parsed.data.question, parsed.data.id);
    return context.json({ code: 200, message: 'success', data: { success: true, answer, errorMessage: null } });
  } catch (error) {
    return context.json({
      code: 500, message: 'error',
      data: { success: false, answer: null, errorMessage: error instanceof Error ? error.message : String(error) },
    });
  }
});

chatApi.post('/chat_stream', async (context) => {
  const parsed = ChatRequestSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ detail: parsed.error.issues }, 422);
  return streamSSE(context, async (stream) => {
    for await (const chunk of ragAgentService.queryStream(parsed.data.question, parsed.data.id)) {
      const payload = chunk.type === 'complete'
        ? { type: 'done', data: chunk.data }
        : chunk.type === 'error'
          ? { type: 'error', data: String(chunk.data ?? '') }
          : { type: 'content', data: chunk.data };
      await stream.writeSSE({ event: 'message', data: JSON.stringify(payload) });
    }
  });
});

chatApi.post('/chat/clear', async (context) => {
  const parsed = ClearRequestSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ detail: parsed.error.issues }, 422);
  const success = await ragAgentService.clearSession(parsed.data.sessionId);
  return context.json({ status: success ? 'success' : 'error', message: success ? '会话已清空' : '清空会话失败', data: null });
});

chatApi.get('/chat/session/:sessionId', async (context) => {
  const sessionId = context.req.param('sessionId');
  const history = await ragAgentService.getSessionHistory(sessionId);
  return context.json({ session_id: sessionId, message_count: history.length, history });
});
