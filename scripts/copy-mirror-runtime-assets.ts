import fs from "node:fs/promises";
import path from "node:path";

async function copyMirrorRuntimeAssets(): Promise<void> {
  const root = process.cwd();
  const assets = [
    {
      source: path.join(root, "src/mirror-memory/schema.sql"),
      target: path.join(root, "dist/schema.sql"),
    },
  ];

  for (const asset of assets) {
    await fs.mkdir(path.dirname(asset.target), { recursive: true });
    await fs.copyFile(asset.source, asset.target);
  }
}

void copyMirrorRuntimeAssets().catch((error) => {
  console.error(
    "[copy-mirror-runtime-assets]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
