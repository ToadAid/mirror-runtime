import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import {
  createMirrorWorkspaceManager,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import { buildMonkWorkspaceContext } from "./monk_context.js";
import { buildMonkDraftView } from "./monk_draft_view.js";
import { buildMonkSessionView } from "./monk_session_view.js";
import { buildMonkTaskView } from "./monk_task_view.js";
import type { MirrorMonkWorkspaceBridge } from "./monk_types.js";

export function createMirrorMonkWorkspaceBridge(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorMonkWorkspaceBridge {
  const taskManager = createMirrorTaskManager(workspaceManager);
  const reminderManager = createMirrorReminderManager(workspaceManager);

  return {
    async getMonkWorkspaceContext(userId, now = new Date()) {
      const [workspace, dueReminders] = await Promise.all([
        workspaceManager.getUserWorkspace(userId),
        reminderManager.getDueReminders(userId, now),
      ]);

      return buildMonkWorkspaceContext({
        userId,
        profile: workspace.profile,
        preferences: workspace.preferences,
        tasks: workspace.tasks,
        dueReminders,
        drafts: workspace.drafts,
        recentSession: workspace.recent_session,
        heartbeat: workspace.heartbeat,
        monkSharedContext: workspace.monk_coder,
        notes: workspace.notes,
      });
    },
    async getMonkActiveTasks(userId) {
      const tasks = await taskManager.listTasks(userId);
      return buildMonkTaskView(tasks);
    },
    async getMonkDueReminders(userId, now = new Date()) {
      return reminderManager.getDueReminders(userId, now);
    },
    async getMonkDraftContext(userId) {
      const [drafts, tasks] = await Promise.all([
        workspaceManager.listUserDrafts(userId),
        workspaceManager.listUserTasks(userId),
      ]);
      return buildMonkDraftView(drafts, tasks);
    },
    async getMonkRecentSessionContext(userId) {
      const recentSession = await workspaceManager.getRecentSessionSummary(userId);
      return buildMonkSessionView(recentSession);
    },
    async getMonkSharedContext(userId) {
      return workspaceManager.getMonkCoderContext(userId);
    },
    async updateMonkSharedContext(userId, patch) {
      return workspaceManager.updateMonkCoderContext(userId, patch);
    },
    async appendMonkCoderNote(userId, content) {
      const note = await workspaceManager.appendUserNote(userId, {
        content,
        tags: ["monk"],
      });
      return {
        id: note.id,
        content: note.content,
        created_at: note.created_at,
      };
    },
  };
}
