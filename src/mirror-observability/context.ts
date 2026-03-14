import { AsyncLocalStorage } from "node:async_hooks";

export type CounterMetricName =
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

export type LatencyMetricName = "retrieval_time_ms" | "provider_latency_ms";
export type GaugeMetricName = "peers_known";

export type MirrorDiagnosticEvent = {
  event: string;
  timestamp: string;
  fields: Record<string, unknown>;
};

export type MirrorMetricsSnapshot = {
  counters: Record<CounterMetricName, number>;
  gauges: Record<GaugeMetricName, number>;
  latencies: Record<LatencyMetricName, { count: number; avg_ms: number; max_ms: number }>;
  tool_counts: Record<string, number>;
};

export type MirrorDiagnosticsSnapshot = {
  events: MirrorDiagnosticEvent[];
};

export type MirrorObservabilityContext = {
  incrementMetric: (name: CounterMetricName, amount?: number) => void;
  incrementToolExecution: (toolName: string) => void;
  recordLatency: (name: LatencyMetricName, durationMs: number) => void;
  setMetricGauge: (name: GaugeMetricName, value: number) => void;
  recordDiagnosticEvent: (event: string, fields?: Record<string, unknown>) => void;
  logEvent: (event: string, fields?: Record<string, unknown>) => void;
  getMetrics: () => MirrorMetricsSnapshot;
  getDiagnostics: () => MirrorDiagnosticsSnapshot;
  resetMetrics: () => void;
  resetDiagnostics: () => void;
  reset: () => void;
};

type MirrorMetricsState = {
  counters: Record<CounterMetricName, number>;
  latencies: Record<LatencyMetricName, number[]>;
  gauges: Record<GaugeMetricName, number>;
  tool_counts: Record<string, number>;
};

const MAX_DIAGNOSTIC_EVENTS = 100;
const OBSERVABILITY_CONTEXT = new AsyncLocalStorage<MirrorObservabilityContext>();

function createMetricsState(): MirrorMetricsState {
  return {
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
}

function summarizeLatency(values: number[]) {
  const count = values.length;
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count,
    avg_ms: count === 0 ? 0 : total / count,
    max_ms: count === 0 ? 0 : Math.max(...values),
  };
}

export function createMirrorObservabilityContext(): MirrorObservabilityContext {
  const metrics = createMetricsState();
  const diagnostics: MirrorDiagnosticEvent[] = [];

  const context: MirrorObservabilityContext = {
    incrementMetric(name, amount = 1) {
      metrics.counters[name] += amount;
    },
    incrementToolExecution(toolName) {
      context.incrementMetric("tool_executions");
      metrics.tool_counts[toolName] = (metrics.tool_counts[toolName] ?? 0) + 1;
    },
    recordLatency(name, durationMs) {
      metrics.latencies[name].push(durationMs);
    },
    setMetricGauge(name, value) {
      metrics.gauges[name] = value;
    },
    recordDiagnosticEvent(event, fields = {}) {
      diagnostics.unshift({
        event,
        timestamp: new Date().toISOString(),
        fields,
      });

      if (diagnostics.length > MAX_DIAGNOSTIC_EVENTS) {
        diagnostics.length = MAX_DIAGNOSTIC_EVENTS;
      }
    },
    logEvent(event, fields = {}) {
      context.recordDiagnosticEvent(event, fields);

      if (process.env.VITEST === "true") {
        return;
      }

      console.info(
        JSON.stringify({
          scope: "mirror",
          event,
          ...fields,
        }),
      );
    },
    getMetrics() {
      return {
        counters: { ...metrics.counters },
        gauges: { ...metrics.gauges },
        latencies: {
          retrieval_time_ms: summarizeLatency(metrics.latencies.retrieval_time_ms),
          provider_latency_ms: summarizeLatency(metrics.latencies.provider_latency_ms),
        },
        tool_counts: { ...metrics.tool_counts },
      };
    },
    getDiagnostics() {
      return {
        events: [...diagnostics],
      };
    },
    resetMetrics() {
      metrics.counters.chat_requests = 0;
      metrics.counters.tool_executions = 0;
      metrics.counters.review_conflicts = 0;
      metrics.counters.graph_query_frequency = 0;
      metrics.counters.updates_pulled = 0;
      metrics.counters.sync_failures = 0;
      metrics.counters.conflict_warnings = 0;
      metrics.counters.workspace_events = 0;
      metrics.counters.monk_actions = 0;
      metrics.counters.task_operations = 0;
      metrics.counters.reminder_operations = 0;
      metrics.counters.heartbeat_operations = 0;
      metrics.latencies.retrieval_time_ms = [];
      metrics.latencies.provider_latency_ms = [];
      metrics.gauges.peers_known = 0;
      for (const key of Object.keys(metrics.tool_counts)) {
        delete metrics.tool_counts[key];
      }
    },
    resetDiagnostics() {
      diagnostics.length = 0;
    },
    reset() {
      context.resetMetrics();
      context.resetDiagnostics();
    },
  };

  return context;
}

const DEFAULT_OBSERVABILITY_CONTEXT = createMirrorObservabilityContext();

export function getDefaultMirrorObservabilityContext(): MirrorObservabilityContext {
  return DEFAULT_OBSERVABILITY_CONTEXT;
}

export function getCurrentMirrorObservabilityContext(): MirrorObservabilityContext {
  return OBSERVABILITY_CONTEXT.getStore() ?? DEFAULT_OBSERVABILITY_CONTEXT;
}

export function runWithMirrorObservabilityContext<T>(
  context: MirrorObservabilityContext,
  fn: () => T,
): T {
  return OBSERVABILITY_CONTEXT.run(context, fn);
}
