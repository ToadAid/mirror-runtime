import {
  createDefaultHeartbeatPreferences,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorHeartbeatPreferences } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function readHeartbeatPreferences(
  filePath: string,
): Promise<MirrorHeartbeatPreferences> {
  return readWorkspaceJson(filePath, createDefaultHeartbeatPreferences());
}

export async function updateHeartbeatPreferencesFile(
  filePath: string,
  patch: Partial<Omit<MirrorHeartbeatPreferences, "updated_at">>,
): Promise<MirrorHeartbeatPreferences> {
  const current = await readHeartbeatPreferences(filePath);
  return writeWorkspaceJson(filePath, {
    ...current,
    ...patch,
    updated_at: nowIso(),
  });
}
