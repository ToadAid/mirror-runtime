import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone service entry surface", () => {
  it("keeps the canonical service-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-service/index.ts"), "utf8");

    expect(source).toContain(
      'export { loadMirrorServiceConfig, type MirrorServiceConfig } from "./config.js";',
    );
    expect(source).toContain(
      'export { initializeMirrorServiceLifecycle, type MirrorServiceLifecycle } from "./lifecycle.js";',
    );
    expect(source).toContain(
      'export { startMirrorService, type MirrorService } from "./mirror_service.js";',
    );
    expect(source).toContain(
      'export { createMirrorRuntimeHost, type MirrorRuntimeHost } from "./runtime_host.js";',
    );
    expect(source).toContain('from "./runtime_events_ws.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain("./runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
