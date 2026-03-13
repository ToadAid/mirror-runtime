import type { MirrorMonkActionResult } from "./monk_action_types.js";

export function formatMonkSuggestedAction(action: MirrorMonkActionResult): string {
  return `${action.summary} ${action.suggested_action}`;
}
