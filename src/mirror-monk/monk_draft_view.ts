import type { MirrorUserDraftMetadata, MirrorUserTask } from "../mirror-user-workspace/index.js";
import type { MirrorMonkDraftView } from "./monk_types.js";

export function buildMonkDraftView(
  drafts: MirrorUserDraftMetadata[],
  tasks: MirrorUserTask[],
): MirrorMonkDraftView {
  const relatedDraftIds = new Set(
    tasks
      .map((task) => task.related_draft_id)
      .filter((draftId): draftId is string => typeof draftId === "string" && draftId.length > 0),
  );

  return {
    drafts,
    active_related_drafts: drafts.filter((draft) => relatedDraftIds.has(draft.id)),
  };
}
