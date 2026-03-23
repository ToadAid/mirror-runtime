import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone heartbeat entry surface", () => {
  it("keeps the canonical heartbeat-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-heartbeat/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export { createMirrorHeartbeatManager } from "./heartbeat_manager.js";',
    );
    expect(source).toContain(
      'export { createMirrorHeartbeatStore, type MirrorHeartbeatStore } from "./heartbeat_store.js";',
    );
    expect(source).toContain('export { evaluateHeartbeat } from "./heartbeat_evaluator.js";');
    expect(source).toContain('export { renderHeartbeatTemplate } from "./heartbeat_templates.js";');
    expect(source).toContain("MirrorHeartbeatEvaluation");
    expect(source).toContain("MirrorHeartbeatEvaluationInput");
    expect(source).toContain("MirrorHeartbeatManager");
    expect(source).toContain("MirrorHeartbeatSignalSummary");
    expect(source).toContain("MirrorHeartbeatState");
    expect(source).toContain("MirrorHeartbeatTemplateInput");
    expect(source).toContain("MirrorHeartbeatTone");
    expect(source).toContain('} from "./heartbeat_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
