import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitScroll } from "../mirror/skills/commit_scroll/commit_scroll.js";
import { reviewDraftForCanon } from "./index.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-review-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# Updates\n", "utf8");
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        renewal: ["TOBY_L7_ExistingLore.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L7_ExistingLore.md"),
    [
      "---",
      "title: Existing Lore",
      "epoch: Epoch1",
      "symbols: [🌅]",
      "sacred_numbers: [7]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Existing Lore",
      "",
      "Renewal begins in stillness beside the pond at sunrise.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_C9_ExistingCorrection.md"),
    [
      "---",
      "title: Existing Correction",
      "epoch: Epoch1",
      "symbols: [♾️]",
      "sacred_numbers: [7]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Existing Correction",
      "",
      "The patience vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
}

function validDraft(body: string, symbols = "[🌅]"): string {
  return [
    "---",
    "title: New Review Draft",
    "epoch: Epoch1",
    `symbols: ${symbols}`,
    "sacred_numbers: [7]",
    "sha256_seed: TBD",
    "---",
    "",
    "# New Review Draft",
    "",
    body,
    "",
  ].join("\n");
}

describe("mirror canon review engine", () => {
  it("detects canon conflicts", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const review = await reviewDraftForCanon({
      loreDir,
      draftContent: validDraft("The patience vault was not cancelled."),
    });

    expect(review.status).toBe("conflict_detected");
    expect(review.conflicts.some((conflict) => conflict.type === "contradiction")).toBe(true);
  });

  it("detects duplicate narratives", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const review = await reviewDraftForCanon({
      loreDir,
      draftContent: validDraft("Renewal begins in stillness beside the pond at sunrise."),
    });

    expect(review.similarities[0]?.similarity_score).toBeGreaterThan(0.4);
    expect(review.status === "needs_review" || review.status === "conflict_detected").toBe(true);
  });

  it("validates symbols against the registry", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);

    const review = await reviewDraftForCanon({
      loreDir,
      draftContent: validDraft("Plain archive text without renewal concepts.", "[☄️ ☄️ ☄️ ☄️]"),
    });

    expect(review.symbol_validation.unknown_symbols).toContain("☄️");
    expect(review.status).toBe("conflict_detected");
  });

  it("commit-scroll blocks review conflicts unless forced", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const blocked = await commitScroll({
      draft_scroll_content: validDraft("The patience vault was not cancelled."),
      preferred_filename: "TOBY_C0000_New_Conflict.md",
    });
    const forced = await commitScroll({
      draft_scroll_content: validDraft("The patience vault was not cancelled."),
      preferred_filename: "TOBY_C0000_New_Conflict.md",
      force: true,
    });

    expect(blocked.committed).toBe(false);
    expect(blocked.review?.status).toBe("conflict_detected");
    expect(forced.committed).toBe(true);
  });
});
