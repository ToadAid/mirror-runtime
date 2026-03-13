import type { MirrorUserSessionSummary } from "../mirror-user-workspace/index.js";
import type { MirrorMonkSessionView } from "./monk_types.js";

export function buildMonkSessionView(
  recentSession: MirrorUserSessionSummary | null,
): MirrorMonkSessionView {
  return {
    recent_session: recentSession,
    continuity_summary: recentSession ? recentSession.summary : null,
  };
}
