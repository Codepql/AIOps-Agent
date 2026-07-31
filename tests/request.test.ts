import { describe, expect, it } from 'vitest';
import { ChatRequestSchema, ClearRequestSchema } from '../src/models/request.js';

describe('request compatibility', () => {
  it('accepts legacy chat aliases', () => {
    expect(ChatRequestSchema.parse({ Id: 's1', Question: 'hello' })).toEqual({ id: 's1', question: 'hello' });
  });

  it('accepts normalized chat fields', () => {
    expect(ChatRequestSchema.parse({ id: 's1', question: 'hello' })).toEqual({ id: 's1', question: 'hello' });
  });

  it('accepts both clear-session field names', () => {
    expect(ClearRequestSchema.parse({ sessionId: 's1' })).toEqual({ sessionId: 's1' });
    expect(ClearRequestSchema.parse({ session_id: 's2' })).toEqual({ sessionId: 's2' });
  });
});
