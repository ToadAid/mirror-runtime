import type { MirrorReminder, MirrorReminderScheduleState } from "./reminder_types.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

function toIso(valueMs: number): string {
  return new Date(valueMs).toISOString();
}

function parseTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recurrenceStepMs(recurrence: MirrorReminder["recurrence"]): number | null {
  switch (recurrence) {
    case "daily":
      return ONE_DAY_MS;
    case "weekly":
      return ONE_WEEK_MS;
    default:
      return null;
  }
}

export function getReminderScheduleState(
  reminder: MirrorReminder,
  now: Date = new Date(),
): MirrorReminderScheduleState {
  if (reminder.status !== "active") {
    return {
      reminder_id: reminder.id,
      is_due: false,
      next_fire_at: null,
    };
  }

  const remindAtMs = parseTimestamp(reminder.remind_at);
  if (remindAtMs === null) {
    return {
      reminder_id: reminder.id,
      is_due: false,
      next_fire_at: null,
    };
  }

  const stepMs = recurrenceStepMs(reminder.recurrence);
  if (stepMs === null) {
    return {
      reminder_id: reminder.id,
      is_due: remindAtMs <= now.getTime(),
      next_fire_at: reminder.last_delivered_at ? null : reminder.remind_at,
    };
  }

  const lastDeliveredMs = parseTimestamp(reminder.last_delivered_at);
  let nextFireMs = remindAtMs;
  if (lastDeliveredMs !== null && lastDeliveredMs >= remindAtMs) {
    const elapsed = lastDeliveredMs - remindAtMs;
    const intervals = Math.floor(elapsed / stepMs) + 1;
    nextFireMs = remindAtMs + intervals * stepMs;
  }
  while (nextFireMs <= now.getTime() - stepMs) {
    nextFireMs += stepMs;
  }

  return {
    reminder_id: reminder.id,
    is_due: nextFireMs <= now.getTime(),
    next_fire_at: toIso(nextFireMs),
  };
}

export function filterDueReminders(
  reminders: MirrorReminder[],
  now: Date = new Date(),
): MirrorReminder[] {
  return reminders.filter((reminder) => getReminderScheduleState(reminder, now).is_due);
}
