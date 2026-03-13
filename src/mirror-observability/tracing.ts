import { recordDiagnosticEvent } from "./diagnostics.js";

export function logMirrorEvent(event: string, fields: Record<string, unknown> = {}): void {
  recordDiagnosticEvent(event, fields);

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
}
