import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone task entry surface", () => {
  it("keeps the canonical task-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-task/index.ts"), "utf8");

    expect(source).toContain('export { createMirrorTaskManager } from "./task_manager.js";');
    expect(source).toContain(
      'export { createMirrorTaskApi, type MirrorTaskApi } from "./task_api.js";',
    );
    expect(source).toContain("CreateMirrorTaskInput");
    expect(source).toContain("MirrorTask");
    expect(source).toContain("MirrorTaskManager");
    expect(source).toContain("MirrorTaskStatusValue");
    expect(source).toContain("UpdateMirrorTaskInput");
    expect(source).toContain('} from "./task_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
