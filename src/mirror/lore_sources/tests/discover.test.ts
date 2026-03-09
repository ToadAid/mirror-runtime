import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverLoreFiles } from "../discover.js";
import { getDefaultLorePolicy } from "../policy.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-sources-"));
  tempDirs.push(dir);
  return dir;
}

describe("discoverLoreFiles", () => {
  it("discovers canonical markdown files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    await fs.mkdir(path.join(canonicalDir, "nested"), { recursive: true });
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.md"), "a\n", "utf8");
    await fs.writeFile(path.join(canonicalDir, "nested", "TOBY_L002.md"), "b\n", "utf8");

    const files = await discoverLoreFiles({
      ...getDefaultLorePolicy(),
      canonicalDir,
      localDir: path.join(dir, "local"),
      includeLocal: false,
    });

    expect(files).toEqual([
      { path: "nested/TOBY_L002.md", kind: "canonical" },
      { path: "TOBY_L001.md", kind: "canonical" },
    ]);
  });

  it("ignores local files when includeLocal is false", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.md"), "a\n", "utf8");
    await fs.writeFile(path.join(localDir, "LOCAL_NOTE.md"), "b\n", "utf8");

    const files = await discoverLoreFiles({ canonicalDir, localDir, includeLocal: false });

    expect(files).toEqual([{ path: "TOBY_L001.md", kind: "canonical" }]);
  });

  it("includes local files when includeLocal is true", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.md"), "a\n", "utf8");
    await fs.writeFile(path.join(localDir, "LOCAL_NOTE.md"), "b\n", "utf8");

    const files = await discoverLoreFiles({ canonicalDir, localDir, includeLocal: true });

    expect(files).toEqual([
      { path: "TOBY_L001.md", kind: "canonical" },
      { path: "LOCAL_NOTE.md", kind: "local" },
    ]);
  });

  it("ignores non-markdown files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.md"), "a\n", "utf8");
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.txt"), "b\n", "utf8");
    await fs.writeFile(path.join(canonicalDir, "TOBY_L001.json"), "c\n", "utf8");

    const files = await discoverLoreFiles({
      canonicalDir,
      localDir: path.join(dir, "local"),
      includeLocal: false,
    });

    expect(files).toEqual([{ path: "TOBY_L001.md", kind: "canonical" }]);
  });
});
