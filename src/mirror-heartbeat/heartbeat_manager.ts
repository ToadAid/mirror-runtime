import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import {
  createMirrorWorkspaceManager,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import { evaluateHeartbeat } from "./heartbeat_evaluator.js";
import { createMirrorHeartbeatStore } from "./heartbeat_store.js";
import { renderHeartbeatTemplate } from "./heartbeat_templates.js";
import type { MirrorHeartbeatManager } from "./heartbeat_types.js";

export function createMirrorHeartbeatManager(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorHeartbeatManager {
  const heartbeatStore = createMirrorHeartbeatStore(workspaceManager);
  const taskManager = createMirrorTaskManager(workspaceManager);
  const reminderManager = createMirrorReminderManager(workspaceManager);

  return {
    async getHeartbeatState(userId) {
      return heartbeatStore.getState(userId);
    },
    async updateHeartbeatPreferences(userId, patch) {
      return heartbeatStore.updateState(userId, patch);
    },
    async recordUserSeen(userId, seenAt = new Date().toISOString()) {
      return heartbeatStore.updateState(userId, { last_seen_at: seenAt });
    },
    async recordHeartbeatCheck(userId, checkedAt = new Date().toISOString()) {
      return heartbeatStore.updateState(userId, { last_check_in_at: checkedAt });
    },
    async isHeartbeatDue(userId, now = new Date()) {
      const evaluation = await this.getHeartbeatEvaluation(userId, now);
      return evaluation.due;
    },
    async getHeartbeatEvaluation(userId, now = new Date()) {
      const [heartbeat, tasks, reminders, session] = await Promise.all([
        heartbeatStore.getState(userId),
        taskManager.listTasks(userId),
        reminderManager.listReminders(userId),
        workspaceManager.getRecentSessionSummary(userId),
      ]);

      return evaluateHeartbeat({
        heartbeat,
        tasks,
        reminders,
        recent_session: session,
        now,
      });
    },
    async getSuggestedHeartbeatMessage(userId, now = new Date()) {
      const [workspace, evaluation] = await Promise.all([
        workspaceManager.getUserWorkspace(userId),
        this.getHeartbeatEvaluation(userId, now),
      ]);
      const rendered = renderHeartbeatTemplate({
        preferred_name: workspace.profile.preferred_name,
        tone: evaluation.enabled ? workspace.heartbeat.preferred_tone : "gentle",
      });
      return rendered;
    },
  };
}
