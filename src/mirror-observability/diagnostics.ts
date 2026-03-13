export type MirrorDiagnosticEvent = {
  event: string;
  timestamp: string;
  fields: Record<string, unknown>;
};

const MAX_DIAGNOSTIC_EVENTS = 100;
const DIAGNOSTIC_EVENTS: MirrorDiagnosticEvent[] = [];

export function recordDiagnosticEvent(event: string, fields: Record<string, unknown> = {}): void {
  DIAGNOSTIC_EVENTS.unshift({
    event,
    timestamp: new Date().toISOString(),
    fields,
  });

  if (DIAGNOSTIC_EVENTS.length > MAX_DIAGNOSTIC_EVENTS) {
    DIAGNOSTIC_EVENTS.length = MAX_DIAGNOSTIC_EVENTS;
  }
}

export function getMirrorDiagnostics() {
  return {
    events: [...DIAGNOSTIC_EVENTS],
  };
}

export function resetMirrorDiagnostics(): void {
  DIAGNOSTIC_EVENTS.length = 0;
}
