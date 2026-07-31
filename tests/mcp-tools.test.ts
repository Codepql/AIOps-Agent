import { describe, expect, it } from 'vitest';
import { searchLog, searchTopics } from '../mcp_servers/clsTools.js';
import { queryMetric } from '../mcp_servers/monitorTools.js';

describe('mock MCP tools', () => {
  it('finds CLS topics by partial service name', () => {
    expect(searchTopics('data-sync').total).toBe(2);
  });

  it('caps generated logs at the requested limit', () => {
    const result = searchLog('topic-001', 0, 60 * 60 * 1000, undefined, 3);
    expect(result.logs).toHaveLength(3);
  });

  it('generates bounded monitoring data', () => {
    const result = queryMetric('cpu', 'data-sync-service', undefined, undefined, '5m');
    expect(result.data_points.length).toBeGreaterThan(0);
    expect(result.data_points.length).toBeLessThanOrEqual(721);
  });
});
