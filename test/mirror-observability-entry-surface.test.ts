import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone observability entry surface", () => {
  it("keeps the canonical observability-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-observability/index.ts"),
      "utf8",
    );

    expect(source).toContain("createMirrorObservabilityContext");
    expect(source).toContain("getCurrentMirrorObservabilityContext");
    expect(source).toContain("getDefaultMirrorObservabilityContext");
    expect(source).toContain("runWithMirrorObservabilityContext");
    expect(source).toContain('} from "./context.js";');
    expect(source).toContain("getMirrorMetrics");
    expect(source).toContain("incrementMetric");
    expect(source).toContain("recordLatency");
    expect(source).toContain('} from "./metrics.js";');
    expect(source).toContain("getMirrorDiagnostics");
    expect(source).toContain("recordDiagnosticEvent");
    expect(source).toContain('} from "./diagnostics.js";');
    expect(source).toContain('export { logMirrorEvent } from "./tracing.js";');
    expect(source).toContain("createMirrorObservabilityHandlers");
    expect(source).toContain("createMirrorObservabilityRouter");
    expect(source).toContain('} from "./observability_server.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
