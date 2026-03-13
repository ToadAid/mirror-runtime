import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareMirrorChatRequest } from "../mirror-runtime/index.js";
import { retrieveCanonicalScrolls } from "../mirror/lore_retrieval/index.js";
import { reflectOnCanonContext, reviewCanonDraft } from "./index.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-reflection-"));
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
    path.join(loreDir, "TOBY_L0002_DawnOfRenewal.md"),
    [
      "---",
      "title: Dawn Of Renewal",
      "epoch: E1",
      "symbols: [🌅]",
      "sacred_numbers: [5]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Dawn Of Renewal",
      "",
      "At sunrise the covenant begins again.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        renewal: ["TOBY_L0001_SeedOfStillness.md", "TOBY_L0002_DawnOfRenewal.md"],
        sunrise: ["TOBY_L0001_SeedOfStillness.md", "TOBY_L0002_DawnOfRenewal.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

describe("mirror reflection engine", () => {
  it("detects canon themes from retrieved excerpts", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const retrieval = await retrieveCanonicalScrolls("renewal at sunrise", { loreDir, limit: 3 });
    const reflection = await reflectOnCanonContext({
      query: "renewal at sunrise",
      loreDir,
      candidates: retrieval.candidates,
      matchedSymbols: retrieval.diagnostics.matchedSymbols,
    });

    expect(reflection.themes.some((theme) => theme.theme === "renewal")).toBe(true);
    expect(reflection.scroll_clusters.length).toBeGreaterThan(0);
  });

  it("detects symbolic resonance across retrieved scrolls", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const retrieval = await retrieveCanonicalScrolls("renewal", { loreDir, limit: 3 });
    const reflection = await reflectOnCanonContext({
      query: "renewal",
      loreDir,
      candidates: retrieval.candidates,
      matchedSymbols: retrieval.diagnostics.matchedSymbols,
    });

    expect(reflection.symbolic_resonance.symbols.some((entry) => entry.symbol === "🌅")).toBe(true);
  });

  it("flags canon overlap during draft review", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const review = await reviewCanonDraft({
      loreDir,
      draftContent:
        "---\n" +
        "title: New Renewal Draft\n" +
        "epoch: E1\n" +
        "symbols: [🌅]\n" +
        "sacred_numbers: [3]\n" +
        "sha256_seed: TBD\n" +
        "---\n\n" +
        "# New Renewal Draft\n\n" +
        "Renewal begins in stillness beside the pond at sunrise.\n",
      draftPath: "TOBY_L0000_NewRenewalDraft.md",
    });

    expect(review.overlap_candidates[0]?.similarity).toBeGreaterThan(0.2);
    expect(review.potential_conflicts.length).toBeGreaterThan(0);
    expect(review.suggested_symbols).toContain("🌅");
  });

  it("integrates reflection output into the chat engine prompt", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const prepared = await prepareMirrorChatRequest({
      model: "test-model",
      messages: [{ role: "user", content: "What marks renewal?" }],
    });

    expect(prepared.modelRequest.messages[1]?.role).toBe("system");
    expect(prepared.modelRequest.messages[1]?.content).toContain("Mirror reflection analysis:");
  });
});
