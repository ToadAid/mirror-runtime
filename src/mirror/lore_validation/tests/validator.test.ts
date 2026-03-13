import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverLoreFiles, getLastLoreValidationReport } from "../../lore_sources/index.js";
import { validateLoreCorpus } from "../validator.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-validator-"));
  tempDirs.push(dir);
  return dir;
}

describe("validateLoreCorpus", () => {
  it("warns on filename, missing fields, unknown symbols, and missing anchors", async () => {
    const loreDir = await createTempLoreDir();
    await fs.mkdir(path.join(loreDir, "_index"), { recursive: true });
    await fs.writeFile(path.join(loreDir, "_index", "SUPERSEDES.json"), "{}\n", "utf8");
    await fs.writeFile(
      path.join(loreDir, "TOBY_L1_Broken.md"),
      [
        "---",
        "title: Broken",
        "epoch: E1",
        "symbols: 🌅 ❌",
        "prev: TOBY_L999_Missing.md",
        "---",
        "",
        "Broken body",
      ].join("\n"),
      "utf8",
    );

    const report = await validateLoreCorpus(loreDir, [
      { path: "TOBY_L1_Broken.md", kind: "canonical" },
    ]);

    expect(report.warningCount).toBeGreaterThan(0);
    expect(report.warnings.some((warning) => warning.code === "frontmatter_field_missing")).toBe(
      true,
    );
    expect(report.warnings.some((warning) => warning.code === "symbol_unknown")).toBe(true);
    expect(report.warnings.some((warning) => warning.code === "anchor_missing")).toBe(true);
  });

  it("runs during discovery and exposes the last validation report", async () => {
    const loreDir = await createTempLoreDir();
    await fs.mkdir(path.join(loreDir, "_index"), { recursive: true });
    await fs.writeFile(path.join(loreDir, "_index", "SUPERSEDES.json"), "{}\n", "utf8");
    await fs.writeFile(
      path.join(loreDir, "TOBY_L123_Good.md"),
      [
        "---",
        "title: Good",
        "epoch: E1",
        "symbols: 🌅",
        "sacred_numbers: [3]",
        "sha256_seed: TBD",
        "---",
        "",
        "Body",
      ].join("\n"),
      "utf8",
    );

    const files = await discoverLoreFiles({
      canonicalDir: loreDir,
      localDir: path.join(loreDir, "local"),
      includeLocal: false,
    });

    expect(files).toEqual([{ path: "TOBY_L123_Good.md", kind: "canonical" }]);
    const report = getLastLoreValidationReport();
    expect(report?.checkedFiles).toBe(1);
    expect(report?.loreDir).toBe(loreDir);
  });
});
