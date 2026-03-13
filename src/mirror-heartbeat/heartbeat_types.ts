import type {
  MirrorHeartbeatPreferences,
  MirrorUserReminder,
  MirrorUserSessionSummary,
  MirrorUserTask,
} from "../mirror-user-workspace/index.js";

export type MirrorHeartbeatTone = MirrorHeartbeatPreferences["preferred_tone"];
export type MirrorHeartbeatState = MirrorHeartbeatPreferences;

export type MirrorHeartbeatSignalSummary = {
  recent_session: boolean;
  recent_task_activity: boolean;
  recent_reminder_activity: boolean;
  active_task_count: number;
  active_reminder_count: number;
};

export type MirrorHeartbeatEvaluation = {
  enabled: boolean;
  due: boolean;
  suppressed_by_quiet_mode: boolean;
  inactivity_days: number | null;
  threshold_days: number;
  last_seen_at: string | null;
  last_check_in_at: string | null;
  signals: MirrorHeartbeatSignalSummary;
  reason: "disabled" | "quiet_mode" | "recent_activity" | "threshold_not_met" | "due";
};

export type MirrorHeartbeatTemplateInput = {
  preferred_name?: string | null;
  tone?: MirrorHeartbeatTone;
};

export type MirrorHeartbeatManager = {
  getHeartbeatState: (userId: string) => Promise<MirrorHeartbeatState>;
  updateHeartbeatPreferences: (
    userId: string,
    patch: Partial<Omit<MirrorHeartbeatState, "updated_at">>,
  ) => Promise<MirrorHeartbeatState>;
  recordUserSeen: (userId: string, seenAt?: string) => Promise<MirrorHeartbeatState>;
  recordHeartbeatCheck: (userId: string, checkedAt?: string) => Promise<MirrorHeartbeatState>;
  isHeartbeatDue: (userId: string, now?: Date) => Promise<boolean>;
  getHeartbeatEvaluation: (userId: string, now?: Date) => Promise<MirrorHeartbeatEvaluation>;
  getSuggestedHeartbeatMessage: (
    userId: string,
    now?: Date,
  ) => Promise<{ message: string; tone: MirrorHeartbeatTone }>;
};

export type MirrorHeartbeatEvaluationInput = {
  heartbeat: MirrorHeartbeatState;
  tasks: MirrorUserTask[];
  reminders: MirrorUserReminder[];
  recent_session: MirrorUserSessionSummary | null;
  now?: Date;
};
