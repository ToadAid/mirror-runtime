import {
  getCurrentMirrorObservabilityContext,
  getDefaultMirrorObservabilityContext,
  type CounterMetricName,
  type GaugeMetricName,
  type LatencyMetricName,
} from "./context.js";

export type {
  CounterMetricName,
  GaugeMetricName,
  LatencyMetricName,
  MirrorMetricsSnapshot,
} from "./context.js";

export function incrementMetric(name: CounterMetricName, amount = 1): void {
  getCurrentMirrorObservabilityContext().incrementMetric(name, amount);
}

export function incrementToolExecution(toolName: string): void {
  getCurrentMirrorObservabilityContext().incrementToolExecution(toolName);
}

export function recordLatency(name: LatencyMetricName, durationMs: number): void {
  getCurrentMirrorObservabilityContext().recordLatency(name, durationMs);
}

export function setMetricGauge(name: GaugeMetricName, value: number): void {
  getCurrentMirrorObservabilityContext().setMetricGauge(name, value);
}

export function getMirrorMetrics() {
  return getCurrentMirrorObservabilityContext().getMetrics();
}

export function resetMirrorMetrics(): void {
  getDefaultMirrorObservabilityContext().resetMetrics();
}
