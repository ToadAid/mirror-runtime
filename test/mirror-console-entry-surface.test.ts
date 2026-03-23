import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone console entry surface", () => {
  it("keeps the canonical console-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-console/index.ts"), "utf8");

    expect(source).toContain("createMirrorConsoleHandlers");
    expect(source).toContain("createMirrorConsoleRouter");
    expect(source).toContain("createMirrorConsoleRouterAtBase");
    expect(source).toContain('} from "./console_routes.js";');
    expect(source).toContain('export { renderMirrorConsoleHtml } from "./console_static.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
