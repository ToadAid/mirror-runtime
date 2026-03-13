import type {
  MirrorHeartbeatPreferences,
  MirrorMonkCoderContext,
  MirrorUserDraftMetadata,
  MirrorUserNoteEntry,
  MirrorUserPreferences,
  MirrorUserProfile,
  MirrorUserReminder,
  MirrorUserSessionSummary,
  MirrorUserTask,
} from "../mirror-user-workspace/index.js";
import type { MirrorMonkWorkspaceContext } from "./monk_types.js";

function selectRecentMonkNotes(notes: MirrorUserNoteEntry[]): Array<{
  id: string;
  content: string;
  created_at: string;
}> {
  return notes
    .filter((note) => note.tags.includes("monk"))
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
    .map((note) => ({
      id: note.id,
      content: note.content,
      created_at: note.created_at,
    }));
}

export function buildMonkWorkspaceContext(params: {
  userId: string;
  profile: MirrorUserProfile;
  preferences: MirrorUserPreferences;
  tasks: MirrorUserTask[];
  dueReminders: MirrorUserReminder[];
  drafts: MirrorUserDraftMetadata[];
  recentSession: MirrorUserSessionSummary | null;
  heartbeat: MirrorHeartbeatPreferences;
  monkSharedContext: MirrorMonkCoderContext;
  notes: MirrorUserNoteEntry[];
}): MirrorMonkWorkspaceContext {
  return {
    user: {
      user_id: params.userId,
      profile: params.profile,
      preferences: params.preferences,
    },
    work: {
      active_tasks: params.tasks.filter((task) => task.status === "active"),
      due_reminders: params.dueReminders,
      drafts: params.drafts,
    },
    continuity: {
      recent_session: params.recentSession,
      heartbeat: params.heartbeat,
    },
    monk: {
      shared_context: params.monkSharedContext,
      recent_monk_notes: selectRecentMonkNotes(params.notes),
    },
  };
}
