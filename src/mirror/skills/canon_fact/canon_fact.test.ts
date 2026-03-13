import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonFact } from "./canon_fact.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-canon-fact-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    [
      "# TOBY_L1219",
      "",
      "Rune3 introduced the Patience trial.",
      "A vault distribution was once proposed.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
    [
      "---",
      "title: Seed Of Stillness",
      "epoch: E1",
      "symbols: 🌅",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Seed",
      "",
      "Renewal begins in stillness.",
    ].join("\n"),
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
    [
      "# Tobyworld Canon Updates",
      "",
      "## Rune3 - Patience Vault",
      "",
      "Current canonical status:",
      "",
      "The Patience Vault was cancelled.",
      "",
      "Reference scroll:",
      "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
    ].join("\n"),
    "utf8",
  );
}

describe("canonFact", () => {
  it("returns a canonical fact statement for a normal fact lookup", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await canonFact({ query: "renewal" });

    expect(result.source_scroll_id).toBe("TOBY_L0001");
    expect(result.canonical_fact).toContain("Renewal begins in stillness.");
  });

  it("returns supersession notes for superseded topics", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await canonFact({ query: "Rune3 patience vault distribution" });

    expect(result.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    expect(result.supersession_note).toContain("Patience Vault");
  });

  it("prefers FACT_UPDATES override statements when available", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await canonFact({ query: "patience vault" });

    expect(result.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    expect(result.fact_update_reference).toBe("The Patience Vault was cancelled.");
    expect(result.canonical_fact).toBe("The Patience Vault was cancelled.");
  });
});
