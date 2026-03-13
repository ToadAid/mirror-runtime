import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import { createMirrorWorkspaceManager } from "../mirror-user-workspace/index.js";
import { createMirrorReminderManager } from "./index.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("mirror reminder manager", () => {
  it("creates reminders and lists them by user", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const created = await reminderManager.createReminder("alice", {
      title: "Morning review",
      message: "Check today’s active tasks.",
      remind_at: "2026-03-14T09:00:00.000Z",
      tags: ["morning"],
    });
    const reminders = await reminderManager.listReminders("alice");

    expect(created.title).toBe("Morning review");
    expect(created.status).toBe("active");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.id).toBe(created.id);
  });

  it("updates and deletes reminders", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const created = await reminderManager.createReminder("alice", { title: "Old title" });
    const updated = await reminderManager.updateReminder("alice", created.id, {
      title: "New title",
      message: "Fresh note.",
      tags: ["updated"],
    });

    expect(updated.title).toBe("New title");
    expect(updated.message).toBe("Fresh note.");
    await expect(reminderManager.deleteReminder("alice", created.id)).resolves.toBe(true);
    await expect(reminderManager.listReminders("alice")).resolves.toEqual([]);
  });

  it("enables and disables reminders", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const created = await reminderManager.createReminder("alice", { title: "Toggle me" });
    const paused = await reminderManager.disableReminder("alice", created.id);
    const active = await reminderManager.enableReminder("alice", created.id);

    expect(paused.status).toBe("paused");
    expect(active.status).toBe("active");
  });

  it("calculates one-time reminder due state", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const created = await reminderManager.createReminder("alice", {
      title: "One time",
      remind_at: "2026-03-12T08:00:00.000Z",
    });
    const state = reminderManager.getReminderScheduleState(
      created,
      new Date("2026-03-12T09:00:00.000Z"),
    );

    expect(state.is_due).toBe(true);
    expect(state.next_fire_at).toBe("2026-03-12T08:00:00.000Z");
  });

  it("calculates recurring reminder next fire and due state", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const created = await reminderManager.createReminder("alice", {
      title: "Weekly reflection",
      remind_at: "2026-03-01T09:00:00.000Z",
      recurrence: "weekly",
    });
    const delivered = await reminderManager.markReminderDelivered(
      "alice",
      created.id,
      "2026-03-08T10:00:00.000Z",
    );
    const state = reminderManager.getReminderScheduleState(
      delivered,
      new Date("2026-03-15T09:30:00.000Z"),
    );

    expect(delivered.status).toBe("active");
    expect(delivered.last_delivered_at).toBe("2026-03-08T10:00:00.000Z");
    expect(state.is_due).toBe(true);
    expect(state.next_fire_at).toBe("2026-03-15T09:00:00.000Z");
  });

  it("returns due reminders for a user", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const reminderManager = createMirrorReminderManager(workspaceManager);

    await reminderManager.createReminder("alice", {
      title: "Due now",
      remind_at: "2026-03-12T08:00:00.000Z",
    });
    await reminderManager.createReminder("alice", {
      title: "Later",
      remind_at: "2026-03-13T08:00:00.000Z",
    });

    const due = await reminderManager.getDueReminders(
      "alice",
      new Date("2026-03-12T09:00:00.000Z"),
    );

    expect(due).toHaveLength(1);
    expect(due[0]?.title).toBe("Due now");
  });

  it("supports related task linking", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);

    const task = await taskManager.createTask("alice", {
      title: "Follow up with draft",
    });
    const reminder = await reminderManager.createReminder("alice", {
      title: "Follow up",
      related_task_id: task.id,
    });

    expect(reminder.related_task_id).toBe(task.id);
  });

  it("persists reminders through the workspace layer", async () => {
    const rootDir = await createTempDir("mirror-reminder-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const firstWorkspaceManager = createMirrorWorkspaceManager(usersRoot);
    const firstReminderManager = createMirrorReminderManager(firstWorkspaceManager);

    const created = await firstReminderManager.createReminder("alice", {
      title: "Persist reminder",
      recurrence: "daily",
      remind_at: "2026-03-12T09:00:00.000Z",
    });

    const secondWorkspaceManager = createMirrorWorkspaceManager(usersRoot);
    const secondReminderManager = createMirrorReminderManager(secondWorkspaceManager);
    const reminders = await secondReminderManager.listReminders("alice");

    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({
      id: created.id,
      title: "Persist reminder",
      recurrence: "daily",
    });
  });
});
