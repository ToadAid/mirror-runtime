import { getCurrentMirrorObservabilityContext } from "./context.js";

export function logMirrorEvent(event: string, fields: Record<string, unknown> = {}): void {
  getCurrentMirrorObservabilityContext().logEvent(event, fields);
}
