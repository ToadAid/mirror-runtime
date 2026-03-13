import type { MirrorHeartbeatEvaluation, MirrorHeartbeatState } from "../mirror-heartbeat/index.js";
import type { MirrorMonkWorkspaceContext } from "../mirror-monk/index.js";
import type { MirrorReminder } from "../mirror-reminder/index.js";
import type { MirrorTask } from "../mirror-task/index.js";
import type { MirrorUserDraftMetadata } from "../mirror-user-workspace/index.js";

export type MirrorMonkActionSource =
  | "task"
  | "reminder"
  | "session"
  | "resume"
  | "heartbeat"
  | "workspace";

export type MirrorMonkActionKind =
  | "next_task"
  | "task_followup"
  | "open_work_summary"
  | "due_reminder"
  | "reminder_followup"
  | "resume";

export type MirrorMonkActionResult = {
  kind: MirrorMonkActionKind;
  user_id: string;
  source: MirrorMonkActionSource;
  summary: string;
  suggested_action: string;
  related_task_id?: string;
  related_reminder_id?: string;
  related_draft_id?: string;
  context_notes: string[];
};

export type MirrorMonkResumeContext = {
  workspace: MirrorMonkWorkspaceContext;
  heartbeat: {
    state: MirrorHeartbeatState;
    evaluation: MirrorHeartbeatEvaluation;
  };
};

export type MirrorMonkActions = {
  getNextMonkTask: (userId: string, now?: Date) => Promise<MirrorMonkActionResult | null>;
  getMonkTaskFollowup: (
    userId: string,
    taskId: string,
    now?: Date,
  ) => Promise<MirrorMonkActionResult | null>;
  summarizeMonkOpenWork: (userId: string, now?: Date) => Promise<MirrorMonkActionResult>;
  getMonkDueReminderActions: (userId: string, now?: Date) => Promise<MirrorMonkActionResult[]>;
  getReminderLinkedTaskFollowup: (
    userId: string,
    reminderId: string,
    now?: Date,
  ) => Promise<MirrorMonkActionResult | null>;
  getMonkResumeContext: (userId: string, now?: Date) => Promise<MirrorMonkResumeContext>;
  suggestMonkResumeAction: (userId: string, now?: Date) => Promise<MirrorMonkActionResult>;
  appendMonkFollowupNote: (
    userId: string,
    note: string,
  ) => Promise<{
    id: string;
    content: string;
    created_at: string;
  }>;
  recordMonkSuggestedAction: (
    userId: string,
    action: MirrorMonkActionResult,
  ) => Promise<{
    id: string;
    content: string;
    created_at: string;
  }>;
};

export type MirrorMonkActionContext = {
  userId: string;
  now: Date;
  tasks: MirrorTask[];
  dueReminders: MirrorReminder[];
  drafts: MirrorUserDraftMetadata[];
  recentSessionSummary: string | null;
};
