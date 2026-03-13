import { createMirrorTaskManager } from "./task_manager.js";
import type {
  CreateMirrorTaskInput,
  MirrorTask,
  MirrorTaskManager,
  UpdateMirrorTaskInput,
} from "./task_types.js";

export type MirrorTaskApi = {
  createTask: (userId: string, input: CreateMirrorTaskInput) => Promise<MirrorTask>;
  listTasks: (userId: string) => Promise<MirrorTask[]>;
  updateTask: (userId: string, taskId: string, input: UpdateMirrorTaskInput) => Promise<MirrorTask>;
  completeTask: (userId: string, taskId: string) => Promise<MirrorTask>;
  deleteTask: (userId: string, taskId: string) => Promise<boolean>;
};

export function createMirrorTaskApi(
  taskManager: MirrorTaskManager = createMirrorTaskManager(),
): MirrorTaskApi {
  return {
    createTask: (userId, input) => taskManager.createTask(userId, input),
    listTasks: (userId) => taskManager.listTasks(userId),
    updateTask: (userId, taskId, input) => taskManager.updateTask(userId, taskId, input),
    completeTask: (userId, taskId) => taskManager.completeTask(userId, taskId),
    deleteTask: (userId, taskId) => taskManager.deleteTask(userId, taskId),
  };
}
