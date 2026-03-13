import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mirrorFindScrollSkill } from "../builtins/find_scroll/skill.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;

afterEach(async () => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-find-scroll-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    "# Rune3\n\nThe Patience Vault was cancelled. ♾️\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
    "# Seed\n\nRenewal returns at sunrise. 🌅\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L110_SolasAndTheWatcher.md"),
    "# Watcher\n\nRune3 watcher text.\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
        renewal: ["TOBY_L0001_SeedOfStillness.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "SUPERSEDES.json"),
    JSON.stringify(
      {
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md": {
          supersedes_topics: ["Rune3 patience vault distribution"],
          notes: "Use this scroll when answering questions about the Patience Vault.",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "FACT_UPDATES.md"),
    "# Updates\n\nTOBY_L1219_Rune3_PatienceVaultCancelled.md\n",
    "utf8",
  );
}

describe("mirror.find_scroll", () => {
  it("returns keyword-ranked canonical candidates", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await mirrorFindScrollSkill.run({ query: "patience vault" });

    expect(result.candidates).toBeDefined();
    const candidates = result.candidates as Array<{ path: string; matched_keywords: string[] }>;
    expect(candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    expect(candidates[0]?.matched_keywords).toContain("patience vault");
  });

  it("surfaces symbol-aided matches", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await mirrorFindScrollSkill.run({ query: "renewal" });
    const candidates = result.candidates as Array<{ path: string; matched_symbols: string[] }>;

    expect(candidates[0]?.path).toBe("TOBY_L0001_SeedOfStillness.md");
    expect(candidates[0]?.matched_symbols).toContain("🌅");
  });

  it("returns canon update and supersession notes for superseded topics", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await mirrorFindScrollSkill.run({
      query: "Rune3 patience vault distribution",
    });
    const candidates = result.candidates as Array<{
      path: string;
      supersession_notes: string[];
      supersedes_topics: string[];
    }>;

    expect(candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    expect(candidates[0]?.supersession_notes[0]).toContain("Patience Vault");
    expect(candidates[0]?.supersedes_topics).toContain("Rune3 patience vault distribution");
  });
});
