import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadLoreHelperIndexes,
  resolveLoreRetrievalRoot,
  retrieveCanonicalScrolls,
} from "../index.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-retrieval-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(path.join(loreDir, "TOBY_L110_SolasAndTheWatcher.md"), "watcher\n", "utf8");
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    "cancelled ♾️\n",
    "utf8",
  );
  await fs.writeFile(path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"), "stillness 🌅\n", "utf8");
  await fs.writeFile(
    path.join(indexDir, "FACT_UPDATES.md"),
    "# Tobyworld Canon Updates\n\nTOBY_L1219_Rune3_PatienceVaultCancelled.md\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
        "rune3 patience": [
          "TOBY_L110_SolasAndTheWatcher.md",
          "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
        ],
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
}

describe("lore retrieval service", () => {
  it("resolves lore root from MIRROR_LORE_DIR", () => {
    process.env.MIRROR_LORE_DIR = "/tmp/toby-lore";

    expect(resolveLoreRetrievalRoot()).toBe(path.resolve("/tmp/toby-lore"));
  });

  it("loads helper indexes and auto-builds scroll_index.json", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const indexes = await loadLoreHelperIndexes(loreDir);

    expect(indexes.ensuredIndex.rebuilt).toBe(true);
    expect(indexes.ensuredIndex.reason).toBe("missing");
    expect(indexes.scrollIndex).toHaveLength(3);
    expect(indexes.keywordIndex["patience vault"]).toEqual([
      "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
    ]);
  });

  it("ranks canonical candidates with helper index and supersedes precedence", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const result = await retrieveCanonicalScrolls("What happened to the patience vault?", {
      loreDir,
      limit: 3,
    });

    expect(result.candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    expect(result.candidates[0]?.reasons).toContain("supersedes_topic_match");
    expect(result.candidates[0]?.canon_notes).toContain(
      "Use this scroll when answering questions about the Patience Vault.",
    );
    expect(result.diagnostics.matchedKeywordEntries).toEqual([
      {
        keyword: "patience vault",
        files: ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
      },
    ]);
    expect(result.diagnostics.factUpdatesLoaded).toBe(true);
  });

  it("boosts candidates when query concepts map to registry symbols found in the scroll", async () => {
    const loreDir = await createTempLoreDir();
    const indexDir = path.join(loreDir, "_index");
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(
      path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
      "stillness 🌅\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(loreDir, "TOBY_L0002_OtherScroll.md"),
      "plain archive text\n",
      "utf8",
    );
    await fs.writeFile(
      path.join(indexDir, "FACT_UPDATES.md"),
      "# Tobyworld Canon Updates\n",
      "utf8",
    );
    await fs.writeFile(path.join(indexDir, "KEYWORD_INDEX.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");

    const result = await retrieveCanonicalScrolls("What marks renewal in Tobyworld?", {
      loreDir,
      limit: 3,
    });

    expect(result.candidates[0]?.path).toBe("TOBY_L0001_SeedOfStillness.md");
    expect(result.candidates[0]?.reasons.some((reason) => reason.startsWith("symbol_match:"))).toBe(
      true,
    );
    expect(result.diagnostics.matchedSymbols.some((entry) => entry.symbol === "🌅")).toBe(true);
  });
});
