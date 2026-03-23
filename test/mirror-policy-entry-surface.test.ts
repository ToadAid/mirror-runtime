import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror standalone policy entry surface", () => {
  it("keeps the canonical policy-facing entry Mirror-native", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/mirror-policy/index.ts"), "utf8");

    expect(source).toContain("createDefaultMirrorPolicyRules");
    expect(source).toContain("createMirrorMutableSurfacePolicyRule");
    expect(source).toContain("createMirrorOperatorAccessPolicyRule");
    expect(source).toContain('} from "./default_rules.js";');
    expect(source).toContain("isMirrorLocalOnlySurface");
    expect(source).toContain("isMirrorMutableActionName");
    expect(source).toContain("isMirrorNetworkExposedSurface");
    expect(source).toContain('} from "./mutable_surfaces.js";');
    expect(source).toContain("createMirrorPolicyEngine");
    expect(source).toContain("ensureMirrorPolicyAllowed");
    expect(source).toContain("MirrorPolicyDeniedError");
    expect(source).toContain('} from "./policy_engine.js";');
    expect(source).toContain("buildMirrorActionPolicyTarget");
    expect(source).toContain("type MirrorPolicyTarget");
    expect(source).toContain('} from "./policy_types.js";');

    expect(source).not.toContain("compat/openclaw");
    expect(source).not.toContain("openclaw-compat");
    expect(source).not.toContain("../runtime/");
    expect(source).not.toContain('from "../compat/');
  });
});
