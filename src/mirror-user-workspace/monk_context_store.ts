import {
  createDefaultMonkCoderContext,
  readWorkspaceJson,
  writeWorkspaceJson,
} from "./workspace_store.js";
import type { MirrorMonkCoderContext } from "./workspace_types.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function readMonkCoderContext(filePath: string): Promise<MirrorMonkCoderContext> {
  return readWorkspaceJson(filePath, createDefaultMonkCoderContext());
}

export async function updateMonkCoderContextFile(
  filePath: string,
  patch: Partial<Omit<MirrorMonkCoderContext, "updated_at">>,
): Promise<MirrorMonkCoderContext> {
  const current = await readMonkCoderContext(filePath);
  return writeWorkspaceJson(filePath, {
    ...current,
    ...patch,
    next_steps: patch.next_steps ? [...patch.next_steps] : current.next_steps,
    updated_at: nowIso(),
  });
}
