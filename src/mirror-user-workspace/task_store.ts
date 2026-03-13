import {
  createDefaultTaskStoreData,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type {
  MirrorTaskStoreData,
  MirrorUserDraftMetadata,
  MirrorUserTask,
} from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function readTaskStore(filePath: string): Promise<MirrorTaskStoreData> {
  return readWorkspaceJson(filePath, createDefaultTaskStoreData());
}

export async function listUserTasksFromFile(filePath: string): Promise<MirrorUserTask[]> {
  const store = await readTaskStore(filePath);
  return store.tasks;
}

export async function upsertUserTaskInFile(
  filePath: string,
  task: Omit<MirrorUserTask, "created_at" | "updated_at"> &
    Partial<Pick<MirrorUserTask, "created_at" | "updated_at">>,
): Promise<MirrorUserTask[]> {
  const store = await readTaskStore(filePath);
  const timestamp = nowIso();
  const nextTask: MirrorUserTask = {
    ...task,
    description: task.description ?? null,
    due_at: task.due_at ?? null,
    tags: [...(task.tags ?? [])],
    related_draft_id: task.related_draft_id ?? null,
    created_at: task.created_at ?? timestamp,
    updated_at: task.updated_at ?? timestamp,
  };
  const existingIndex = store.tasks.findIndex((entry) => entry.id === task.id);
  if (existingIndex >= 0) {
    const previous = store.tasks[existingIndex];
    store.tasks[existingIndex] = {
      ...previous,
      ...nextTask,
      created_at: previous.created_at,
      updated_at: timestamp,
    };
  } else {
    store.tasks.push(nextTask);
  }
  store.updated_at = timestamp;
  await writeWorkspaceJson(filePath, store);
  return store.tasks;
}

export async function deleteUserTaskFromFile(
  filePath: string,
  taskId: string,
): Promise<MirrorUserTask[]> {
  const store = await readTaskStore(filePath);
  const nextTasks = store.tasks.filter((entry) => entry.id !== taskId);
  if (nextTasks.length === store.tasks.length) {
    return store.tasks;
  }
  store.tasks = nextTasks;
  store.updated_at = nowIso();
  await writeWorkspaceJson(filePath, store);
  return store.tasks;
}

export async function listUserDraftsFromFile(filePath: string): Promise<MirrorUserDraftMetadata[]> {
  const store = await readTaskStore(filePath);
  return store.drafts;
}

export async function upsertUserDraftInFile(
  filePath: string,
  draft: Omit<MirrorUserDraftMetadata, "created_at" | "updated_at"> &
    Partial<Pick<MirrorUserDraftMetadata, "created_at" | "updated_at">>,
): Promise<MirrorUserDraftMetadata[]> {
  const store = await readTaskStore(filePath);
  const timestamp = nowIso();
  const nextDraft: MirrorUserDraftMetadata = {
    ...draft,
    path: draft.path ?? null,
    created_at: draft.created_at ?? timestamp,
    updated_at: draft.updated_at ?? timestamp,
  };
  const existingIndex = store.drafts.findIndex((entry) => entry.id === draft.id);
  if (existingIndex >= 0) {
    const previous = store.drafts[existingIndex];
    store.drafts[existingIndex] = {
      ...previous,
      ...nextDraft,
      created_at: previous.created_at,
      updated_at: timestamp,
    };
  } else {
    store.drafts.push(nextDraft);
  }
  store.updated_at = timestamp;
  await writeWorkspaceJson(filePath, store);
  return store.drafts;
}
