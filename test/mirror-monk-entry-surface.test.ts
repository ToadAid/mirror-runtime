import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone monk entry surface", () => {
  it("keeps the canonical monk-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-monk/index.ts"), "utf8");

    expect(source).toContain(
      'export { createMirrorMonkWorkspaceBridge } from "./monk_workspace_bridge.js";',
    );
    expect(source).toContain('export { buildMonkWorkspaceContext } from "./monk_context.js";');
    expect(source).toContain('export { buildMonkTaskView } from "./monk_task_view.js";');
    expect(source).toContain('export { buildMonkDraftView } from "./monk_draft_view.js";');
    expect(source).toContain('export { buildMonkSessionView } from "./monk_session_view.js";');
    expect(source).toContain("MirrorMonkDraftView");
    expect(source).toContain("MirrorMonkSessionView");
    expect(source).toContain("MirrorMonkTaskView");
    expect(source).toContain("MirrorMonkWorkspaceBridge");
    expect(source).toContain("MirrorMonkWorkspaceContext");
    expect(source).toContain('} from "./monk_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
