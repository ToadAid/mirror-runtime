import {
  createMirrorWorkspaceManager,
  type MirrorWorkspaceManager,
} from "../mirror-user-workspace/index.js";
import type { MirrorHeartbeatState } from "./heartbeat_types.js";

export type MirrorHeartbeatStore = {
  getState: (userId: string) => Promise<MirrorHeartbeatState>;
  updateState: (
    userId: string,
    patch: Partial<Omit<MirrorHeartbeatState, "updated_at">>,
  ) => Promise<MirrorHeartbeatState>;
};

export function createMirrorHeartbeatStore(
  workspaceManager: MirrorWorkspaceManager = createMirrorWorkspaceManager(),
): MirrorHeartbeatStore {
  return {
    getState(userId) {
      return workspaceManager.getHeartbeatPreferences(userId);
    },
    updateState(userId, patch) {
      return workspaceManager.updateHeartbeatPreferences(userId, patch);
    },
  };
}
