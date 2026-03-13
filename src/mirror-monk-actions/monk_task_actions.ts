import type { MirrorTask } from "../mirror-task/index.js";
import type { MirrorUserDraftMetadata } from "../mirror-user-workspace/index.js";
import type { MirrorMonkActionResult } from "./monk_action_types.js";

function dueTimestamp(task: MirrorTask): number {
  return task.due_at ? Date.parse(task.due_at) : Number.POSITIVE_INFINITY;
}

function relatedDraftForTask(
  task: MirrorTask,
  drafts: MirrorUserDraftMetadata[],
): MirrorUserDraftMetadata | undefined {
  if (!task.related_draft_id) {
    return undefined;
  }
  return drafts.find((draft) => draft.id === task.related_draft_id);
}

export function selectNextMonkTask(
  userId: string,
  tasks: MirrorTask[],
  drafts: MirrorUserDraftMetadata[],
): MirrorMonkActionResult | null {
  const activeTasks = tasks
    .filter((task) => task.status === "active")
    .toSorted(
      (a, b) => dueTimestamp(a) - dueTimestamp(b) || a.created_at.localeCompare(b.created_at),
    );

  const task = activeTasks[0];
  if (!task) {
    return null;
  }
  const draft = relatedDraftForTask(task, drafts);
  const contextNotes = [
    task.description ? `Task detail: ${task.description}` : "No task description recorded.",
    task.due_at ? `Due at ${task.due_at}.` : "No due time recorded.",
  ];
  if (draft) {
    contextNotes.push(`Related draft: ${draft.title}`);
  }

  return {
    kind: "next_task",
    user_id: userId,
    source: "task",
    summary: `Next active task: ${task.title}.`,
    suggested_action: draft
      ? `Review the task and continue the linked draft "${draft.title}".`
      : `Review the task and take the next explicit step on "${task.title}".`,
    related_task_id: task.id,
    related_draft_id: draft?.id,
    context_notes: contextNotes,
  };
}

export function buildMonkTaskFollowup(
  userId: string,
  task: MirrorTask,
  drafts: MirrorUserDraftMetadata[],
): MirrorMonkActionResult {
  const draft = relatedDraftForTask(task, drafts);
  const contextNotes = [
    task.description ? `Task detail: ${task.description}` : "No task description recorded.",
    task.tags.length > 0 ? `Tags: ${task.tags.join(", ")}.` : "No task tags recorded.",
  ];
  if (task.due_at) {
    contextNotes.push(`Due at ${task.due_at}.`);
  }
  if (draft) {
    contextNotes.push(`Linked draft path: ${draft.path ?? "unassigned"}.`);
  }

  return {
    kind: "task_followup",
    user_id: userId,
    source: "task",
    summary: `Task "${task.title}" is still unfinished.`,
    suggested_action: draft
      ? `Resume work on "${task.title}" and use the linked draft "${draft.title}" as the working anchor.`
      : `Resume work on "${task.title}" and define the next concrete user-visible step.`,
    related_task_id: task.id,
    related_draft_id: draft?.id,
    context_notes: contextNotes,
  };
}

export function buildMonkOpenWorkSummary(
  userId: string,
  tasks: MirrorTask[],
  dueRemindersCount: number,
): MirrorMonkActionResult {
  const activeTasks = tasks.filter((task) => task.status === "active");
  const pausedTasks = tasks.filter((task) => task.status === "paused");

  return {
    kind: "open_work_summary",
    user_id: userId,
    source: "workspace",
    summary: `Open work: ${activeTasks.length} active task(s), ${pausedTasks.length} paused task(s), ${dueRemindersCount} due reminder(s).`,
    suggested_action:
      activeTasks.length > 0
        ? `Start with the highest-priority active task: "${activeTasks[0]?.title}".`
        : "No active tasks are open. Review paused tasks or create the next explicit work item.",
    related_task_id: activeTasks[0]?.id,
    context_notes: [
      activeTasks.length > 0
        ? `Top active task: ${activeTasks[0]?.title}.`
        : "No active tasks recorded.",
      pausedTasks.length > 0
        ? `Paused tasks: ${pausedTasks.map((task) => task.title).join(", ")}.`
        : "No paused tasks recorded.",
    ],
  };
}
