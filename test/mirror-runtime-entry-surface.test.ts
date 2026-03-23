import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone runtime entry surface", () => {
  it("keeps the canonical runtime-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-runtime/index.ts"), "utf8");

    expect(source).toContain("prepareMirrorChatRequest");
    expect(source).toContain("executeMirrorChatRequest");
    expect(source).toContain("executeMirrorChatWithProvider");
    expect(source).toContain("executeMirrorChatWithProviderPlane");
    expect(source).toContain('from "./mirror_chat_engine.js";');

    expect(source).toContain("buildMirrorCorrelationFromPolicyContext");
    expect(source).toContain("getMirrorTraceIdFromPolicyContext");
    expect(source).toContain("mergeMirrorCorrelation");
    expect(source).toContain("resolveMirrorTraceId");
    expect(source).toContain("withMirrorCorrelation");
    expect(source).toContain('from "./correlation.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
