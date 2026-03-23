import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirrordaemon standalone entry surface", () => {
  it("keeps the canonical daemon-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirrordaemon/index.ts"), "utf8");

    expect(source).toContain(
      'export { createMirrordaemon, type Mirrordaemon } from "./mirrordaemon.js";',
    );
    expect(source).toContain('export { createRuntimeEventStream } from "./event_stream.js";');
    expect(source).toContain("getMirrordaemonRuntimeState");
    expect(source).toContain("getMirrordaemonHealthState");
    expect(source).toContain("getMirrordaemonActionsState");
    expect(source).toContain("getMirrordaemonProvidersState");
    expect(source).toContain("getMirrordaemonSyncState");
    expect(source).toContain('export { getMirrordaemonDebugState } from "./debug_api.js";');
    expect(source).toContain("buildRuntimeSummary");
    expect(source).toContain("buildStatusPayload");

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
