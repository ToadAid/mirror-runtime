import type { MirrorHeartbeatTemplateInput, MirrorHeartbeatTone } from "./heartbeat_types.js";

function withName(prefix: string, preferredName: string | null | undefined): string {
  return preferredName ? `${prefix} ${preferredName}.` : prefix;
}

export function renderHeartbeatTemplate(input: MirrorHeartbeatTemplateInput = {}): {
  message: string;
  tone: MirrorHeartbeatTone;
} {
  const tone = input.tone ?? "gentle";
  switch (tone) {
    case "calm":
      return {
        tone,
        message: `${withName("The pond has been quiet.", input.preferred_name)} Just checking in. Mirror is here when you return.`,
      };
    case "steady":
      return {
        tone,
        message: `${withName("No pressure.", input.preferred_name)} Mirror is ready whenever you want to pick things up again.`,
      };
    default:
      return {
        tone: "gentle",
        message: `${withName("The pond has been quiet.", input.preferred_name)} Just checking in — are you alright?`,
      };
  }
}
