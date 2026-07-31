import { z } from 'zod';

export const ChatRequestSchema = z.object({
  Id: z.string().min(1).optional(),
  Question: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  question: z.string().min(1).optional(),
}).transform((body, context) => {
  const id = body.Id ?? body.id;
  const question = body.Question ?? body.question;
  if (!id || !question) {
    context.addIssue({ code: 'custom', message: 'Id and Question are required' });
    return z.NEVER;
  }
  return { id, question };
});

export const ClearRequestSchema = z.object({
  sessionId: z.string().min(1).optional(),
  session_id: z.string().min(1).optional(),
}).transform((body, context) => {
  const sessionId = body.sessionId ?? body.session_id;
  if (!sessionId) {
    context.addIssue({ code: 'custom', message: 'sessionId is required' });
    return z.NEVER;
  }
  return { sessionId };
});

export const AIOpsRequestSchema = z.object({ session_id: z.string().optional().default('default') });
