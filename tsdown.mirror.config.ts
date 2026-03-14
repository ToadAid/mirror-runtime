import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/mirror-entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
  {
    entry: "src/mirror-package.ts",
    env,
    fixedExtension: false,
    platform: "node",
  },
]);
