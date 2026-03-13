type CounterMetricName =
  | "chat_requests"
  | "tool_executions"
  | "review_conflicts"
  | "graph_query_frequency"
  | "updates_pulled"
  | "sync_failures"
  | "conflict_warnings"
  | "workspace_events"
  | "monk_actions"
  | "task_operations"
  | "reminder_operations"
  | "heartbeat_operations";

type LatencyMetricName = "retrieval_time_ms" | "provider_latency_ms";
type GaugeMetricName = "peers_known";

type MirrorMetricsState = {
  counters: Record<CounterMetricName, number>;
  latencies: Record<LatencyMetricName, number[]>;
  gauges: Record<GaugeMetricName, number>;
  tool_counts: Record<string, number>;
};

const METRICS_STATE: MirrorMetricsState = {
  counters: {
    chat_requests: 0,
    tool_executions: 0,
    review_conflicts: 0,
    graph_query_frequency: 0,
    updates_pulled: 0,
    sync_failures: 0,
    conflict_warnings: 0,
    workspace_events: 0,
    monk_actions: 0,
    task_operations: 0,
    reminder_operations: 0,
    heartbeat_operations: 0,
  },
  latencies: {
    retrieval_time_ms: [],
    provider_latency_ms: [],
  },
  gauges: {
    peers_known: 0,
  },
  tool_counts: {},
};

function summarizeLatency(values: number[]) {
  const count = values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count,
    avg_ms: count === 0 ? 0 : total / count,
    max_ms: count === 0 ? 0 : Math.max(...values),
  };
}

export function incrementMetric(name: CounterMetricName, amount = 1): void {
  METRICS_STATE.counters[name] += amount;
}

export function incrementToolExecution(toolName: string): void {
  incrementMetric("tool_executions");
  METRICS_STATE.tool_counts[toolName] = (METRICS_STATE.tool_counts[toolName] ?? 0) + 1;
}

export function recordLatency(name: LatencyMetricName, durationMs: number): void {
  METRICS_STATE.latencies[name].push(durationMs);
}

export function setMetricGauge(name: GaugeMetricName, value: number): void {
  METRICS_STATE.gauges[name] = value;
}

export function getMirrorMetrics() {
  return {
    counters: { ...METRICS_STATE.counters },
    gauges: { ...METRICS_STATE.gauges },
    latencies: {
      retrieval_time_ms: summarizeLatency(METRICS_STATE.latencies.retrieval_time_ms),
      provider_latency_ms: summarizeLatency(METRICS_STATE.latencies.provider_latency_ms),
    },
    tool_counts: { ...METRICS_STATE.tool_counts },
  };
}

export function resetMirrorMetrics(): void {
  METRICS_STATE.counters.chat_requests = 0;
  METRICS_STATE.counters.tool_executions = 0;
  METRICS_STATE.counters.review_conflicts = 0;
  METRICS_STATE.counters.graph_query_frequency = 0;
  METRICS_STATE.counters.updates_pulled = 0;
  METRICS_STATE.counters.sync_failures = 0;
  METRICS_STATE.counters.conflict_warnings = 0;
  METRICS_STATE.counters.workspace_events = 0;
  METRICS_STATE.counters.monk_actions = 0;
  METRICS_STATE.counters.task_operations = 0;
  METRICS_STATE.counters.reminder_operations = 0;
  METRICS_STATE.counters.heartbeat_operations = 0;
  METRICS_STATE.latencies.retrieval_time_ms = [];
  METRICS_STATE.latencies.provider_latency_ms = [];
  METRICS_STATE.gauges.peers_known = 0;

  for (const key of Object.keys(METRICS_STATE.tool_counts)) {
    delete METRICS_STATE.tool_counts[key];
  }
}
