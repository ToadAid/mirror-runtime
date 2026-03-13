import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorWorkspaceManager } from "../mirror-user-workspace/index.js";
import { createMirrorTaskManager } from "./index.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("mirror task manager", () => {
  it("creates and lists tasks", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);

    const created = await taskManager.createTask("alice", {
      title: "Plan tomorrow",
      description: "Write down the first three priorities.",
      due_at: "2026-03-13T09:00:00.000Z",
      tags: ["planning"],
      related_draft_id: "draft-123",
    });
    const tasks = await taskManager.listTasks("alice");

    expect(created.title).toBe("Plan tomorrow");
    expect(created.status).toBe("active");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: created.id,
      due_at: "2026-03-13T09:00:00.000Z",
      related_draft_id: "draft-123",
    });
  });

  it("updates tasks", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);

    const created = await taskManager.createTask("alice", { title: "Initial title" });
    const updated = await taskManager.updateTask("alice", created.id, {
      title: "Updated title",
      description: "Now with more detail.",
      tags: ["updated"],
    });

    expect(updated.title).toBe("Updated title");
    expect(updated.description).toBe("Now with more detail.");
    expect(updated.tags).toEqual(["updated"]);
  });

  it("marks tasks complete", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);

    const created = await taskManager.createTask("alice", { title: "Finish review" });
    const completed = await taskManager.completeTask("alice", created.id);

    expect(completed.status).toBe("done");
  });

  it("deletes tasks", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);

    const created = await taskManager.createTask("alice", { title: "Delete me" });
    await expect(taskManager.deleteTask("alice", created.id)).resolves.toBe(true);
    await expect(taskManager.listTasks("alice")).resolves.toEqual([]);
  });

  it("scopes tasks by user", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);

    await taskManager.createTask("alice", { title: "Alice task" });
    await taskManager.createTask("bob", { title: "Bob task" });

    await expect(taskManager.listTasks("alice")).resolves.toHaveLength(1);
    await expect(taskManager.listTasks("bob")).resolves.toHaveLength(1);
    await expect(taskManager.listTasks("alice")).resolves.toMatchObject([{ title: "Alice task" }]);
    await expect(taskManager.listTasks("bob")).resolves.toMatchObject([{ title: "Bob task" }]);
  });

  it("persists tasks through the workspace store", async () => {
    const rootDir = await createTempDir("mirror-task-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const firstWorkspaceManager = createMirrorWorkspaceManager(usersRoot);
    const firstTaskManager = createMirrorTaskManager(firstWorkspaceManager);

    const created = await firstTaskManager.createTask("alice", {
      title: "Persist me",
      description: "Stored in workspace-backed JSON.",
    });

    const secondWorkspaceManager = createMirrorWorkspaceManager(usersRoot);
    const secondTaskManager = createMirrorTaskManager(secondWorkspaceManager);
    const tasks = await secondTaskManager.listTasks("alice");

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: created.id,
      title: "Persist me",
      description: "Stored in workspace-backed JSON.",
    });
  });
});
