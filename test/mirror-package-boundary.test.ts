import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("mirror package boundary", () => {
  it("defines dedicated mirror build and test scripts at the repo root", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      name?: string;
      main?: string;
      files?: string[];
      bin?: Record<string, string>;
      scripts?: Record<string, string>;
      exports?: Record<string, unknown>;
    };

    expect(packageJson.name).toBe("mirror-runtime");
    expect(packageJson.main).toBe("dist/mirror-package.js");
    expect(packageJson.scripts?.["build:mirror"]).toBe(
      "pnpm canvas:a2ui:bundle && tsdown --config tsdown.mirror.config.ts && node --import tsx scripts/copy-mirror-runtime-assets.ts",
    );
    expect(packageJson.scripts?.["test:mirror"]).toBe(
      "vitest run --config vitest.mirror.config.ts",
    );
    expect(packageJson.scripts?.["package:mirror-runtime"]).toBe(
      "pnpm build:mirror && node --import tsx scripts/assemble-mirror-runtime-dist.ts",
    );
    expect(packageJson.scripts?.["verify:mirror-runtime-dist"]).toBe(
      "node --import tsx scripts/verify-mirror-runtime-dist.ts",
    );
    expect(packageJson.scripts?.["verify:mirror-runtime-bootstrap"]).toBe(
      "node --import tsx scripts/verify-mirror-runtime-bootstrap.ts",
    );
    expect(packageJson.scripts?.["smoke:mirror"]).toBe(
      "node --import tsx scripts/ci-mirror-smoke.ts",
    );
    expect(packageJson.files).not.toContain("openclaw.mjs");
    expect(packageJson.bin?.openclaw).toBeUndefined();
    expect(packageJson.exports?.["."]).toBe("./dist/mirror-package.js");
    expect(packageJson.exports?.["./mirror-runtime"]).toBe("./dist/mirror-package.js");
    expect(packageJson.exports?.["./openclaw-compat"]).toBeUndefined();
    expect(packageJson.exports?.["./cli-entry"]).toBe("./mirror.mjs");
    expect(packageJson.exports?.["./openclaw-cli-entry"]).toBeUndefined();
  });

  it("keeps canonical mirror exports quarantined from compat OpenClaw surfaces", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      exports?: Record<string, unknown>;
    };
    const mirrorPackageSource = fs.readFileSync(
      path.join(process.cwd(), "src/mirror-package.ts"),
      "utf8",
    );

    expect(packageJson.exports?.["."]).toBe("./dist/mirror-package.js");
    expect(packageJson.exports?.["./mirror-runtime"]).toBe("./dist/mirror-package.js");
    expect(packageJson.exports?.["./openclaw-compat"]).toBeUndefined();

    expect(mirrorPackageSource).not.toContain("compat/openclaw");
    expect(mirrorPackageSource).not.toContain("openclaw-compat");
  });

  it("defines an explicit openclaw compatibility workspace package", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "packages/openclaw/package.json"), "utf8"),
    ) as {
      name?: string;
      bin?: Record<string, string>;
      exports?: Record<string, unknown>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.name).toBe("openclaw");
    expect(packageJson.bin?.openclaw).toBe("./bin/openclaw.js");
    expect(packageJson.exports?.["."]).toBeDefined();
    expect(packageJson.exports?.["./plugin-sdk"]).toBeDefined();
    expect(packageJson.exports?.["./plugin-sdk/account-id"]).toBeDefined();
    expect(packageJson.exports?.["./cli-entry"]).toBe("./bin/openclaw.js");
    expect(packageJson.scripts?.build).toBe("pnpm --dir ../.. build:mirror");
    expect(packageJson.scripts?.smoke).toBe("pnpm --dir ../.. smoke:mirror");
    expect(packageJson.scripts?.test).toBe("pnpm --dir ../.. test:mirror");
  });

  it("documents and assembles a repo-independent runtime payload", () => {
    const assembleScript = fs.readFileSync(
      path.join(process.cwd(), "scripts/assemble-mirror-runtime-dist.ts"),
      "utf8",
    );
    const verifyScript = fs.readFileSync(
      path.join(process.cwd(), "scripts/verify-mirror-runtime-dist.ts"),
      "utf8",
    );
    const packagingReadme = fs.readFileSync(
      path.join(process.cwd(), "packaging/mirror-runtime/README.md"),
      "utf8",
    );
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github/workflows/mirror-runtime-ci.yml"),
      "utf8",
    );
    const installerScript = fs.readFileSync(
      path.join(process.cwd(), "packaging/mirror-runtime/install-mirror-runtime.sh"),
      "utf8",
    );

    expect(assembleScript).toContain('"node_modules"');
    expect(assembleScript).toContain('"install-mirror-runtime.sh"');
    expect(assembleScript).toContain("workspaceNodeModulesRoot");
    expect(verifyScript).toContain("node_modules must not be a symlink");
    expect(verifyScript).not.toContain('path.join(root, "node_modules")');
    expect(packagingReadme).toContain("node_modules/");
    expect(installerScript).toContain("systemctl --user daemon-reload");
    expect(installerScript).toContain("Mirror Runtime installed");
    expect(workflow).not.toContain('ln -s "$PWD/node_modules"');
  });
});
