import { createMirrorHeartbeatManager } from "../mirror-heartbeat/index.js";
import { createMirrorMonkWorkspaceBridge } from "../mirror-monk/index.js";
import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import {
  createMirrorWorkspaceManager,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import type { MirrorMonkActions } from "./monk_action_types.js";
import {
  buildDueReminderActions,
  buildReminderLinkedTaskFollowup,
} from "./monk_reminder_actions.js";
import { buildMonkResumeContext, buildSuggestedResumeAction } from "./monk_resume.js";
import {
  buildMonkOpenWorkSummary,
  buildMonkTaskFollowup,
  selectNextMonkTask,
} from "./monk_task_actions.js";

export function createMirrorMonkActions(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorMonkActions {
  const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);
  const taskManager = createMirrorTaskManager(workspaceManager);
  const reminderManager = createMirrorReminderManager(workspaceManager);
  const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

  return {
    async getNextMonkTask(userId, _now = new Date()) {
      const [tasks, draftContext] = await Promise.all([
        taskManager.listTasks(userId),
        monkBridge.getMonkDraftContext(userId),
      ]);
      return selectNextMonkTask(userId, tasks, draftContext.drafts);
    },
    async getMonkTaskFollowup(userId, taskId, _now = new Date()) {
      const [tasks, draftContext] = await Promise.all([
        taskManager.listTasks(userId),
        monkBridge.getMonkDraftContext(userId),
      ]);
      const task = tasks.find((entry) => entry.id === taskId);
      if (!task) {
        return null;
      }
      return buildMonkTaskFollowup(userId, task, draftContext.drafts);
    },
    async summarizeMonkOpenWork(userId, now = new Date()) {
      const [tasks, dueReminders] = await Promise.all([
        taskManager.listTasks(userId),
        reminderManager.getDueReminders(userId, now),
      ]);
      return buildMonkOpenWorkSummary(userId, tasks, dueReminders.length);
    },
    async getMonkDueReminderActions(userId, now = new Date()) {
      const [dueReminders, tasks] = await Promise.all([
        reminderManager.getDueReminders(userId, now),
        taskManager.listTasks(userId),
      ]);
      return buildDueReminderActions(userId, dueReminders, tasks);
    },
    async getReminderLinkedTaskFollowup(userId, reminderId, now = new Date()) {
      const [dueReminders, tasks] = await Promise.all([
        reminderManager.getDueReminders(userId, now),
        taskManager.listTasks(userId),
      ]);
      const reminder = dueReminders.find((entry) => entry.id === reminderId);
      if (!reminder) {
        return null;
      }
      return buildReminderLinkedTaskFollowup(userId, reminder, tasks);
    },
    async getMonkResumeContext(userId, now = new Date()) {
      const [workspace, heartbeatEvaluation] = await Promise.all([
        monkBridge.getMonkWorkspaceContext(userId, now),
        heartbeatManager.getHeartbeatEvaluation(userId, now),
      ]);
      return buildMonkResumeContext({ workspace, heartbeatEvaluation });
    },
    async suggestMonkResumeAction(userId, now = new Date()) {
      const resumeContext = await this.getMonkResumeContext(userId, now);
      return buildSuggestedResumeAction(userId, resumeContext);
    },
    async appendMonkFollowupNote(userId, note) {
      return monkBridge.appendMonkCoderNote(userId, `Monk follow-up: ${note}`);
    },
    async recordMonkSuggestedAction(userId, action) {
      const lines = [
        `Suggested action kind: ${action.kind}`,
        `Summary: ${action.summary}`,
        `Suggested action: ${action.suggested_action}`,
      ];
      if (action.related_task_id) {
        lines.push(`Task: ${action.related_task_id}`);
      }
      if (action.related_reminder_id) {
        lines.push(`Reminder: ${action.related_reminder_id}`);
      }
      if (action.related_draft_id) {
        lines.push(`Draft: ${action.related_draft_id}`);
      }
      return monkBridge.appendMonkCoderNote(userId, lines.join("\n"));
    },
  };
}
