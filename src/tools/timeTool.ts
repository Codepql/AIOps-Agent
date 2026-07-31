import { tool } from 'langchain';
import { z } from 'zod';

export const getCurrentTime = tool(
  ({ timezone }) => {
    try {
      return new Intl.DateTimeFormat('sv-SE', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date()).replace(',', '');
    } catch (error) {
      return `获取时间失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
  {
    name: 'get_current_time',
    description: '获取指定时区的当前日期和时间。',
    schema: z.object({ timezone: z.string().default('Asia/Shanghai') }),
  },
);
