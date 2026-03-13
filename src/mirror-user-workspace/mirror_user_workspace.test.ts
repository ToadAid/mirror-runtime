import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorWorkspaceManager } from "./index.js";

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

describe("mirror user workspace", () => {
  it("initializes a minimal workspace for a new user", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const workspace = await manager.getUserWorkspace("alice");

    expect(workspace.user_id).toBe("alice");
    expect(workspace.profile.preferred_name).toBeNull();
    expect(workspace.preferences.language).toBeNull();
    expect(workspace.tasks).toEqual([]);
    expect(workspace.notes).toEqual([]);
    expect(workspace.reminders).toEqual([]);
    await expect(fs.stat(path.join(workspace.user_dir, "profile.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(workspace.user_dir, "monk_coder.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(workspace.user_dir, "reminders.json"))).resolves.toBeTruthy();
  });

  it("stores profile and preferences updates", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const profile = await manager.updateUserProfile("alice", { preferred_name: "Alicia" });
    const preferences = await manager.updateUserPreferences("alice", {
      language: "en",
      tone: "direct",
    });

    expect(profile.preferred_name).toBe("Alicia");
    expect(preferences.language).toBe("en");
    expect(preferences.tone).toBe("direct");
    await expect(manager.getUserProfile("alice")).resolves.toMatchObject({
      preferred_name: "Alicia",
    });
  });

  it("stores task and draft metadata", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const tasks = await manager.upsertUserTask("alice", {
      id: "task-1",
      title: "Prepare canon review",
      status: "active",
      description: "Review the new forged scroll draft.",
      due_at: "2026-03-13T10:00:00.000Z",
      tags: ["canon", "review"],
      related_draft_id: "draft-1",
    });
    const drafts = await manager.upsertUserDraft("alice", {
      id: "draft-1",
      title: "Morning scroll",
      path: "drafts/morning-scroll.md",
      status: "draft",
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("Prepare canon review");
    expect(tasks[0]?.due_at).toBe("2026-03-13T10:00:00.000Z");
    expect(tasks[0]?.related_draft_id).toBe("draft-1");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.path).toBe("drafts/morning-scroll.md");
  });

  it("appends notes and retrieves them", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const note = await manager.appendUserNote("alice", {
      content: "Remember to check the scroll symbols before review.",
      tags: ["review"],
    });
    const notes = await manager.listUserNotes("alice");

    expect(note.content).toContain("scroll symbols");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.tags).toEqual(["review"]);
  });

  it("stores and reads the recent session summary", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    await manager.updateRecentSessionSummary("alice", {
      session_id: "session-42",
      summary: "Worked through the morning canon queue.",
      open_threads: ["commit-scroll", "review-scroll"],
      last_active_at: "2026-03-12T12:00:00.000Z",
    });

    await expect(manager.getRecentSessionSummary("alice")).resolves.toMatchObject({
      session_id: "session-42",
      summary: "Worked through the morning canon queue.",
      open_threads: ["commit-scroll", "review-scroll"],
    });
  });

  it("stores heartbeat preferences", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const heartbeat = await manager.updateHeartbeatPreferences("alice", {
      enabled: true,
      check_in_after_inactivity_days: 5,
      quiet_mode: true,
      preferred_tone: "calm",
      last_seen_at: "2026-03-12T10:00:00.000Z",
      opt_in_source: "operator-console",
    });

    expect(heartbeat.enabled).toBe(true);
    expect(heartbeat.check_in_after_inactivity_days).toBe(5);
    expect(heartbeat.quiet_mode).toBe(true);
    expect(heartbeat.preferred_tone).toBe("calm");
    expect(heartbeat.last_seen_at).toBe("2026-03-12T10:00:00.000Z");
    expect(heartbeat.opt_in_source).toBe("operator-console");
  });

  it("stores Monk Coder shared context", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));

    const context = await manager.updateMonkCoderContext("alice", {
      active_repo: "/workspace/mirror-runtime",
      active_branch: "main",
      current_focus: "workspace foundation",
      next_steps: ["add reminders later", "keep canon isolated"],
    });

    expect(context.active_repo).toBe("/workspace/mirror-runtime");
    expect(context.next_steps).toEqual(["add reminders later", "keep canon isolated"]);
    await expect(manager.getMonkCoderContext("alice")).resolves.toMatchObject({
      current_focus: "workspace foundation",
    });
  });

  it("does not touch canon files during workspace operations", async () => {
    const rootDir = await createTempDir("mirror-workspace-");
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

    const manager = createMirrorWorkspaceManager(path.join(rootDir, "mirror-home", "users"));
    await manager.updateUserProfile("alice", { preferred_name: "Alicia" });
    await manager.appendUserNote("alice", { content: "Private memory stays outside canon." });
    await manager.updateMonkCoderContext("alice", {
      current_focus: "workspace isolation",
      next_steps: ["verify canon boundary"],
    });

    const afterFiles = await listRelativeFiles(loreDir);
    const afterContent = await fs.readFile(path.join(loreDir, "TOBY_L0001_SafeCanon.md"), "utf8");

    expect(afterFiles).toEqual(beforeFiles);
    expect(afterContent).toBe(beforeContent);
  });
});
