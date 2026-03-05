import type { MirrorPassport } from "./types.js";

function line(key: string, value: string | undefined): string {
  return `${key}: ${value && value.trim() ? value : "-"}`;
}

export function formatMirrorPassport(passport: MirrorPassport): string {
  const lines = [
    "🪞 mirror.passport",
    line("agentId", passport.agentIdentity.agentId),
    line("runId", passport.agentIdentity.runId),
    line("issuedAt", passport.issuedAtIso),
  ];

  if (passport.localOnly) {
    lines.push(passport.localOnly.label);
    lines.push(line("travelerName", passport.localOnly.travelerName));
    lines.push(line("hostName", passport.localOnly.hostName));
    lines.push(line("platform", passport.localOnly.platform));
    lines.push(line("nodeVersion", passport.localOnly.nodeVersion));
    lines.push(line("cwd", passport.localOnly.cwd));
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}
