import type { MirrorDoctorReport } from "./doctor.js";

function line(status: string, key: string, message: string): string {
  return `${status.padEnd(5, " ")} ${key.padEnd(24, " ")} ${message}`;
}

export function formatMirrorDoctorHuman(report: MirrorDoctorReport): string {
  const lines = ["🪞 Mirror Doctor", ""];

  for (const check of report.checks) {
    lines.push(line(check.status, check.key, check.message));
  }

  lines.push("");
  lines.push(`Mirror runtime health: ${report.overall}`);
  lines.push("");

  return `${lines.join("\n")}\n`;
}
