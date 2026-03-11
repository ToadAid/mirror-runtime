import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadMirrorLoreScrolls,
  retrieveRelevantMirrorLore,
  retrieveRelevantMirrorLoreWithDiagnostics,
} from "./mirror-lore.js";

describe("mirror lore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => await fs.rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it("loads markdown scrolls from the lore directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-"));
    tempDirs.push(root);
    await fs.mkdir(path.join(root, "nested"), { recursive: true });
    await fs.writeFile(
      path.join(root, "moon.md"),
      "# Moon Well\nThe moon well remembers old vows.",
      "utf-8",
    );
    await fs.writeFile(
      path.join(root, "nested", "garden.mdx"),
      "# Garden Ledger\nThe reed garden keeps the ferryman's names.",
      "utf-8",
    );

    const scrolls = await loadMirrorLoreScrolls(root);

    expect(scrolls).toHaveLength(2);
    expect(scrolls.map((scroll) => scroll.title)).toEqual(["Moon Well", "Garden Ledger"]);
  });

  it("returns relevant scroll snippets with simple keyword retrieval", async () => {
    const scrolls = [
      {
        path: "/tmp/moon.md",
        filename: "moon.md",
        title: "Moon Well",
        body: "The moon well remembers old vows and silver water under the chapel steps.",
      },
      {
        path: "/tmp/garden.md",
        filename: "garden.md",
        title: "Garden Ledger",
        body: "The reed garden keeps ferry schedules and seed tallies.",
      },
    ];

    const results = retrieveRelevantMirrorLore({
      scrolls,
      query: "What does the moon well remember?",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      filename: "moon.md",
      title: "Moon Well",
    });
    expect(results[0]?.snippet).toContain("moon well remembers old vows");
  });

  it("returns retrieval diagnostics with candidate count and selected metadata", () => {
    const scrolls = [
      {
        path: "/tmp/moon.md",
        filename: "moon.md",
        title: "Moon Well",
        body: "The moon well remembers old vows and silver water under the chapel steps.",
      },
      {
        path: "/tmp/moon-garden.md",
        filename: "moon-garden.md",
        title: "Moon Garden",
        body: "The moon garden keeps old vows near the reed gate.",
      },
    ];

    const result = retrieveRelevantMirrorLoreWithDiagnostics({
      scrolls,
      query: "moon vows",
      limit: 1,
    });

    expect(result.candidateCount).toBe(2);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0]).toMatchObject({
      filename: "moon-garden.md",
      title: "Moon Garden",
    });
  });

  it("returns an empty result set when the lore directory is missing", async () => {
    await expect(loadMirrorLoreScrolls("/tmp/definitely-missing-mirror-lore")).resolves.toEqual([]);
  });
});
