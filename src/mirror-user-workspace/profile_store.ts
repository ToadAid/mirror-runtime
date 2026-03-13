import {
  createDefaultUserPreferences,
  createDefaultUserProfile,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorUserPreferences, MirrorUserProfile } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function readUserProfile(
  filePath: string,
  userId: string,
): Promise<MirrorUserProfile> {
  return readWorkspaceJson(filePath, createDefaultUserProfile(userId));
}

export async function updateUserProfileFile(
  filePath: string,
  userId: string,
  patch: Partial<Pick<MirrorUserProfile, "preferred_name">>,
): Promise<MirrorUserProfile> {
  const current = await readUserProfile(filePath, userId);
  return writeWorkspaceJson(filePath, {
    ...current,
    preferred_name:
      patch.preferred_name === undefined ? current.preferred_name : patch.preferred_name,
    updated_at: nowIso(),
  });
}

export async function readUserPreferences(filePath: string): Promise<MirrorUserPreferences> {
  return readWorkspaceJson(filePath, createDefaultUserPreferences());
}

export async function updateUserPreferencesFile(
  filePath: string,
  patch: Partial<Pick<MirrorUserPreferences, "language" | "tone">>,
): Promise<MirrorUserPreferences> {
  const current = await readUserPreferences(filePath);
  return writeWorkspaceJson(filePath, {
    ...current,
    ...patch,
    updated_at: nowIso(),
  });
}
