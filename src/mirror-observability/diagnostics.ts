import {
  getCurrentMirrorObservabilityContext,
  getDefaultMirrorObservabilityContext,
} from "./context.js";

export type { MirrorDiagnosticEvent, MirrorDiagnosticsSnapshot } from "./context.js";

export function recordDiagnosticEvent(event: string, fields: Record<string, unknown> = {}): void {
  getCurrentMirrorObservabilityContext().recordDiagnosticEvent(event, fields);
}

export function getMirrorDiagnostics() {
  return getCurrentMirrorObservabilityContext().getDiagnostics();
}

export function resetMirrorDiagnostics(): void {
  getDefaultMirrorObservabilityContext().resetDiagnostics();
}
