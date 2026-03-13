import type { MirrorHeartbeatEvaluation } from "../mirror-heartbeat/index.js";
import type { MirrorMonkWorkspaceContext } from "../mirror-monk/index.js";
import type { MirrorMonkActionResult, MirrorMonkResumeContext } from "./monk_action_types.js";

export function buildMonkResumeContext(params: {
  workspace: MirrorMonkWorkspaceContext;
  heartbeatEvaluation: MirrorHeartbeatEvaluation;
}): MirrorMonkResumeContext {
  return {
    workspace: params.workspace,
    heartbeat: {
      state: params.workspace.continuity.heartbeat,
      evaluation: params.heartbeatEvaluation,
    },
  };
}

export function buildSuggestedResumeAction(
  userId: string,
  resumeContext: MirrorMonkResumeContext,
): MirrorMonkActionResult {
  const nextTask = resumeContext.workspace.work.active_tasks[0];
  const nextReminder = resumeContext.workspace.work.due_reminders[0];
  const recentSession = resumeContext.workspace.continuity.recent_session;

  const contextNotes = [
    recentSession
      ? `Recent session: ${recentSession.summary}`
      : "No recent session summary recorded.",
    nextReminder ? `Due reminder: ${nextReminder.title}` : "No due reminders recorded.",
    `Heartbeat due: ${resumeContext.heartbeat.evaluation.due ? "yes" : "no"}.`,
  ];

  if (nextTask) {
    return {
      kind: "resume",
      user_id: userId,
      source: "resume",
      summary: `Resume point available for "${nextTask.title}".`,
      suggested_action: recentSession
        ? `Use the recent session summary, then continue "${nextTask.title}" from its next explicit step.`
        : `Continue "${nextTask.title}" and restate the next explicit step before acting.`,
      related_task_id: nextTask.id,
      related_reminder_id: nextReminder?.id,
      related_draft_id: nextTask.related_draft_id ?? undefined,
      context_notes: contextNotes,
    };
  }

  return {
    kind: "resume",
    user_id: userId,
    source: "resume",
    summary: "Resume context is available, but there is no active task selected.",
    suggested_action: nextReminder
      ? `Review the due reminder "${nextReminder.title}" and convert it into an explicit next task if needed.`
      : "Review the latest session and decide on the next explicit work item with the user.",
    related_reminder_id: nextReminder?.id,
    context_notes: contextNotes,
  };
}
