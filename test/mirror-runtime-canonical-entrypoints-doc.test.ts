import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror runtime canonical entrypoints doc", () => {
  it("keeps the canonical-vs-compat split boundary documented", () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), "docs/debug/mirror-runtime-canonical-entrypoints.md"),
      "utf8",
    );

    expect(doc).toContain("# Mirror Runtime Canonical Entrypoints");
    expect(doc).toContain("## Canonical Mirror-native entrypoints");

    expect(doc).toContain("[mirror.mjs]");
    expect(doc).toContain("[src/mirror-entry.ts]");
    expect(doc).toContain("[src/mirror-cli/mirror_cli.ts]");

    expect(doc).toContain("[src/mirror-service/mirror_service.ts]");
    expect(doc).toContain("[src/mirror-service/runtime_host.ts]");
    expect(doc).toContain("[src/mirrordaemon/mirrordaemon.ts]");
    expect(doc).toContain("[src/mirror-runtime/mirror_chat_engine.ts]");
    expect(doc).toContain("[src/mirror-provider/mirror_provider.ts]");
    expect(doc).toContain("[src/mirror-gateway/routes.ts]");
    expect(doc).toContain("[src/mirror-package.ts]");
    expect(doc).toContain("canonical root export surface");

    expect(doc).toContain("Compatibility code lives under:");
    expect(doc).toContain("[src/compat/openclaw]");

    expect(doc).toContain("Compatibility wrapper paths still exist at:");
    expect(doc).toContain("[src/runtime/server.ts]");
    expect(doc).toContain("[src/runtime/brain-chat.ts]");
    expect(doc).toContain("[src/runtime/health.ts]");
    expect(doc).toContain("[src/cli/mirror-cli.ts]");

    expect(doc).toContain("These are not canonical runtime entrypoints anymore.");
  });
});
