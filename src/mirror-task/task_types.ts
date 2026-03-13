import type { MirrorUserTask, MirrorUserTaskStatus } from "../mirror-user-workspace/index.js";

export type MirrorTask = MirrorUserTask;
export type MirrorTaskStatusValue = MirrorUserTaskStatus;

export type CreateMirrorTaskInput = {
  title: string;
  description?: string;
  due_at?: string;
  tags?: string[];
  related_draft_id?: string;
};

export type UpdateMirrorTaskInput = {
  title?: string;
  description?: string | null;
  status?: MirrorTaskStatusValue;
  due_at?: string | null;
  tags?: string[];
  related_draft_id?: string | null;
};

export type MirrorTaskManager = {
  createTask: (userId: string, input: CreateMirrorTaskInput) => Promise<MirrorTask>;
  listTasks: (userId: string) => Promise<MirrorTask[]>;
  updateTask: (userId: string, taskId: string, input: UpdateMirrorTaskInput) => Promise<MirrorTask>;
  completeTask: (userId: string, taskId: string) => Promise<MirrorTask>;
  deleteTask: (userId: string, taskId: string) => Promise<boolean>;
};
