import {
  createDefaultReminderStoreData,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorReminderStoreData, MirrorUserReminder } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function readReminderStore(filePath: string): Promise<MirrorReminderStoreData> {
  return readWorkspaceJson(filePath, createDefaultReminderStoreData());
}

export async function listUserRemindersFromFile(filePath: string): Promise<MirrorUserReminder[]> {
  const store = await readReminderStore(filePath);
  return store.reminders;
}

export async function upsertUserReminderInFile(
  filePath: string,
  reminder: Omit<MirrorUserReminder, "created_at" | "updated_at"> &
    Partial<Pick<MirrorUserReminder, "created_at" | "updated_at">>,
): Promise<MirrorUserReminder[]> {
  const store = await readReminderStore(filePath);
  const timestamp = nowIso();
  const nextReminder: MirrorUserReminder = {
    ...reminder,
    message: reminder.message ?? null,
    remind_at: reminder.remind_at ?? null,
    tags: [...(reminder.tags ?? [])],
    related_task_id: reminder.related_task_id ?? null,
    last_delivered_at: reminder.last_delivered_at ?? null,
    created_at: reminder.created_at ?? timestamp,
    updated_at: reminder.updated_at ?? timestamp,
  };
  const existingIndex = store.reminders.findIndex((entry) => entry.id === reminder.id);
  if (existingIndex >= 0) {
    const previous = store.reminders[existingIndex];
    store.reminders[existingIndex] = {
      ...previous,
      ...nextReminder,
      created_at: previous.created_at,
      updated_at: timestamp,
    };
  } else {
    store.reminders.push(nextReminder);
  }
  store.updated_at = timestamp;
  await writeWorkspaceJson(filePath, store);
  return store.reminders;
}

export async function deleteUserReminderFromFile(
  filePath: string,
  reminderId: string,
): Promise<MirrorUserReminder[]> {
  const store = await readReminderStore(filePath);
  const nextReminders = store.reminders.filter((entry) => entry.id !== reminderId);
  if (nextReminders.length === store.reminders.length) {
    return store.reminders;
  }
  store.reminders = nextReminders;
  store.updated_at = nowIso();
  await writeWorkspaceJson(filePath, store);
  return store.reminders;
}
