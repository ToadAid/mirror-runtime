import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { interpretTweet } from "./interpret_tweet.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-interpret-tweet-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
    [
      "---",
      "title: Seed Of Stillness",
      "epoch: E1",
      "symbols: [🌅, 🌊]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Seed Of Stillness",
      "",
      "Renewal begins in stillness beside the pond at sunrise.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_C0010_Rune3_PatienceVaultCancelled.md"),
    [
      "---",
      "title: Rune3 Patience Vault Cancelled",
      "epoch: E3",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Rune3 Patience Vault Cancelled",
      "",
      "The vault distribution was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# Tobyworld Canon Updates\n", "utf8");
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        renewal: ["TOBY_L0001_SeedOfStillness.md"],
        sunrise: ["TOBY_L0001_SeedOfStillness.md"],
        "patience vault": ["TOBY_C0010_Rune3_PatienceVaultCancelled.md"],
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
        "TOBY_C0010_Rune3_PatienceVaultCancelled.md": {
          supersedes_topics: ["Rune3 patience vault distribution"],
          notes: "Use this scroll for Patience Vault questions.",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("interpretTweet", () => {
  it("builds a basic lore interpretation from a tweet", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await interpretTweet({
      tweet_text: "At sunrise the pond remembers renewal.",
      date: "2026-03-12",
      source_ref: "tweet:123",
    });

    expect(result.suggested_family).toBe("L");
    expect(result.suggested_title).toContain("Sunrise");
    expect(result.interpreted_meaning).toContain("lore-bearing observation");
    expect(result.operations_draft).toContain("tweet:123");
  });

  it("suggests symbols from the registry and tweet marks", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await interpretTweet({
      tweet_text: "🌅 Renewal rises again at the pond.",
    });

    expect(result.suggested_symbols).toContain("🌅");
    expect(result.suggested_symbols).toContain("🌊");
    expect(result.key_marks).toContain("🌅");
  });

  it("is aware of similar existing canon through retrieval", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await interpretTweet({
      tweet_text: "The patience vault is no longer coming.",
    });

    expect(result.suggested_family).toBe("C");
    expect(result.suggested_anchors.prev).toBe("TOBY_C0010_Rune3_PatienceVaultCancelled.md");
    expect(result.suggested_anchors.related_scrolls).toContain(
      "TOBY_C0010_Rune3_PatienceVaultCancelled.md",
    );
  });

  it("returns a forge-scroll-ready payload", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await interpretTweet({
      tweet_text: "What does the mirror reveal at sunrise?",
      preferred_family: "QA",
    });

    expect(result.forge_scroll_payload.category).toBe("QA");
    expect(result.forge_scroll_payload.title).toBe(result.suggested_title);
    expect(result.forge_scroll_payload.narrative).toContain(result.interpreted_meaning);
    expect(result.forge_scroll_payload.symbols).toEqual(result.suggested_symbols);
  });
});
