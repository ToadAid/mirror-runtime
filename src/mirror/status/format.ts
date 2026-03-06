import type { MirrorStatus } from "./status.js";

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function formatMaybeNumber(value: number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (value === null) {
    return "unavailable";
  }
  return "-";
}

export function formatMirrorStatusHuman(status: MirrorStatus): string {
  const lines = [
    "🪞 Mirror Runtime",
    `ts: ${status.ts}`,
    `cwd: ${status.cwd}`,
    "telemetry:",
    `- enabled: ${yesNo(status.telemetry.enabled)}`,
    `- sinkEnabled: ${yesNo(status.telemetry.sinkEnabled)}`,
    `- sinkPath: ${status.telemetry.sinkPath}`,
    `- rotateBytes: ${status.telemetry.rotateBytes}`,
    `- rotateKeep: ${status.telemetry.rotateKeep}`,
    `- lockEnabled: ${yesNo(status.telemetry.lockEnabled)}`,
    `- lockPath: ${status.telemetry.lockPath}`,
    `- indexDbPath: ${status.telemetry.indexDbPath}`,
    "passport:",
    `- cliAvailable: ${yesNo(status.passport.cliAvailable)}`,
    `- telemetryEnabled: ${yesNo(status.passport.telemetryEnabled)}`,
    "privacy:",
    `- boundaryGuard: ${yesNo(status.privacy.boundaryGuard)}`,
    "storage:",
    `- ndjsonExists: ${yesNo(status.storage.ndjsonExists)}`,
    `- ndjsonBytes: ${formatMaybeNumber(status.storage.ndjsonBytes)}`,
    `- sqliteExists: ${yesNo(status.storage.sqliteExists)}`,
    `- sqliteEvents: ${formatMaybeNumber(status.storage.sqliteEvents)}`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}
