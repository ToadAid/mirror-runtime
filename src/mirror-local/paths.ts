import os from "node:os";
import path from "node:path";
import { readMirrorCoreSettingsFileSync } from "../mirror-settings/load.js";
import { resolveMirrorHomeRoot as resolveSettingsHomeRoot } from "../mirror-settings/paths.js";

function resolveHomeDir(): string {
  return path.resolve(os.homedir());
}

function resolveExplicitPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? path.resolve(trimmed) : undefined;
}

export function resolveMirrorHomeRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_HOME_DIR) ??
    resolveSettingsHomeRoot() ??
    path.join(resolveHomeDir(), ".mirror")
  );
}

export function resolveMirrorWorkspaceRoot(explicit?: string): string {
  const configuredRoot = readMirrorCoreSettingsFileSync().workspace.root;
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_WORKSPACE_ROOT) ??
    resolveExplicitPath(configuredRoot) ??
    path.join(resolveMirrorHomeRoot(), "workspace")
  );
}

export function resolveMirrorWorkspaceUsersRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_USER_WORKSPACE_DIR) ??
    path.join(resolveMirrorWorkspaceRoot(), "users")
  );
}

export function resolveMirrorLoreRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_LORE_DIR) ??
    path.join(resolveMirrorWorkspaceRoot(), "lore")
  );
}

export function resolveMirrorStateRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_STATE_DIR) ??
    path.join(resolveMirrorHomeRoot(), "state")
  );
}

export function resolveMirrorLogsRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_LOG_DIR) ??
    path.join(resolveMirrorHomeRoot(), "logs")
  );
}

export function resolveMirrorConfigRoot(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_CONFIG_DIR) ??
    path.join(resolveHomeDir(), ".config", "mirror-runtime")
  );
}

export function resolveMirrorMemoryDbPath(explicit?: string): string {
  return (
    resolveExplicitPath(explicit) ??
    resolveExplicitPath(process.env.MIRROR_MEMORY_DB_PATH) ??
    path.join(resolveMirrorStateRoot(), "mirror-memory.db")
  );
}

export type MirrorWorkspaceLayout = {
  home_root: string;
  workspace_root: string;
  users_root: string;
  sessions_root: string;
  tasks_root: string;
  reminders_root: string;
  heartbeat_root: string;
  notes_root: string;
  artifacts_root: string;
  lore_root: string;
  logs_root: string;
  state_root: string;
  config_root: string;
  memory_db_path: string;
};

export function resolveMirrorWorkspaceLayout(): MirrorWorkspaceLayout {
  const homeRoot = resolveMirrorHomeRoot();
  const workspaceRoot = resolveMirrorWorkspaceRoot();
  return {
    home_root: homeRoot,
    workspace_root: workspaceRoot,
    users_root: resolveMirrorWorkspaceUsersRoot(),
    sessions_root: path.join(workspaceRoot, "sessions"),
    tasks_root: path.join(workspaceRoot, "tasks"),
    reminders_root: path.join(workspaceRoot, "reminders"),
    heartbeat_root: path.join(workspaceRoot, "heartbeat"),
    notes_root: path.join(workspaceRoot, "notes"),
    artifacts_root: path.join(workspaceRoot, "artifacts"),
    lore_root: resolveMirrorLoreRoot(),
    logs_root: resolveMirrorLogsRoot(),
    state_root: resolveMirrorStateRoot(),
    config_root: resolveMirrorConfigRoot(),
    memory_db_path: resolveMirrorMemoryDbPath(),
  };
}
