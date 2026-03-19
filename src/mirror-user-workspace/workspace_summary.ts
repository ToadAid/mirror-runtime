import fs from "node:fs/promises";
import path from "node:path";
import { resolveMirrorWorkspaceLayout } from "../mirror-local/paths.js";

export type MirrorWorkspaceDirectorySummary = {
  path: string;
  exists: boolean;
  entries: number;
};

export type MirrorWorkspaceSummary = {
  ready: boolean;
  home_root: string;
  workspace_root: string;
  users_root: string;
  lore_root: string;
  logs_root: string;
  state_root: string;
  config_root: string;
  memory_db_path: string;
  directories: {
    users: MirrorWorkspaceDirectorySummary;
    sessions: MirrorWorkspaceDirectorySummary;
    tasks: MirrorWorkspaceDirectorySummary;
    reminders: MirrorWorkspaceDirectorySummary;
    heartbeat: MirrorWorkspaceDirectorySummary;
    notes: MirrorWorkspaceDirectorySummary;
    lore: MirrorWorkspaceDirectorySummary;
    artifacts: MirrorWorkspaceDirectorySummary;
  };
};

async function summarizeDirectory(dirPath: string): Promise<MirrorWorkspaceDirectorySummary> {
  try {
    const entries = await fs.readdir(dirPath);
    return {
      path: dirPath,
      exists: true,
      entries: entries.length,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        path: dirPath,
        exists: false,
        entries: 0,
      };
    }
    throw error;
  }
}

export async function getMirrorWorkspaceSummary(): Promise<MirrorWorkspaceSummary> {
  const layout = resolveMirrorWorkspaceLayout();
  const [users, sessions, tasks, reminders, heartbeat, notes, lore, artifacts] = await Promise.all([
    summarizeDirectory(layout.users_root),
    summarizeDirectory(layout.sessions_root),
    summarizeDirectory(layout.tasks_root),
    summarizeDirectory(layout.reminders_root),
    summarizeDirectory(layout.heartbeat_root),
    summarizeDirectory(layout.notes_root),
    summarizeDirectory(layout.lore_root),
    summarizeDirectory(layout.artifacts_root),
  ]);

  return {
    ready: users.exists && lore.exists,
    home_root: layout.home_root,
    workspace_root: layout.workspace_root,
    users_root: layout.users_root,
    lore_root: layout.lore_root,
    logs_root: layout.logs_root,
    state_root: layout.state_root,
    config_root: layout.config_root,
    memory_db_path: layout.memory_db_path,
    directories: {
      users,
      sessions,
      tasks,
      reminders,
      heartbeat,
      notes,
      lore,
      artifacts,
    },
  };
}

export function resolveLegacyMirrorRuntimeRoots(homeDir?: string): {
  legacy_data_root: string;
  legacy_state_root: string;
  legacy_users_root: string;
  legacy_lore_root: string;
  legacy_memory_db_path: string;
} {
  const resolvedHome = homeDir
    ? path.resolve(homeDir)
    : process.env.HOME
      ? path.resolve(process.env.HOME)
      : "";
  const legacyDataRoot = path.join(resolvedHome, ".local", "share", "mirror-runtime");
  const legacyStateRoot = path.join(resolvedHome, ".local", "state", "mirror-runtime");
  return {
    legacy_data_root: legacyDataRoot,
    legacy_state_root: legacyStateRoot,
    legacy_users_root: path.join(legacyDataRoot, "mirror-home", "users"),
    legacy_lore_root: path.join(legacyDataRoot, "lore-scrolls"),
    legacy_memory_db_path: path.join(legacyStateRoot, "mirror-memory.db"),
  };
}
