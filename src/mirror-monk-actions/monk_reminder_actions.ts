import type { MirrorReminder } from "../mirror-reminder/index.js";
import type { MirrorTask } from "../mirror-task/index.js";
import type { MirrorMonkActionResult } from "./monk_action_types.js";

function taskForReminder(reminder: MirrorReminder, tasks: MirrorTask[]): MirrorTask | undefined {
  if (!reminder.related_task_id) {
    return undefined;
  }
  return tasks.find((task) => task.id === reminder.related_task_id);
}

export function buildDueReminderActions(
  userId: string,
  reminders: MirrorReminder[],
  tasks: MirrorTask[],
): MirrorMonkActionResult[] {
  return reminders.map((reminder) => {
    const task = taskForReminder(reminder, tasks);
    return {
      kind: "due_reminder",
      user_id: userId,
      source: "reminder",
      summary: `Reminder due: ${reminder.title}.`,
      suggested_action: task
        ? `Use this reminder to resume the linked task "${task.title}".`
        : `Review the reminder and decide on the next explicit follow-up step.`,
      related_task_id: task?.id,
      related_reminder_id: reminder.id,
      context_notes: [
        reminder.message
          ? `Reminder message: ${reminder.message}`
          : "No reminder message recorded.",
        reminder.remind_at ? `Scheduled for ${reminder.remind_at}.` : "No reminder time recorded.",
      ],
    };
  });
}

export function buildReminderLinkedTaskFollowup(
  userId: string,
  reminder: MirrorReminder,
  tasks: MirrorTask[],
): MirrorMonkActionResult | null {
  const task = taskForReminder(reminder, tasks);
  if (!task) {
    return null;
  }

  return {
    kind: "reminder_followup",
    user_id: userId,
    source: "reminder",
    summary: `Reminder "${reminder.title}" points to unfinished task "${task.title}".`,
    suggested_action: `Resume "${task.title}" from the reminder context and confirm the next explicit step.`,
    related_task_id: task.id,
    related_reminder_id: reminder.id,
    context_notes: [
      reminder.message ? `Reminder message: ${reminder.message}` : "No reminder message recorded.",
      task.description ? `Task detail: ${task.description}` : "No task description recorded.",
    ],
  };
}
