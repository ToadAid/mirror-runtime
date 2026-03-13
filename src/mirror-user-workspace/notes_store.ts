import crypto from "node:crypto";
import {
  createDefaultNotesStoreData,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorNotesStoreData, MirrorUserNoteEntry } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

async function readNotesStore(filePath: string): Promise<MirrorNotesStoreData> {
  return readWorkspaceJson(filePath, createDefaultNotesStoreData());
}

export async function listUserNotesFromFile(filePath: string): Promise<MirrorUserNoteEntry[]> {
  const store = await readNotesStore(filePath);
  return store.entries;
}

export async function appendUserNoteToFile(
  filePath: string,
  note: Pick<MirrorUserNoteEntry, "content"> &
    Partial<Pick<MirrorUserNoteEntry, "id" | "tags" | "created_at">>,
): Promise<MirrorUserNoteEntry> {
  const store = await readNotesStore(filePath);
  const entry: MirrorUserNoteEntry = {
    id: note.id ?? crypto.randomUUID(),
    content: note.content,
    tags: [...(note.tags ?? [])],
    created_at: note.created_at ?? nowIso(),
  };
  store.entries.push(entry);
  store.updated_at = nowIso();
  await writeWorkspaceJson(filePath, store);
  return entry;
}
