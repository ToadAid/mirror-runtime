import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildLoreContext } from "../context_builder.js";
import type { MirrorLoreRetrievalCandidate, MirrorMemoryContext } from "../types.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-context-"));
  tempDirs.push(dir);
  return dir;
}

function makeLongSection(word: string, count: number): string {
  return Array.from({ length: count }, () => word).join(" ");
}

describe("buildLoreContext", () => {
  it("respects token limits and preserves scroll provenance", async () => {
    const loreDir = await createTempLoreDir();
    await fs.writeFile(
      path.join(loreDir, "TOBY_L100_TestScroll.md"),
      [
        "# Root",
        makeLongSection("intro", 80),
        "## Patience Vault",
        makeLongSection("patience", 160),
        "## Other",
        makeLongSection("other", 160),
      ].join("\n\n"),
      "utf8",
    );

    const candidates: MirrorLoreRetrievalCandidate[] = [
      {
        scroll_id: "TOBY_L100",
        title: "TestScroll",
        path: "TOBY_L100_TestScroll.md",
        score: 10,
        reasons: ["keyword_index:patience vault"],
        supersedes_topics: [],
        canon_notes: [],
      },
    ];

    const result = await buildLoreContext({
      loreDir,
      query: "What happened to the patience vault?",
      candidates,
      maxScrolls: 1,
      maxSectionsPerScroll: 2,
      maxLoreTokens: 60,
    });

    expect(result.tokenCount).toBeLessThanOrEqual(60);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.content).toContain(
      "[CANON_SCROLL] TOBY_L100 | TestScroll | TOBY_L100_TestScroll.md#",
    );
    expect(result.content).toContain("[SECTION]");
  });

  it("prefers sections that match the query", async () => {
    const loreDir = await createTempLoreDir();
    await fs.writeFile(
      path.join(loreDir, "TOBY_L200_Patience.md"),
      [
        "# Prelude",
        "quiet opening section",
        "## Patience Vault",
        "patience vault cancelled patience vault cancelled",
        "## Distant Topic",
        "unrelated orchard moon river",
      ].join("\n\n"),
      "utf8",
    );

    const candidates: MirrorLoreRetrievalCandidate[] = [
      {
        scroll_id: "TOBY_L200",
        title: "Patience",
        path: "TOBY_L200_Patience.md",
        score: 22,
        reasons: ["direct_query_match"],
        supersedes_topics: [],
        canon_notes: [],
      },
    ];

    const result = await buildLoreContext({
      loreDir,
      query: "patience vault",
      candidates,
      maxScrolls: 1,
      maxSectionsPerScroll: 1,
      maxLoreTokens: 120,
    });

    expect(result.sections[0]?.heading).toBe("Patience Vault");
    expect(result.sections[0]?.anchor).toBe("patience-vault");
  });

  it("appends memory context after canon context", async () => {
    const loreDir = await createTempLoreDir();
    await fs.writeFile(
      path.join(loreDir, "TOBY_L300_Canon.md"),
      "# Canon\n\nThe canon says patience remains central.\n",
      "utf8",
    );

    const candidates: MirrorLoreRetrievalCandidate[] = [
      {
        scroll_id: "TOBY_L300",
        title: "Canon",
        path: "TOBY_L300_Canon.md",
        score: 20,
        reasons: ["direct_query_match"],
        supersedes_topics: [],
        canon_notes: [],
      },
    ];
    const memory: MirrorMemoryContext = {
      observations: [
        {
          id: 1,
          topic: "patience",
          content: "A traveler said the vault still exists.",
          score: 4,
          source_type: "manual",
          confidence: 0.4,
        },
      ],
      userReflection: null,
      retrievalHistory: [],
    };

    const result = await buildLoreContext({
      loreDir,
      query: "patience",
      candidates,
      memory,
      maxLoreTokens: 200,
    });

    const canonIndex = result.content.indexOf("[CANON_SCROLL]");
    const memoryIndex = result.content.indexOf("Secondary Context (Observations):");

    expect(canonIndex).toBeGreaterThanOrEqual(0);
    expect(memoryIndex).toBeGreaterThan(canonIndex);
    expect(result.content).toContain(
      "If it conflicts with canon scrolls above, the canon scrolls win.",
    );
  });
});
