import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLoreGraph,
  findConceptClusters,
  findRelatedScrolls,
  findScrollsSharingSymbols,
  findSupersessionChains,
} from "./index.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-graph-"));
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
      "",
      "Reference: TOBY_L0002_DawnOfRenewal.md",
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
      "At sunrise renewal begins again.",
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
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "SUPERSEDES.json"),
    JSON.stringify(
      {
        "TOBY_C0010_Rune3_PatienceVaultCancelled.md": {
          supersedes_topics: ["renewal dawn"],
          notes: "Use this scroll when answering later corrections.",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("mirror lore graph", () => {
  it("builds a graph from the scroll corpus", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const graph = await buildLoreGraph();

    expect(graph.nodes.some((node) => node.type === "scroll")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "symbol")).toBe(true);
    expect(graph.nodes.some((node) => node.type === "concept")).toBe(true);
  });

  it("connects scroll nodes through symbol edges", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const graph = await buildLoreGraph();
    const related = findScrollsSharingSymbols(graph, "🌅");

    expect(related).toContain("TOBY_L0001_SeedOfStillness.md");
    expect(related).toContain("TOBY_L0002_DawnOfRenewal.md");
  });

  it("creates narrative similarity edges", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const graph = await buildLoreGraph();
    const related = findRelatedScrolls(graph, "TOBY_L0001");

    expect(related).toContain("TOBY_L0002_DawnOfRenewal.md");
  });

  it("creates supersession edges and concept clusters", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const graph = await buildLoreGraph();
    const chain = findSupersessionChains(graph, "TOBY_C0010");
    const clusters = findConceptClusters(graph);

    expect(chain).toContain("TOBY_L0002_DawnOfRenewal.md");
    expect(clusters.some((cluster) => cluster.concept.includes("renewal"))).toBe(true);
  });
});
