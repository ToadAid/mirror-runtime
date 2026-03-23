import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone reminder entry surface", () => {
  it("keeps the canonical reminder-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-reminder/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export { createMirrorReminderManager } from "./reminder_manager.js";',
    );
    expect(source).toContain(
      'export { createMirrorReminderStore, type MirrorReminderStore } from "./reminder_store.js";',
    );
    expect(source).toContain("filterDueReminders");
    expect(source).toContain("getReminderScheduleState");
    expect(source).toContain('} from "./reminder_scheduler.js";');
    expect(source).toContain("CreateMirrorReminderInput");
    expect(source).toContain("MirrorReminder");
    expect(source).toContain("MirrorReminderManager");
    expect(source).toContain("MirrorReminderRecurrence");
    expect(source).toContain("MirrorReminderScheduleState");
    expect(source).toContain("MirrorReminderStatusValue");
    expect(source).toContain("UpdateMirrorReminderInput");
    expect(source).toContain('} from "./reminder_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
