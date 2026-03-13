import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import { createMirrorWorkspaceManager } from "../mirror-user-workspace/index.js";
import { createMirrorMonkWorkspaceBridge } from "./index.js";

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

describe("mirror monk workspace bridge", () => {
  it("assembles a full monk workspace context", async () => {
    const rootDir = await createTempDir("mirror-monk-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);
    const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);

    await workspaceManager.updateUserProfile("alice", { preferred_name: "Alicia" });
    await workspaceManager.updateUserPreferences("alice", { language: "en", tone: "direct" });
    await workspaceManager.upsertUserDraft("alice", {
      id: "draft-1",
      title: "Morning draft",
      path: "drafts/morning.md",
      status: "draft",
    });
    await taskManager.createTask("alice", {
      title: "Review morning draft",
      related_draft_id: "draft-1",
    });
    await reminderManager.createReminder("alice", {
      title: "Morning review",
      remind_at: "2026-03-13T08:00:00.000Z",
    });
    await workspaceManager.updateRecentSessionSummary("alice", {
      session_id: "session-1",
      summary: "Worked through the morning queue.",
      open_threads: ["review"],
      last_active_at: "2026-03-12T12:00:00.000Z",
    });
    await workspaceManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      last_seen_at: "2026-03-10T08:00:00.000Z",
    });
    await workspaceManager.updateMonkCoderContext("alice", {
      current_focus: "draft review",
      next_steps: ["finish draft review"],
    });
    await workspaceManager.appendUserNote("alice", {
      content: "Monk note: remember the draft context.",
      tags: ["monk"],
    });

    const context = await monkBridge.getMonkWorkspaceContext(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(context.user.profile.preferred_name).toBe("Alicia");
    expect(context.user.preferences.language).toBe("en");
    expect(context.work.active_tasks).toHaveLength(1);
    expect(context.work.due_reminders).toHaveLength(1);
    expect(context.work.drafts).toHaveLength(1);
    expect(context.continuity.recent_session?.summary).toContain("morning queue");
    expect(context.continuity.heartbeat.enabled).toBe(true);
    expect(context.monk.shared_context.current_focus).toBe("draft review");
    expect(context.monk.recent_monk_notes[0]?.content).toContain("Monk note");
  });

  it("shows active tasks and due reminders", async () => {
    const rootDir = await createTempDir("mirror-monk-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);
    const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);

    await taskManager.createTask("alice", { title: "Active task" });
    const paused = await taskManager.createTask("alice", { title: "Paused task" });
    await taskManager.updateTask("alice", paused.id, { status: "paused" });
    await reminderManager.createReminder("alice", {
      title: "Due reminder",
      remind_at: "2026-03-13T08:00:00.000Z",
    });

    const tasks = await monkBridge.getMonkActiveTasks("alice");
    const dueReminders = await monkBridge.getMonkDueReminders(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(tasks.active_tasks).toHaveLength(1);
    expect(tasks.paused_tasks).toHaveLength(1);
    expect(dueReminders).toHaveLength(1);
  });

  it("shows draft and session continuity views", async () => {
    const rootDir = await createTempDir("mirror-monk-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const taskManager = createMirrorTaskManager(workspaceManager);
    const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);

    await workspaceManager.upsertUserDraft("alice", {
      id: "draft-1",
      title: "Draft one",
      path: "drafts/one.md",
      status: "draft",
    });
    await taskManager.createTask("alice", {
      title: "Task tied to draft",
      related_draft_id: "draft-1",
    });
    await workspaceManager.updateRecentSessionSummary("alice", {
      session_id: "session-1",
      summary: "Followed up on the draft.",
      open_threads: ["draft-1"],
      last_active_at: "2026-03-12T15:00:00.000Z",
    });

    const draftView = await monkBridge.getMonkDraftContext("alice");
    const sessionView = await monkBridge.getMonkRecentSessionContext("alice");

    expect(draftView.drafts).toHaveLength(1);
    expect(draftView.active_related_drafts[0]?.id).toBe("draft-1");
    expect(sessionView.continuity_summary).toContain("Followed up");
  });

  it("reads and updates monk shared context safely", async () => {
    const rootDir = await createTempDir("mirror-monk-");
    const usersRoot = path.join(rootDir, "mirror-home", "users");
    const workspaceManager = createMirrorWorkspaceManager(usersRoot);
    const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);

    await monkBridge.updateMonkSharedContext("alice", {
      active_repo: "/workspace/mirror-runtime",
      current_focus: "workspace follow-up",
      next_steps: ["review reminders"],
    });
    await monkBridge.appendMonkCoderNote("alice", "Monk context note.");

    const sharedContext = await monkBridge.getMonkSharedContext("alice");
    const context = await monkBridge.getMonkWorkspaceContext("alice");

    expect(sharedContext.active_repo).toBe("/workspace/mirror-runtime");
    expect(context.monk.shared_context.current_focus).toBe("workspace follow-up");
    expect(context.monk.recent_monk_notes[0]?.content).toContain("Monk context note");
  });

  it("does not touch canon while building monk context", async () => {
    const rootDir = await createTempDir("mirror-monk-");
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
    const monkBridge = createMirrorMonkWorkspaceBridge(workspaceManager);
    await monkBridge.updateMonkSharedContext("alice", {
      current_focus: "safe context assembly",
      next_steps: ["keep canon isolated"],
    });
    await monkBridge.appendMonkCoderNote("alice", "No canon changes.");
    await monkBridge.getMonkWorkspaceContext("alice");

    const afterFiles = await listRelativeFiles(loreDir);
    const afterContent = await fs.readFile(path.join(loreDir, "TOBY_L0001_SafeCanon.md"), "utf8");

    expect(afterFiles).toEqual(beforeFiles);
    expect(afterContent).toBe(beforeContent);
  });
});
