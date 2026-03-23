import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone ui api entry surface", () => {
  it("keeps the canonical UI/API-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-ui-api/index.ts"), "utf8");

    expect(source).toContain("createMirrorUiApiHandlers");
    expect(source).toContain("createMirrorUiApiRouter");
    expect(source).toContain("type MirrorUiApiHandlers");
    expect(source).toContain('} from "./routes.js";');
    expect(source).toContain('export * from "./contracts.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
