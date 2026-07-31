import type { StructuredToolInterface } from '@langchain/core/tools';

export function formatToolsDescription(tools: StructuredToolInterface[]): string {
  if (!tools.length) return '当前没有可用工具';
  return tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
}

export function contentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content.flatMap((block) => {
    if (typeof block === 'string') return [block];
    if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') return [block.text];
    return [];
  }).join('');
}
