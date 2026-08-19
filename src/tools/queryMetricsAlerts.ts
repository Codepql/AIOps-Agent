import { tool } from 'langchain';
import { z } from 'zod';
import { config } from '../config.js';
import { recordToolCall } from '../observability/metrics.js';

const commonLabelKeys = ['severity', 'instance', 'job', 'namespace', 'pod'] as const;

function duration(activeAt: string): string {
  const start = Date.parse(activeAt);
  if (!Number.isFinite(start)) return 'unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours ? `${hours}h${minutes}m${remaining}s` : minutes ? `${minutes}m${remaining}s` : `${remaining}s`;
}

export const queryPrometheusAlerts = tool(
  async () => {
    const started = Date.now();
    try {
      const response = await fetch(`${config.prometheusBaseUrl.replace(/\/$/, '')}/api/v1/alerts`, {
        signal: AbortSignal.timeout(config.prometheusRequestTimeout * 1000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { status?: string; error?: string; data?: { alerts?: unknown[] } };
      if (body.status !== 'success') throw new Error(body.error ?? 'Prometheus returned non-success status');
      const seen = new Set<string>();
      const stateCounts: Record<string, number> = {};
      const alerts = (body.data?.alerts ?? []).flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return [];
        const alert = raw as Record<string, unknown>;
        const labels = alert.labels && typeof alert.labels === 'object' ? alert.labels as Record<string, unknown> : {};
        const annotations = alert.annotations && typeof alert.annotations === 'object' ? alert.annotations as Record<string, unknown> : {};
        const identity = JSON.stringify(Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))));
        if (seen.has(identity)) return [];
        seen.add(identity);
        const state = String(alert.state ?? '');
        stateCounts[state] = (stateCounts[state] ?? 0) + 1;
        const activeAt = String(alert.activeAt ?? '');
        return [{
          alert_name: String(labels.alertname ?? ''), labels,
          common_labels: Object.fromEntries(commonLabelKeys.flatMap((key) => labels[key] ? [[key, labels[key]]] : [])),
          description: String(annotations.description ?? ''), summary: String(annotations.summary ?? ''),
          state, active_at: activeAt, duration: duration(activeAt),
        }];
      }).sort((a, b) => Date.parse(b.active_at) - Date.parse(a.active_at));
      return JSON.stringify({ success: true, alerts, state_counts: stateCounts, total: alerts.length }, null, 2);
    } catch (error) {
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }, null, 2);
    } finally {
      recordToolCall('query_prometheus_alerts', Date.now() - started);
    }
  },
  {
    name: 'query_prometheus_alerts',
    description: '查询 Prometheus 当前 firing/pending 告警列表，无需参数。',
    schema: z.object({}),
  },
);
