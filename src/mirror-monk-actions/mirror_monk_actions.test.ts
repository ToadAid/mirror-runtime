import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import { createMirrorWorkspaceManager } from "../mirror-user-workspace/index.js";
import { createMirrorMonkActions } from "./index.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function listRelativeFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      files.push(path.relative(rootDir, fullPath).split(path.sep).join("/"));
    }
  }
  await walk(rootDir);
  return files.toSorted((a, b) => a.localeCompare(b));
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("mirror monk actions", () => {
  it("suggests the next active task", async () => {
    const rootDir = await createTempDir("mirror-monk-actions-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const monkActions = createMirrorMonkActions(workspaceManager);

    await taskManager.createTask("alice", {
      title: "Second task",
      due_at: "2026-03-14T10:00:00.000Z",
    });
    await taskManager.createTask("alice", {
      title: "First task",
      due_at: "2026-03-13T08:00:00.000Z",
    });

    const action = await monkActions.getNextMonkTask("alice");

    expect(action?.kind).toBe("next_task");
    expect(action?.summary).toContain("First task");
    expect(action?.source).toBe("task");
  });

  it("builds due reminder follow-up actions", async () => {
    const rootDir = await createTempDir("mirror-monk-actions-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);
    const monkActions = createMirrorMonkActions(workspaceManager);

    const task = await taskManager.createTask("alice", { title: "Review notes" });
    const reminder = await reminderManager.createReminder("alice", {
      title: "Morning review",
      remind_at: "2026-03-13T08:00:00.000Z",
      related_task_id: task.id,
    });

    const reminderActions = await monkActions.getMonkDueReminderActions(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );
    const linked = await monkActions.getReminderLinkedTaskFollowup(
      "alice",
      reminder.id,
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(reminderActions).toHaveLength(1);
    expect(reminderActions[0]?.kind).toBe("due_reminder");
    expect(linked?.kind).toBe("reminder_followup");
    expect(linked?.related_task_id).toBe(task.id);
  });

  it("builds resume context and suggested resume actions", async () => {
    const rootDir = await createTempDir("mirror-monk-actions-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);
    const monkActions = createMirrorMonkActions(workspaceManager);

    const task = await taskManager.createTask("alice", { title: "Resume draft review" });
    await reminderManager.createReminder("alice", {
      title: "Check draft",
      remind_at: "2026-03-13T08:00:00.000Z",
      related_task_id: task.id,
    });
    await workspaceManager.updateRecentSessionSummary("alice", {
      session_id: "session-7",
      summary: "Stopped midway through draft review.",
      open_threads: ["draft-review"],
      last_active_at: "2026-03-12T18:00:00.000Z",
    });
    await workspaceManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      last_seen_at: "2026-03-10T08:00:00.000Z",
    });

    const resumeContext = await monkActions.getMonkResumeContext(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );
    const resumeAction = await monkActions.suggestMonkResumeAction(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(resumeContext.workspace.continuity.recent_session?.summary).toContain("Stopped midway");
    expect(resumeContext.workspace.work.active_tasks).toHaveLength(1);
    expect(resumeContext.workspace.work.due_reminders).toHaveLength(1);
    expect(typeof resumeContext.heartbeat.evaluation.due).toBe("boolean");
    expect(resumeAction.kind).toBe("resume");
    expect(resumeAction.related_task_id).toBe(task.id);
  });

  it("records monk follow-up notes only in monk workspace state", async () => {
    const rootDir = await createTempDir("mirror-monk-actions-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const monkActions = createMirrorMonkActions(workspaceManager);

    const note = await monkActions.appendMonkFollowupNote("alice", "Resume the first open task.");
    const actionRecord = await monkActions.recordMonkSuggestedAction("alice", {
      kind: "open_work_summary",
      user_id: "alice",
      source: "workspace",
      summary: "There is open work.",
      suggested_action: "Review the first active task.",
      context_notes: ["No canon writes."],
    });
    const workspace = await workspaceManager.getUserWorkspace("alice");

    expect(note.content).toContain("Monk follow-up");
    expect(actionRecord.content).toContain("Suggested action kind");
    expect(workspace.notes.filter((entry) => entry.tags.includes("monk"))).toHaveLength(2);
  });

  it("keeps canon untouched while assembling monk actions", async () => {
    const rootDir = await createTempDir("mirror-monk-actions-");
    const loreDir = path.join(rootDir, "lore");
    await fs.mkdir(path.join(loreDir, "_index"), { recursive: true });
    await fs.writeFile(
      path.join(loreDir, "TOBY_L0001_SafeCanon.md"),
      "# Canon\n\nThis file must not change.\n",
      "utf8",
    );
    await fs.writeFile(path.join(loreDir, "_index", "KEYWORD_INDEX.json"), "{}\n", "utf8");
    const beforeFiles = await listRelativeFiles(loreDir);
    const beforeContent = await fs.readFile(path.join(loreDir, "TOBY_L0001_SafeCanon.md"), "utf8");

    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const monkActions = createMirrorMonkActions(workspaceManager);
    await taskManager.createTask("alice", { title: "Safe task" });
    await monkActions.summarizeMonkOpenWork("alice");
    await monkActions.appendMonkFollowupNote("alice", "Keep canon isolated.");

    const afterFiles = await listRelativeFiles(loreDir);
    const afterContent = await fs.readFile(path.join(loreDir, "TOBY_L0001_SafeCanon.md"), "utf8");

    expect(afterFiles).toEqual(beforeFiles);
    expect(afterContent).toBe(beforeContent);
  });
});
