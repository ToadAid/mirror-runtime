import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorReminderManager } from "../mirror-reminder/index.js";
import { createMirrorTaskManager } from "../mirror-task/index.js";
import { createMirrorWorkspaceManager } from "../mirror-user-workspace/index.js";
import { createMirrorHeartbeatManager, renderHeartbeatTemplate } from "./index.js";

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("mirror heartbeat manager", () => {
  it("defaults heartbeat state to disabled", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    const state = await heartbeatManager.getHeartbeatState("alice");

    expect(state.enabled).toBe(false);
    expect(state.check_in_after_inactivity_days).toBe(3);
    expect(state.last_seen_at).toBeNull();
  });

  it("enables and disables heartbeat preferences", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    const enabled = await heartbeatManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      quiet_mode: false,
      preferred_tone: "calm",
      opt_in_source: "manual-opt-in",
    });
    const disabled = await heartbeatManager.updateHeartbeatPreferences("alice", {
      enabled: false,
    });

    expect(enabled.enabled).toBe(true);
    expect(enabled.preferred_tone).toBe("calm");
    expect(disabled.enabled).toBe(false);
  });

  it("evaluates inactivity thresholds", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    await heartbeatManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      check_in_after_inactivity_days: 2,
      last_seen_at: "2026-03-10T08:00:00.000Z",
    });

    await expect(
      heartbeatManager.isHeartbeatDue("alice", new Date("2026-03-13T09:00:00.000Z")),
    ).resolves.toBe(true);
  });

  it("suppresses heartbeat in quiet mode", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    await heartbeatManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      quiet_mode: true,
      last_seen_at: "2026-03-01T08:00:00.000Z",
    });

    const evaluation = await heartbeatManager.getHeartbeatEvaluation(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(evaluation.due).toBe(false);
    expect(evaluation.suppressed_by_quiet_mode).toBe(true);
    expect(evaluation.reason).toBe("quiet_mode");
  });

  it("records user activity", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    const state = await heartbeatManager.recordUserSeen("alice", "2026-03-12T10:00:00.000Z");

    expect(state.last_seen_at).toBe("2026-03-12T10:00:00.000Z");
  });

  it("records heartbeat checks", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    const state = await heartbeatManager.recordHeartbeatCheck("alice", "2026-03-12T11:00:00.000Z");

    expect(state.last_check_in_at).toBe("2026-03-12T11:00:00.000Z");
  });

  it("generates gentle message templates", () => {
    const message = renderHeartbeatTemplate({
      preferred_name: "Alicia",
      tone: "gentle",
    });

    expect(message.tone).toBe("gentle");
    expect(message.message).toContain("Alicia");
    expect(message.message).toContain("Just checking in");
  });

  it("uses task, reminder, and session activity as local signals", async () => {
    const rootDir = await createTempDir("mirror-heartbeat-");
    const workspaceManager = createMirrorWorkspaceManager(
      path.join(rootDir, "mirror-home", "users"),
    );
    const taskManager = createMirrorTaskManager(workspaceManager);
    const reminderManager = createMirrorReminderManager(workspaceManager);
    const heartbeatManager = createMirrorHeartbeatManager(workspaceManager);

    await heartbeatManager.updateHeartbeatPreferences("alice", {
      enabled: true,
      check_in_after_inactivity_days: 2,
      last_seen_at: "2026-03-01T09:00:00.000Z",
    });
    await taskManager.createTask("alice", {
      title: "Recent task activity",
    });
    await reminderManager.createReminder("alice", {
      title: "Recent reminder",
      remind_at: "2026-03-13T08:00:00.000Z",
    });
    await workspaceManager.updateRecentSessionSummary("alice", {
      session_id: "session-1",
      summary: "Continued current work.",
      open_threads: ["task-followup"],
      last_active_at: "2026-03-12T12:00:00.000Z",
    });

    const evaluation = await heartbeatManager.getHeartbeatEvaluation(
      "alice",
      new Date("2026-03-13T09:00:00.000Z"),
    );

    expect(evaluation.due).toBe(false);
    expect(evaluation.reason).toBe("recent_activity");
    expect(evaluation.signals.recent_session).toBe(true);
    expect(evaluation.signals.active_task_count).toBe(1);
    expect(evaluation.signals.active_reminder_count).toBe(1);
  });
});
