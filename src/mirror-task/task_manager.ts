import crypto from "node:crypto";
import {
  createMirrorWorkspaceManager,
  type MirrorUserTask,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import type {
  CreateMirrorTaskInput,
  MirrorTask,
  MirrorTaskManager,
  UpdateMirrorTaskInput,
} from "./task_types.js";

function normalizeTags(tags: string[] | undefined): string[] {
  return tags ? [...tags] : [];
}

async function requireTask(
  workspaceManager: MirrorWorkspaceManager,
  userId: string,
  taskId: string,
): Promise<MirrorUserTask> {
  const tasks = await workspaceManager.listUserTasks(userId);
  const task = tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Mirror task not found: ${taskId}`);
  }
  return task;
}

export function createMirrorTaskManager(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorTaskManager {
  return {
    async createTask(userId: string, input: CreateMirrorTaskInput): Promise<MirrorTask> {
      const taskId = crypto.randomUUID();
      const tasks = await workspaceManager.upsertUserTask(userId, {
        id: taskId,
        title: input.title,
        description: input.description ?? null,
        status: "active",
        due_at: input.due_at ?? null,
        tags: normalizeTags(input.tags),
        related_draft_id: input.related_draft_id ?? null,
      });
      return tasks.find((entry) => entry.id === taskId) as MirrorTask;
    },
    async listTasks(userId: string): Promise<MirrorTask[]> {
      return workspaceManager.listUserTasks(userId);
    },
    async updateTask(
      userId: string,
      taskId: string,
      input: UpdateMirrorTaskInput,
    ): Promise<MirrorTask> {
      const existing = await requireTask(workspaceManager, userId, taskId);
      const tasks = await workspaceManager.upsertUserTask(userId, {
        ...existing,
        title: input.title ?? existing.title,
        description: input.description === undefined ? existing.description : input.description,
        status: input.status ?? existing.status,
        due_at: input.due_at === undefined ? existing.due_at : input.due_at,
        tags: input.tags ? normalizeTags(input.tags) : existing.tags,
        related_draft_id:
          input.related_draft_id === undefined ? existing.related_draft_id : input.related_draft_id,
      });
      return tasks.find((entry) => entry.id === taskId) as MirrorTask;
    },
    async completeTask(userId: string, taskId: string): Promise<MirrorTask> {
      return this.updateTask(userId, taskId, { status: "done" });
    },
    async deleteTask(userId: string, taskId: string): Promise<boolean> {
      const before = await workspaceManager.listUserTasks(userId);
      const next = await workspaceManager.deleteUserTask(userId, taskId);
      return next.length !== before.length;
    },
  };
}
