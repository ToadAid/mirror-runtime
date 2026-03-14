import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  MirrorHeartbeatPreferences,
  MirrorMonkCoderContext,
  MirrorNotesStoreData,
  MirrorReminderStoreData,
  MirrorSessionStoreData,
  MirrorTaskStoreData,
  MirrorUserPreferences,
  MirrorUserProfile,
  MirrorUserWorkspacePaths,
  MirrorWorkspaceStore,
} from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function resolveMirrorWorkspaceUsersRoot(rootOverride?: string): string {
  if (rootOverride && rootOverride.trim().length > 0) {
    return path.resolve(rootOverride);
  }
  const explicitUsersRoot = process.env.MIRROR_USER_WORKSPACE_DIR;
  if (explicitUsersRoot && explicitUsersRoot.trim().length > 0) {
    return path.resolve(explicitUsersRoot);
  }
  const homeRoot =
    process.env.MIRROR_HOME_DIR && process.env.MIRROR_HOME_DIR.trim().length > 0
      ? process.env.MIRROR_HOME_DIR
      : path.resolve(process.cwd(), "mirror-home");
  return path.resolve(homeRoot, "users");
}

export function sanitizeMirrorWorkspaceUserId(userId: string): string {
  const normalized = userId.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : `user-${crypto.randomUUID()}`;
}

export function resolveUserWorkspacePaths(
  usersRoot: string,
  userId: string,
): MirrorUserWorkspacePaths {
  const userDir = path.join(usersRoot, sanitizeMirrorWorkspaceUserId(userId));
  return {
    user_dir: userDir,
    profile_path: path.join(userDir, "profile.json"),
    preferences_path: path.join(userDir, "preferences.json"),
    tasks_path: path.join(userDir, "tasks.json"),
    notes_path: path.join(userDir, "notes.json"),
    reminders_path: path.join(userDir, "reminders.json"),
    sessions_path: path.join(userDir, "sessions.json"),
    heartbeat_path: path.join(userDir, "heartbeat.json"),
    monk_coder_path: path.join(userDir, "monk_coder.json"),
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${crypto.randomUUID()}`,
  );
  try {
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "EPERM") {
        throw error;
      }
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
    }
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

export async function readWorkspaceJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeWorkspaceJson<T>(filePath: string, value: T): Promise<T> {
  await writeJsonAtomic(filePath, value);
  return value;
}

export function createDefaultUserProfile(userId: string): MirrorUserProfile {
  const timestamp = nowIso();
  return {
    user_id: userId,
    preferred_name: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function createDefaultUserPreferences(): MirrorUserPreferences {
  return {
    language: null,
    tone: null,
    updated_at: nowIso(),
  };
}

export function createDefaultTaskStoreData(): MirrorTaskStoreData {
  return {
    tasks: [],
    drafts: [],
    updated_at: nowIso(),
  };
}

export function createDefaultNotesStoreData(): MirrorNotesStoreData {
  return {
    entries: [],
    updated_at: nowIso(),
  };
}

export function createDefaultReminderStoreData(): MirrorReminderStoreData {
  return {
    reminders: [],
    updated_at: nowIso(),
  };
}

export function createDefaultSessionStoreData(): MirrorSessionStoreData {
  return {
    recent_session: null,
    updated_at: nowIso(),
  };
}

export function createDefaultHeartbeatPreferences(): MirrorHeartbeatPreferences {
  return {
    enabled: false,
    check_in_after_inactivity_days: 3,
    quiet_mode: false,
    preferred_tone: "gentle",
    last_seen_at: null,
    last_check_in_at: null,
    opt_in_source: null,
    updated_at: nowIso(),
  };
}

export function createDefaultMonkCoderContext(): MirrorMonkCoderContext {
  return {
    active_repo: null,
    active_branch: null,
    current_focus: null,
    next_steps: [],
    updated_at: nowIso(),
  };
}

export function createMirrorWorkspaceStore(rootOverride?: string): MirrorWorkspaceStore {
  const usersRoot = resolveMirrorWorkspaceUsersRoot(rootOverride);

  return {
    users_root: usersRoot,
    resolveUserWorkspacePaths(userId: string) {
      return resolveUserWorkspacePaths(usersRoot, userId);
    },
    async ensureUserWorkspace(userId: string) {
      const paths = resolveUserWorkspacePaths(usersRoot, userId);
      await fs.mkdir(paths.user_dir, { recursive: true });
      await Promise.all([
        readWorkspaceJson(paths.profile_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.profile_path, createDefaultUserProfile(userId));
          }
        }),
        readWorkspaceJson(paths.preferences_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.preferences_path, createDefaultUserPreferences());
          }
        }),
        readWorkspaceJson(paths.tasks_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.tasks_path, createDefaultTaskStoreData());
          }
        }),
        readWorkspaceJson(paths.notes_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.notes_path, createDefaultNotesStoreData());
          }
        }),
        readWorkspaceJson(paths.reminders_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.reminders_path, createDefaultReminderStoreData());
          }
        }),
        readWorkspaceJson(paths.sessions_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.sessions_path, createDefaultSessionStoreData());
          }
        }),
        readWorkspaceJson(paths.heartbeat_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.heartbeat_path, createDefaultHeartbeatPreferences());
          }
        }),
        readWorkspaceJson(paths.monk_coder_path, null).then(async (existing) => {
          if (!existing) {
            await writeWorkspaceJson(paths.monk_coder_path, createDefaultMonkCoderContext());
          }
        }),
      ]);
      return paths;
    },
  };
}
