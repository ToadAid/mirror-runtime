import {
  createMirrorWorkspaceManager,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import type { MirrorReminder } from "./reminder_types.js";

export type MirrorReminderStore = {
  listReminders: (userId: string) => Promise<MirrorReminder[]>;
  upsertReminder: (userId: string, reminder: MirrorReminder) => Promise<MirrorReminder[]>;
  deleteReminder: (userId: string, reminderId: string) => Promise<MirrorReminder[]>;
};

export function createMirrorReminderStore(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorReminderStore {
  return {
    listReminders(userId) {
      return workspaceManager.listUserReminders(userId);
    },
    upsertReminder(userId, reminder) {
      return workspaceManager.upsertUserReminder(userId, reminder);
    },
    deleteReminder(userId, reminderId) {
      return workspaceManager.deleteUserReminder(userId, reminderId);
    },
  };
}
