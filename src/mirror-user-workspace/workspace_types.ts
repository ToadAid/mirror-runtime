export type MirrorUserProfile = {
  user_id: string;
  preferred_name: string | null;
  created_at: string;
  updated_at: string;
};

export type MirrorUserPreferences = {
  language: string | null;
  tone: string | null;
  updated_at: string;
};

export type MirrorUserTaskStatus = "active" | "paused" | "done";

export type MirrorUserTask = {
  id: string;
  title: string;
  status: MirrorUserTaskStatus;
  description: string | null;
  due_at: string | null;
  tags: string[];
  related_draft_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MirrorUserDraftStatus = "draft" | "review" | "committed";

export type MirrorUserDraftMetadata = {
  id: string;
  title: string;
  path: string | null;
  status: MirrorUserDraftStatus;
  created_at: string;
  updated_at: string;
};

export type MirrorUserNoteEntry = {
  id: string;
  content: string;
  tags: string[];
  created_at: string;
};

export type MirrorUserSessionSummary = {
  session_id: string | null;
  summary: string;
  open_threads: string[];
  last_active_at: string;
  updated_at: string;
};

export type MirrorHeartbeatPreferences = {
  enabled: boolean;
  check_in_after_inactivity_days: number;
  quiet_mode: boolean;
  preferred_tone: "gentle" | "calm" | "steady";
  last_seen_at: string | null;
  last_check_in_at: string | null;
  opt_in_source: string | null;
  updated_at: string;
};

export type MirrorMonkCoderContext = {
  active_repo: string | null;
  active_branch: string | null;
  current_focus: string | null;
  next_steps: string[];
  updated_at: string;
};

export type MirrorUserReminderStatus = "active" | "paused" | "delivered" | "dismissed";

export type MirrorUserReminderRecurrence = "none" | "daily" | "weekly";

export type MirrorUserReminder = {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  status: MirrorUserReminderStatus;
  created_at: string;
  updated_at: string;
  remind_at: string | null;
  recurrence: MirrorUserReminderRecurrence;
  related_task_id: string | null;
  tags: string[];
  last_delivered_at: string | null;
};

export type MirrorTaskStoreData = {
  tasks: MirrorUserTask[];
  drafts: MirrorUserDraftMetadata[];
  updated_at: string;
};

export type MirrorNotesStoreData = {
  entries: MirrorUserNoteEntry[];
  updated_at: string;
};

export type MirrorSessionStoreData = {
  recent_session: MirrorUserSessionSummary | null;
  updated_at: string;
};

export type MirrorReminderStoreData = {
  reminders: MirrorUserReminder[];
  updated_at: string;
};

export type MirrorUserWorkspace = {
  user_id: string;
  user_dir: string;
  profile: MirrorUserProfile;
  preferences: MirrorUserPreferences;
  tasks: MirrorUserTask[];
  drafts: MirrorUserDraftMetadata[];
  notes: MirrorUserNoteEntry[];
  reminders: MirrorUserReminder[];
  recent_session: MirrorUserSessionSummary | null;
  heartbeat: MirrorHeartbeatPreferences;
  monk_coder: MirrorMonkCoderContext;
};

export type MirrorUserWorkspacePaths = {
  user_dir: string;
  profile_path: string;
  preferences_path: string;
  tasks_path: string;
  notes_path: string;
  reminders_path: string;
  sessions_path: string;
  heartbeat_path: string;
  monk_coder_path: string;
};

export type MirrorWorkspaceStore = {
  users_root: string;
  ensureUserWorkspace: (userId: string) => Promise<MirrorUserWorkspacePaths>;
  resolveUserWorkspacePaths: (userId: string) => MirrorUserWorkspacePaths;
};

export type MirrorWorkspaceManager = {
  users_root: string;
  getUserWorkspace: (userId: string) => Promise<MirrorUserWorkspace>;
  getUserProfile: (userId: string) => Promise<MirrorUserProfile>;
  updateUserProfile: (
    userId: string,
    patch: Partial<Pick<MirrorUserProfile, "preferred_name">>,
  ) => Promise<MirrorUserProfile>;
  getUserPreferences: (userId: string) => Promise<MirrorUserPreferences>;
  updateUserPreferences: (
    userId: string,
    patch: Partial<Pick<MirrorUserPreferences, "language" | "tone">>,
  ) => Promise<MirrorUserPreferences>;
  listUserTasks: (userId: string) => Promise<MirrorUserTask[]>;
  upsertUserTask: (
    userId: string,
    task: Omit<MirrorUserTask, "created_at" | "updated_at"> &
      Partial<Pick<MirrorUserTask, "created_at" | "updated_at">>,
  ) => Promise<MirrorUserTask[]>;
  deleteUserTask: (userId: string, taskId: string) => Promise<MirrorUserTask[]>;
  listUserDrafts: (userId: string) => Promise<MirrorUserDraftMetadata[]>;
  upsertUserDraft: (
    userId: string,
    draft: Omit<MirrorUserDraftMetadata, "created_at" | "updated_at"> &
      Partial<Pick<MirrorUserDraftMetadata, "created_at" | "updated_at">>,
  ) => Promise<MirrorUserDraftMetadata[]>;
  listUserNotes: (userId: string) => Promise<MirrorUserNoteEntry[]>;
  appendUserNote: (
    userId: string,
    note: Pick<MirrorUserNoteEntry, "content"> &
      Partial<Pick<MirrorUserNoteEntry, "id" | "tags" | "created_at">>,
  ) => Promise<MirrorUserNoteEntry>;
  listUserReminders: (userId: string) => Promise<MirrorUserReminder[]>;
  upsertUserReminder: (
    userId: string,
    reminder: Omit<MirrorUserReminder, "created_at" | "updated_at"> &
      Partial<Pick<MirrorUserReminder, "created_at" | "updated_at">>,
  ) => Promise<MirrorUserReminder[]>;
  deleteUserReminder: (userId: string, reminderId: string) => Promise<MirrorUserReminder[]>;
  getRecentSessionSummary: (userId: string) => Promise<MirrorUserSessionSummary | null>;
  updateRecentSessionSummary: (
    userId: string,
    session: Omit<MirrorUserSessionSummary, "updated_at"> &
      Partial<Pick<MirrorUserSessionSummary, "updated_at">>,
  ) => Promise<MirrorUserSessionSummary>;
  getHeartbeatPreferences: (userId: string) => Promise<MirrorHeartbeatPreferences>;
  updateHeartbeatPreferences: (
    userId: string,
    patch: Partial<Omit<MirrorHeartbeatPreferences, "updated_at">>,
  ) => Promise<MirrorHeartbeatPreferences>;
  getMonkCoderContext: (userId: string) => Promise<MirrorMonkCoderContext>;
  updateMonkCoderContext: (
    userId: string,
    patch: Partial<Omit<MirrorMonkCoderContext, "updated_at">>,
  ) => Promise<MirrorMonkCoderContext>;
};
