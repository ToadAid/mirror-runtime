const MAX_NUDGES = 3;
const MAX_NUDGE_LENGTH = 120;

function clampNudge(nudge: string): string {
  const normalized = nudge.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_NUDGE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_NUDGE_LENGTH - 1).trimEnd()}…`;
}

export function formatMirrorNudgeFooter(nudges: string[]): string {
  if (!Array.isArray(nudges) || nudges.length === 0) {
    return "";
  }

  const selected = nudges
    .map((nudge) => clampNudge(nudge))
    .filter(Boolean)
    .slice(0, MAX_NUDGES);

  if (selected.length === 0) {
    return "";
  }

  return `🪞 Mirror Nudge:\n${selected.map((nudge) => `- ${nudge}`).join("\n")}`;
}
