import crypto from "node:crypto";
import {
  createMirrorWorkspaceManager,
  type MirrorUserTask,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import { filterDueReminders, getReminderScheduleState } from "./reminder_scheduler.js";
import { createMirrorReminderStore, type MirrorReminderStore } from "./reminder_store.js";
import type { MirrorReminder, MirrorReminderManager } from "./reminder_types.js";

function normalizeTags(tags: string[] | undefined): string[] {
  return tags ? [...tags] : [];
}

async function requireReminder(
  reminderStore: MirrorReminderStore,
  userId: string,
  reminderId: string,
): Promise<MirrorReminder> {
  const reminders = await reminderStore.listReminders(userId);
  const reminder = reminders.find((entry) => entry.id === reminderId);
  if (!reminder) {
    throw new Error(`Mirror reminder not found: ${reminderId}`);
  }
  return reminder;
}

async function requireRelatedTask(
  workspaceManager: MirrorWorkspaceManager,
  userId: string,
  taskId: string,
): Promise<MirrorUserTask> {
  const tasks = await workspaceManager.listUserTasks(userId);
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Mirror task not found for reminder link: ${taskId}`);
  }
  return task;
}

async function validateRelatedTask(
  workspaceManager: MirrorWorkspaceManager,
  userId: string,
  relatedTaskId: string | null | undefined,
): Promise<void> {
  if (!relatedTaskId) {
    return;
  }
  await requireRelatedTask(workspaceManager, userId, relatedTaskId);
}

export function createMirrorReminderManager(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorReminderManager {
  const reminderStore = createMirrorReminderStore(workspaceManager);

  return {
    async createReminder(userId, input) {
      await validateRelatedTask(workspaceManager, userId, input.related_task_id);
      const reminderId = crypto.randomUUID();
      const reminders = await reminderStore.upsertReminder(userId, {
        id: reminderId,
        user_id: userId,
        title: input.title,
        message: input.message ?? null,
        status: "active",
        remind_at: input.remind_at ?? null,
        recurrence: input.recurrence ?? "none",
        related_task_id: input.related_task_id ?? null,
        tags: normalizeTags(input.tags),
        last_delivered_at: null,
      });
      return reminders.find((entry) => entry.id === reminderId) as MirrorReminder;
    },
    async listReminders(userId) {
      return reminderStore.listReminders(userId);
    },
    async updateReminder(userId, reminderId, input) {
      const existing = await requireReminder(reminderStore, userId, reminderId);
      const nextRelatedTaskId =
        input.related_task_id === undefined ? existing.related_task_id : input.related_task_id;
      await validateRelatedTask(workspaceManager, userId, nextRelatedTaskId);
      const reminders = await reminderStore.upsertReminder(userId, {
        ...existing,
        title: input.title ?? existing.title,
        message: input.message === undefined ? existing.message : input.message,
        status: input.status ?? existing.status,
        remind_at: input.remind_at === undefined ? existing.remind_at : input.remind_at,
        recurrence: input.recurrence ?? existing.recurrence,
        related_task_id: nextRelatedTaskId ?? null,
        tags: input.tags ? normalizeTags(input.tags) : existing.tags,
        last_delivered_at: existing.last_delivered_at,
      });
      return reminders.find((entry) => entry.id === reminderId) as MirrorReminder;
    },
    async deleteReminder(userId, reminderId) {
      const before = await reminderStore.listReminders(userId);
      const next = await reminderStore.deleteReminder(userId, reminderId);
      return next.length !== before.length;
    },
    async enableReminder(userId, reminderId) {
      return this.updateReminder(userId, reminderId, { status: "active" });
    },
    async disableReminder(userId, reminderId) {
      return this.updateReminder(userId, reminderId, { status: "paused" });
    },
    async markReminderDelivered(userId, reminderId, deliveredAt = new Date().toISOString()) {
      const existing = await requireReminder(reminderStore, userId, reminderId);
      const status = existing.recurrence === "none" ? "delivered" : "active";
      const reminders = await reminderStore.upsertReminder(userId, {
        ...existing,
        status,
        last_delivered_at: deliveredAt,
      });
      return reminders.find((entry) => entry.id === reminderId) as MirrorReminder;
    },
    getReminderScheduleState(reminder, now) {
      return getReminderScheduleState(reminder, now);
    },
    async getDueReminders(userId, now = new Date()) {
      const reminders = await reminderStore.listReminders(userId);
      return filterDueReminders(reminders, now);
    },
  };
}
