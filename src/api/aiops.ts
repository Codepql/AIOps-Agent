import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { AIOpsRequestSchema } from '../models/request.js';
import { aiopsService } from '../services/aiopsService.js';

export const aiopsApi = new Hono();

aiopsApi.post('/aiops', async (context) => {
  const parsed = AIOpsRequestSchema.safeParse(await context.req.json().catch(() => ({})));
  if (!parsed.success) return context.json({ detail: parsed.error.issues }, 422);
  return streamSSE(context, async (stream) => {
    for await (const event of aiopsService.diagnose(parsed.data.session_id)) {
      await stream.writeSSE({ event: 'message', data: JSON.stringify(event) });
      if (event.type === 'complete' || event.type === 'error') break;
    }
  });
});
