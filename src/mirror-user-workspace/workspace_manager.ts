import { readHeartbeatPreferences, updateHeartbeatPreferencesFile } from "./heartbeat_store.js";
import { updateMonkCoderContextFile, readMonkCoderContext } from "./monk_context_store.js";
import { appendUserNoteToFile, listUserNotesFromFile } from "./notes_store.js";
import {
  readUserPreferences,
  readUserProfile,
  updateUserPreferencesFile,
  updateUserProfileFile,
} from "./profile_store.js";
import {
  deleteUserReminderFromFile,
  listUserRemindersFromFile,
  upsertUserReminderInFile,
} from "./reminder_store.js";
import {
  getRecentSessionSummaryFromFile,
  updateRecentSessionSummaryFile,
} from "./session_store.js";
import {
  deleteUserTaskFromFile,
  listUserDraftsFromFile,
  listUserTasksFromFile,
  upsertUserDraftInFile,
  upsertUserTaskInFile,
} from "./task_store.js";
import { createMirrorWorkspaceStore } from "./workspace_store.js";
import type { MirrorWorkspaceManager } from "./workspace_types.js";

export function createMirrorWorkspaceManager(rootOverride?: string): MirrorWorkspaceManager {
  const store = createMirrorWorkspaceStore(rootOverride);

  return {
    users_root: store.users_root,
    async getUserWorkspace(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      const [
        profile,
        preferences,
        tasks,
        drafts,
        notes,
        reminders,
        recentSession,
        heartbeat,
        monkCoder,
      ] = await Promise.all([
        readUserProfile(paths.profile_path, userId),
        readUserPreferences(paths.preferences_path),
        listUserTasksFromFile(paths.tasks_path),
        listUserDraftsFromFile(paths.tasks_path),
        listUserNotesFromFile(paths.notes_path),
        listUserRemindersFromFile(paths.reminders_path),
        getRecentSessionSummaryFromFile(paths.sessions_path),
        readHeartbeatPreferences(paths.heartbeat_path),
        readMonkCoderContext(paths.monk_coder_path),
      ]);

      return {
        user_id: userId,
        user_dir: paths.user_dir,
        profile,
        preferences,
        tasks,
        drafts,
        notes,
        reminders,
        recent_session: recentSession,
        heartbeat,
        monk_coder: monkCoder,
      };
    },
    async getUserProfile(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return readUserProfile(paths.profile_path, userId);
    },
    async updateUserProfile(userId, patch) {
      const paths = await store.ensureUserWorkspace(userId);
      return updateUserProfileFile(paths.profile_path, userId, patch);
    },
    async getUserPreferences(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return readUserPreferences(paths.preferences_path);
    },
    async updateUserPreferences(userId, patch) {
      const paths = await store.ensureUserWorkspace(userId);
      return updateUserPreferencesFile(paths.preferences_path, patch);
    },
    async listUserTasks(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return listUserTasksFromFile(paths.tasks_path);
    },
    async upsertUserTask(userId, task) {
      const paths = await store.ensureUserWorkspace(userId);
      return upsertUserTaskInFile(paths.tasks_path, task);
    },
    async deleteUserTask(userId, taskId) {
      const paths = await store.ensureUserWorkspace(userId);
      return deleteUserTaskFromFile(paths.tasks_path, taskId);
    },
    async listUserDrafts(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return listUserDraftsFromFile(paths.tasks_path);
    },
    async upsertUserDraft(userId, draft) {
      const paths = await store.ensureUserWorkspace(userId);
      return upsertUserDraftInFile(paths.tasks_path, draft);
    },
    async listUserNotes(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return listUserNotesFromFile(paths.notes_path);
    },
    async appendUserNote(userId, note) {
      const paths = await store.ensureUserWorkspace(userId);
      return appendUserNoteToFile(paths.notes_path, note);
    },
    async listUserReminders(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return listUserRemindersFromFile(paths.reminders_path);
    },
    async upsertUserReminder(userId, reminder) {
      const paths = await store.ensureUserWorkspace(userId);
      return upsertUserReminderInFile(paths.reminders_path, reminder);
    },
    async deleteUserReminder(userId, reminderId) {
      const paths = await store.ensureUserWorkspace(userId);
      return deleteUserReminderFromFile(paths.reminders_path, reminderId);
    },
    async getRecentSessionSummary(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return getRecentSessionSummaryFromFile(paths.sessions_path);
    },
    async updateRecentSessionSummary(userId, session) {
      const paths = await store.ensureUserWorkspace(userId);
      return updateRecentSessionSummaryFile(paths.sessions_path, session);
    },
    async getHeartbeatPreferences(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return readHeartbeatPreferences(paths.heartbeat_path);
    },
    async updateHeartbeatPreferences(userId, patch) {
      const paths = await store.ensureUserWorkspace(userId);
      return updateHeartbeatPreferencesFile(paths.heartbeat_path, patch);
    },
    async getMonkCoderContext(userId) {
      const paths = await store.ensureUserWorkspace(userId);
      return readMonkCoderContext(paths.monk_coder_path);
    },
    async updateMonkCoderContext(userId, patch) {
      const paths = await store.ensureUserWorkspace(userId);
      return updateMonkCoderContextFile(paths.monk_coder_path, patch);
    },
  };
}
