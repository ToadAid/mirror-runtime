import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { getChildLogger, resetLogger, setLoggerOverride } from "./logger.js";

afterEach(() => {
  setLoggerOverride(null);
  resetLogger();
});

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

describe("getChildLogger", () => {
  it("creates a child logger with bindings without throwing", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "silent" });

    expect(() => getChildLogger({ subsystem: "internal-hooks" })).not.toThrow();
  });

  it("does not crash when importing internal-hooks through tsx", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "-e",
        "import('./src/hooks/internal-hooks.ts').then(()=>process.exit(0))",
      ],
      {
        cwd: path.resolve(TEST_DIR, "..", ".."),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
