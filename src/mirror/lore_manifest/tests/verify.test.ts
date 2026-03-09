import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256File } from "../hash.js";
import type { MirrorLoreManifest } from "../types.js";
import { verifyLoreManifest } from "../verify.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-manifest-"));
  tempDirs.push(dir);
  return dir;
}

describe("verifyLoreManifest", () => {
  it("returns ok when all files match", async () => {
    const dir = await createTempDir();
    const scrollPath = path.join(dir, "TOBY_L001.md");
    await fs.writeFile(scrollPath, "alpha\n", "utf8");

    const manifest: MirrorLoreManifest = {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [
        {
          path: "TOBY_L001.md",
          sha256: await sha256File(scrollPath),
        },
      ],
    };

    const report = await verifyLoreManifest({ manifest, baseDir: dir });

    expect(report).toEqual({
      ok: true,
      checked: 1,
      matched: 1,
      missing: [],
      mismatched: [],
    });
  });

  it("reports missing files", async () => {
    const dir = await createTempDir();

    const manifest: MirrorLoreManifest = {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [
        {
          path: "TOBY_L001.md",
          sha256: "abc123",
        },
      ],
    };

    const report = await verifyLoreManifest({ manifest, baseDir: dir });

    expect(report.ok).toBe(false);
    expect(report.checked).toBe(1);
    expect(report.matched).toBe(0);
    expect(report.missing).toEqual(["TOBY_L001.md"]);
    expect(report.mismatched).toEqual([]);
  });

  it("reports mismatched files", async () => {
    const dir = await createTempDir();
    const scrollPath = path.join(dir, "TOBY_L001.md");
    await fs.writeFile(scrollPath, "alpha\n", "utf8");

    const manifest: MirrorLoreManifest = {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [
        {
          path: "TOBY_L001.md",
          sha256: await sha256File(scrollPath),
        },
      ],
    };

    await fs.writeFile(scrollPath, "beta\n", "utf8");

    const report = await verifyLoreManifest({ manifest, baseDir: dir });

    expect(report.ok).toBe(false);
    expect(report.checked).toBe(1);
    expect(report.matched).toBe(0);
    expect(report.missing).toEqual([]);
    expect(report.mismatched).toHaveLength(1);
    expect(report.mismatched[0]?.path).toBe("TOBY_L001.md");
    expect(report.mismatched[0]?.expected).toBe(manifest.scrolls[0]?.sha256);
    expect(report.mismatched[0]?.actual).not.toBe(manifest.scrolls[0]?.sha256);
  });

  it("ignores extra files that are not listed in the manifest", async () => {
    const dir = await createTempDir();
    const listedPath = path.join(dir, "TOBY_L001.md");
    const extraPath = path.join(dir, "TOBY_L002.md");

    await fs.writeFile(listedPath, "alpha\n", "utf8");
    await fs.writeFile(extraPath, "extra\n", "utf8");

    const manifest: MirrorLoreManifest = {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [
        {
          path: "TOBY_L001.md",
          sha256: await sha256File(listedPath),
        },
      ],
    };

    const report = await verifyLoreManifest({ manifest, baseDir: dir });

    expect(report).toEqual({
      ok: true,
      checked: 1,
      matched: 1,
      missing: [],
      mismatched: [],
    });
  });
});
