const topics = [
  { topic_id: 'topic-001', topic_name: '数据同步服务日志', service_name: 'data-sync-service', region_code: 'ap-beijing', create_time: '2024-01-01 10:00:00', log_count: 0, description: '数据同步服务应用日志' },
  { topic_id: 'topic-002', topic_name: '数据同步服务错误日志', service_name: 'data-sync-service', region_code: 'ap-beijing', create_time: '2024-01-01 10:00:00', log_count: 0, description: '数据同步服务错误日志' },
  { topic_id: 'topic-003', topic_name: 'API网关服务日志', service_name: 'api-gateway-service', region_code: 'ap-shanghai', create_time: '2024-01-01 10:00:00', log_count: 0, description: 'API网关服务日志' },
];

export function searchTopics(serviceName: string, regionCode?: string, fuzzy = true) {
  const query = serviceName.toLowerCase();
  const matches = topics.filter((topic) => {
    if (regionCode && topic.region_code !== regionCode) return false;
    const current = topic.service_name.toLowerCase();
    return fuzzy ? current.includes(query) || query.includes(current) : current === query;
  });
  return { total: matches.length, topics: matches, query: { service_name: serviceName, region_code: regionCode, fuzzy } };
}

export function searchLog(topicId: string, startTime: number, endTime: number, query?: string, limit = 100) {
  if (!topics.some((topic) => topic.topic_id === topicId)) {
    return { topic_id: topicId, start_time: startTime, end_time: endTime, query, limit, total: 0, logs: [], took_ms: 0, error: `主题不存在: ${topicId}` };
  }
  const count = Math.min(limit, Math.floor((endTime - startTime) / 60_000) + 1);
  const logs = Array.from({ length: Math.max(0, count) }, (_, index) => ({
    timestamp: new Date(startTime + index * 60_000).toISOString(),
    level: 'INFO',
    message: '正在同步元数据...',
  }));
  return { topic_id: topicId, start_time: startTime, end_time: endTime, query, limit, total: logs.length, logs, took_ms: 50 };
}

export function getTopic(topicName: string, regionCode?: string) {
  return topics.find((topic) => topic.topic_name === topicName && (!regionCode || topic.region_code === regionCode))
    ?? { topic_id: null, topic_name: topicName, region_code: regionCode, error: `未找到主题: ${topicName}` };
}
