import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runVerifyLoreCli } from "../cli.js";
import { sha256File } from "../hash.js";
import type { MirrorLoreManifest } from "../types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function writeManifest(dir: string, manifest: MirrorLoreManifest): Promise<string> {
  const manifestPath = path.join(dir, "manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  return manifestPath;
}

describe("runVerifyLoreCli", () => {
  it("prints VERIFIED when all files match", async () => {
    const dir = await createTempDir();
    const scrollPath = path.join(dir, "TOBY_L001.md");
    await fs.writeFile(scrollPath, "alpha\n", "utf8");

    const manifestPath = await writeManifest(dir, {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [{ path: "TOBY_L001.md", sha256: await sha256File(scrollPath) }],
    });

    const out: string[] = [];
    await runVerifyLoreCli({ manifestPath, dir, write: (text) => out.push(text) });

    const printed = out.join("");
    expect(printed).toContain("🪞 Lore Verification");
    expect(printed).toContain("Status: VERIFIED");
    expect(printed).toContain("Missing: 0");
    expect(printed).toContain("Mismatched: 0");
  });

  it("prints missing entries when files are absent", async () => {
    const dir = await createTempDir();
    const manifestPath = await writeManifest(dir, {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [{ path: "TOBY_L001.md", sha256: "abc123" }],
    });

    const out: string[] = [];
    await runVerifyLoreCli({ manifestPath, dir, write: (text) => out.push(text) });

    const printed = out.join("");
    expect(printed).toContain("Status: NOT VERIFIED");
    expect(printed).toContain("Missing files:");
    expect(printed).toContain("- TOBY_L001.md");
  });

  it("prints mismatched entries when hashes differ", async () => {
    const dir = await createTempDir();
    const scrollPath = path.join(dir, "TOBY_L001.md");
    await fs.writeFile(scrollPath, "alpha\n", "utf8");

    const manifestPath = await writeManifest(dir, {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [{ path: "TOBY_L001.md", sha256: await sha256File(scrollPath) }],
    });

    await fs.writeFile(scrollPath, "beta\n", "utf8");

    const out: string[] = [];
    await runVerifyLoreCli({ manifestPath, dir, write: (text) => out.push(text) });

    const printed = out.join("");
    expect(printed).toContain("Status: NOT VERIFIED");
    expect(printed).toContain("Mismatched files:");
    expect(printed).toContain("- TOBY_L001.md");
  });

  it("prints valid JSON in --json mode", async () => {
    const dir = await createTempDir();
    const scrollPath = path.join(dir, "TOBY_L001.md");
    await fs.writeFile(scrollPath, "alpha\n", "utf8");

    const manifestPath = await writeManifest(dir, {
      version: "2026-03-06",
      canonicalDir: "lore/canonical",
      scrolls: [{ path: "TOBY_L001.md", sha256: await sha256File(scrollPath) }],
    });

    const out: string[] = [];
    await runVerifyLoreCli({
      manifestPath,
      dir,
      json: true,
      write: (text) => out.push(text),
    });

    const raw = out.join("");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    expect(parsed.ok).toBe(true);
    expect(parsed.checked).toBe(1);
    expect(parsed.matched).toBe(1);
    expect(parsed.manifestPath).toBe(manifestPath);
    expect(parsed.directory).toBe(dir);
  });
});
