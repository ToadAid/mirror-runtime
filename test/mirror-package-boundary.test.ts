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
    expect(packageJson.scripts?.["smoke:mirror"]).toBe(
      "node --import tsx scripts/ci-mirror-smoke.ts",
    );
    expect(packageJson.exports?.["."]).toBe("./dist/mirror-package.js");
    expect(packageJson.exports?.["./mirror-runtime"]).toBeDefined();
    expect(packageJson.exports?.["./openclaw-compat"]).toBe("./dist/index.js");
    expect(packageJson.exports?.["./cli-entry"]).toBe("./mirror.mjs");
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
});
