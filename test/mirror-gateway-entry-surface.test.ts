import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone gateway entry surface", () => {
  it("keeps the canonical gateway-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-gateway/index.ts"), "utf8");

    expect(source).toContain(
      'export { createMirrorGateway, type MirrorGateway } from "./mirror_gateway.js";',
    );
    expect(source).toContain("createMirrorGatewayHandlers");
    expect(source).toContain("createMirrorGatewayRouter");
    expect(source).toContain("validateMirrorToolInput");
    expect(source).toContain('} from "./routes.js";');
    expect(source).toContain("authorizeMirrorToolAccess");
    expect(source).toContain("authorizeMirrorToolRequest");
    expect(source).toContain("getMirrorOperatorToken");
    expect(source).toContain("readMirrorRequestToken");
    expect(source).toContain("requiresMirrorOperatorAuth");
    expect(source).toContain('} from "./auth.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
