import type {
  MirrorHeartbeatPreferences,
  MirrorMonkCoderContext,
  MirrorUserDraftMetadata,
  MirrorUserPreferences,
  MirrorUserProfile,
  MirrorUserReminder,
  MirrorUserSessionSummary,
  MirrorUserTask,
} from "../mirror-user-workspace/index.js";

export type MirrorMonkTaskView = {
  active_tasks: MirrorUserTask[];
  paused_tasks: MirrorUserTask[];
  completed_tasks: MirrorUserTask[];
};

export type MirrorMonkDraftView = {
  drafts: MirrorUserDraftMetadata[];
  active_related_drafts: MirrorUserDraftMetadata[];
};

export type MirrorMonkSessionView = {
  recent_session: MirrorUserSessionSummary | null;
  continuity_summary: string | null;
};

export type MirrorMonkWorkspaceContext = {
  user: {
    user_id: string;
    profile: MirrorUserProfile;
    preferences: MirrorUserPreferences;
  };
  work: {
    active_tasks: MirrorUserTask[];
    due_reminders: MirrorUserReminder[];
    drafts: MirrorUserDraftMetadata[];
  };
  continuity: {
    recent_session: MirrorUserSessionSummary | null;
    heartbeat: MirrorHeartbeatPreferences;
  };
  monk: {
    shared_context: MirrorMonkCoderContext;
    recent_monk_notes: Array<{
      id: string;
      content: string;
      created_at: string;
    }>;
  };
};

export type MirrorMonkWorkspaceBridge = {
  getMonkWorkspaceContext: (userId: string, now?: Date) => Promise<MirrorMonkWorkspaceContext>;
  getMonkActiveTasks: (userId: string) => Promise<MirrorMonkTaskView>;
  getMonkDueReminders: (userId: string, now?: Date) => Promise<MirrorUserReminder[]>;
  getMonkDraftContext: (userId: string) => Promise<MirrorMonkDraftView>;
  getMonkRecentSessionContext: (userId: string) => Promise<MirrorMonkSessionView>;
  getMonkSharedContext: (userId: string) => Promise<MirrorMonkCoderContext>;
  updateMonkSharedContext: (
    userId: string,
    patch: Partial<Omit<MirrorMonkCoderContext, "updated_at">>,
  ) => Promise<MirrorMonkCoderContext>;
  appendMonkCoderNote: (
    userId: string,
    content: string,
  ) => Promise<{
    id: string;
    content: string;
    created_at: string;
  }>;
};
