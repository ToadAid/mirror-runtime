import type {
  MirrorUserReminder,
  MirrorUserReminderRecurrence,
  MirrorUserReminderStatus,
} from "../mirror-user-workspace/index.js";

export type MirrorReminder = MirrorUserReminder;
export type MirrorReminderRecurrence = MirrorUserReminderRecurrence;
export type MirrorReminderStatusValue = MirrorUserReminderStatus;

export type CreateMirrorReminderInput = {
  title: string;
  message?: string;
  remind_at?: string;
  recurrence?: MirrorReminderRecurrence;
  related_task_id?: string;
  tags?: string[];
};

export type UpdateMirrorReminderInput = {
  title?: string;
  message?: string | null;
  status?: MirrorReminderStatusValue;
  remind_at?: string | null;
  recurrence?: MirrorReminderRecurrence;
  related_task_id?: string | null;
  tags?: string[];
};

export type MirrorReminderScheduleState = {
  reminder_id: string;
  is_due: boolean;
  next_fire_at: string | null;
};

export type MirrorReminderManager = {
  createReminder: (userId: string, input: CreateMirrorReminderInput) => Promise<MirrorReminder>;
  listReminders: (userId: string) => Promise<MirrorReminder[]>;
  updateReminder: (
    userId: string,
    reminderId: string,
    input: UpdateMirrorReminderInput,
  ) => Promise<MirrorReminder>;
  deleteReminder: (userId: string, reminderId: string) => Promise<boolean>;
  enableReminder: (userId: string, reminderId: string) => Promise<MirrorReminder>;
  disableReminder: (userId: string, reminderId: string) => Promise<MirrorReminder>;
  markReminderDelivered: (
    userId: string,
    reminderId: string,
    deliveredAt?: string,
  ) => Promise<MirrorReminder>;
  getReminderScheduleState: (reminder: MirrorReminder, now?: Date) => MirrorReminderScheduleState;
  getDueReminders: (userId: string, now?: Date) => Promise<MirrorReminder[]>;
};
