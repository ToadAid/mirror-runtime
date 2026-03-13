import type { MirrorUserTask } from "../mirror-user-workspace/index.js";
import type { MirrorMonkTaskView } from "./monk_types.js";

export function buildMonkTaskView(tasks: MirrorUserTask[]): MirrorMonkTaskView {
  return {
    active_tasks: tasks.filter((task) => task.status === "active"),
    paused_tasks: tasks.filter((task) => task.status === "paused"),
    completed_tasks: tasks.filter((task) => task.status === "done"),
  };
}
