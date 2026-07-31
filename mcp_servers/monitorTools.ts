type MetricKind = 'cpu' | 'memory';

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function queryMetric(kind: MetricKind, serviceName: string, startTime?: string, endTime?: string, interval = '1m') {
  const end = parseDate(endTime, new Date());
  const start = parseDate(startTime, new Date(end.getTime() - 60 * 60_000));
  const match = /^(\d+)(m|h)$/.exec(interval);
  const amount = Number(match?.[1] ?? 1);
  const stepMinutes = Math.max(1, Math.min(60, amount * (match?.[2] === 'h' ? 60 : 1)));
  const pointCount = Math.max(0, Math.min(721, Math.floor((end.getTime() - start.getTime()) / (stepMinutes * 60_000)) + 1));
  const values = Array.from({ length: pointCount }, (_, index) => {
    const base = kind === 'cpu' ? 10 : 30;
    const growth = kind === 'cpu' ? 8.5 : 5.5;
    const cap = kind === 'cpu' ? 96 : 85;
    return Math.min(cap, base + Math.max(0, index - 2) * growth);
  });
  const data_points = values.map((value, index) => ({
    timestamp: new Date(start.getTime() + index * stepMinutes * 60_000).toISOString().slice(11, 16),
    value,
    ...(kind === 'cpu' ? { process_id: 'pid-12345' } : { used_gb: Number((value * 0.08).toFixed(2)), total_gb: 8 }),
  }));
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const avg = values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : 0;
  const threshold = kind === 'cpu' ? 80 : 70;
  return {
    service_name: serviceName,
    metric_name: `${kind}_usage_percent`,
    interval,
    data_points,
    statistics: { avg, max, min, p95: values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0 },
    alert_info: { triggered: max > threshold, threshold, message: max > threshold ? `${kind.toUpperCase()} 使用率超过阈值` : `${kind.toUpperCase()} 使用率正常` },
  };
}
