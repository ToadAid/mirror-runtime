import {
  createDefaultSessionStoreData,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorSessionStoreData, MirrorUserSessionSummary } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function readSessionStore(filePath: string): Promise<MirrorSessionStoreData> {
  return readWorkspaceJson(filePath, createDefaultSessionStoreData());
}

export async function getRecentSessionSummaryFromFile(
  filePath: string,
): Promise<MirrorUserSessionSummary | null> {
  const store = await readSessionStore(filePath);
  return store.recent_session;
}

export async function updateRecentSessionSummaryFile(
  filePath: string,
  session: Omit<MirrorUserSessionSummary, "updated_at"> &
    Partial<Pick<MirrorUserSessionSummary, "updated_at">>,
): Promise<MirrorUserSessionSummary> {
  const store = await readSessionStore(filePath);
  const nextSession: MirrorUserSessionSummary = {
    ...session,
    open_threads: [...session.open_threads],
    updated_at: session.updated_at ?? nowIso(),
  };
  store.recent_session = nextSession;
  store.updated_at = nowIso();
  await writeWorkspaceJson(filePath, store);
  return nextSession;
}
