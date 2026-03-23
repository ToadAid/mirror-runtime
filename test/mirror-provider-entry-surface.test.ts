import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone provider entry surface", () => {
  it("keeps the canonical provider-facing entry Mirror-native", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-provider/index.ts"),
      "utf8",
    );

    expect(source).toContain(
      'export { executeMirrorProviderRequest, type FetchLike } from "./mirror_provider.js";',
    );
    expect(source).toContain('export { buildMirrorProviderHeaders } from "./provider_auth.js";');
    expect(source).toContain("buildPrimaryProviderDescriptorFromConfig");
    expect(source).toContain("createMirrorProviderPlane");
    expect(source).toContain('} from "./provider_plane.js";');
    expect(source).toContain(
      'export type { MirrorProviderConfig, MirrorProviderRequest } from "./provider_request.js";',
    );
    expect(source).toContain(
      'export type { MirrorProviderResponse } from "./provider_response.js";',
    );

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
