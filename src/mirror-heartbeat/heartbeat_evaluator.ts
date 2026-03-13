import type {
  MirrorHeartbeatEvaluation,
  MirrorHeartbeatEvaluationInput,
} from "./heartbeat_types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecent(timestamp: string | null, cutoffMs: number): boolean {
  const parsed = parseTimestamp(timestamp);
  return parsed !== null && parsed >= cutoffMs;
}

export function evaluateHeartbeat(
  input: MirrorHeartbeatEvaluationInput,
): MirrorHeartbeatEvaluation {
  const now = input.now ?? new Date();
  const thresholdDays = input.heartbeat.check_in_after_inactivity_days;
  const cutoffMs = now.getTime() - thresholdDays * ONE_DAY_MS;
  const lastSeenMs = parseTimestamp(input.heartbeat.last_seen_at);
  const inactivityDays =
    lastSeenMs === null ? null : Math.floor((now.getTime() - lastSeenMs) / ONE_DAY_MS);

  const recentSession = isRecent(input.recent_session?.last_active_at ?? null, cutoffMs);
  const recentTaskActivity = input.tasks.some(
    (task) => task.status !== "done" && isRecent(task.updated_at, cutoffMs),
  );
  const recentReminderActivity = input.reminders.some((reminder) =>
    isRecent(reminder.updated_at, cutoffMs),
  );
  const activeTaskCount = input.tasks.filter((task) => task.status === "active").length;
  const activeReminderCount = input.reminders.filter(
    (reminder) => reminder.status === "active",
  ).length;

  const base = {
    enabled: input.heartbeat.enabled,
    due: false,
    suppressed_by_quiet_mode: false,
    inactivity_days: inactivityDays,
    threshold_days: thresholdDays,
    last_seen_at: input.heartbeat.last_seen_at,
    last_check_in_at: input.heartbeat.last_check_in_at,
    signals: {
      recent_session: recentSession,
      recent_task_activity: recentTaskActivity,
      recent_reminder_activity: recentReminderActivity,
      active_task_count: activeTaskCount,
      active_reminder_count: activeReminderCount,
    },
  };

  if (!input.heartbeat.enabled) {
    return { ...base, reason: "disabled" };
  }
  if (input.heartbeat.quiet_mode) {
    return { ...base, suppressed_by_quiet_mode: true, reason: "quiet_mode" };
  }
  if (recentSession || recentTaskActivity || recentReminderActivity) {
    return { ...base, reason: "recent_activity" };
  }
  if (inactivityDays === null || inactivityDays < thresholdDays) {
    return { ...base, reason: "threshold_not_met" };
  }
  return { ...base, due: true, reason: "due" };
}
