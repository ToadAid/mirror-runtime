import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone user-workspace entry surface", () => {
  it("keeps the canonical user-workspace-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-user-workspace/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export { createMirrorWorkspaceManager } from "./workspace_manager.js";',
    );
    expect(source).toContain("createMirrorWorkspaceStore");
    expect(source).toContain("resolveMirrorWorkspaceUsersRoot");
    expect(source).toContain("resolveUserWorkspacePaths");
    expect(source).toContain("sanitizeMirrorWorkspaceUserId");
    expect(source).toContain('} from "./workspace_store.js";');
    expect(source).toContain("MirrorHeartbeatPreferences");
    expect(source).toContain("MirrorUserTask");
    expect(source).toContain("MirrorUserWorkspace");
    expect(source).toContain("MirrorWorkspaceManager");
    expect(source).toContain("MirrorWorkspaceStore");
    expect(source).toContain('} from "./workspace_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
