import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone monk-actions entry surface", () => {
  it("keeps the canonical monk-actions-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-monk-actions/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export { createMirrorMonkActions } from "./monk_task_actions_runtime.js";',
    );
    expect(source).toContain('export { formatMonkSuggestedAction } from "./monk_followup.js";');
    expect(source).toContain("buildMonkTaskFollowup");
    expect(source).toContain("buildMonkOpenWorkSummary");
    expect(source).toContain("selectNextMonkTask");
    expect(source).toContain('} from "./monk_task_actions.js";');
    expect(source).toContain("buildDueReminderActions");
    expect(source).toContain("buildReminderLinkedTaskFollowup");
    expect(source).toContain('} from "./monk_reminder_actions.js";');
    expect(source).toContain("buildMonkResumeContext");
    expect(source).toContain("buildSuggestedResumeAction");
    expect(source).toContain('} from "./monk_resume.js";');
    expect(source).toContain("MirrorMonkActionContext");
    expect(source).toContain("MirrorMonkActionKind");
    expect(source).toContain("MirrorMonkActionResult");
    expect(source).toContain("MirrorMonkActions");
    expect(source).toContain("MirrorMonkResumeContext");
    expect(source).toContain('} from "./monk_action_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
