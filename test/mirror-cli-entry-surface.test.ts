import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone cli entry surface", () => {
  it("keeps the canonical CLI-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-cli/index.ts"), "utf8");

    expect(source).toContain('export { runMirrorCli } from "./mirror_cli.js";');
    expect(source).toContain("executeMirrorCliCommand");
    expect(source).toContain("parseMirrorCliArgs");
    expect(source).toContain('} from "./commands.js";');
    expect(source).toContain('export { formatMirrorCliResult } from "./output.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../cli/");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
