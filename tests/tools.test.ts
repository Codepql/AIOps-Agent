import { describe, expect, it } from 'vitest';
import { getCurrentTime } from '../src/tools/timeTool.js';

describe('local tools', () => {
  it('formats current time', async () => {
    const value = await getCurrentTime.invoke({ timezone: 'Asia/Shanghai' });
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
