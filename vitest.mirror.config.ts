import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const base = baseConfig as unknown as Record<string, unknown>;
const baseTest = (baseConfig as { test?: { exclude?: string[] } }).test ?? {};
const exclude = baseTest.exclude ?? [];

export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    include: [
      "src/mirrordaemon/**/*.test.ts",
      "src/mirror-*/**/*.test.ts",
      "src/mirror/**/*.test.ts",
      "test/mirror-package-boundary.test.ts",
    ],
    exclude: [
      ...exclude,
      "src/compat/**",
      "src/runtime/**",
      "src/cli/**",
      "extensions/**",
      "ui/**",
      "src/mirror/memory_ledger/**",
      "src/mirror/skills/builtins/**",
    ],
  },
});
