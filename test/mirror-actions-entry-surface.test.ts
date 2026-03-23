import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone actions entry surface", () => {
  it("keeps the canonical actions-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-actions/index.ts"), "utf8");

    expect(source).toContain('export { createMirrorActionRuntime } from "./action_runtime.js";');
    expect(source).toContain("createMirrorActionsFromTools");
    expect(source).toContain("createMirrorToolRegistryFromActionRuntime");
    expect(source).toContain('} from "./skill_bridge.js";');
    expect(source).toContain("MirrorAction");
    expect(source).toContain("MirrorActionExecutionRequest");
    expect(source).toContain("MirrorActionExecutionResult");
    expect(source).toContain("MirrorActionRuntime");
    expect(source).toContain('} from "./action_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
