import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitScroll } from "./commit_scroll.js";

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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-commit-scroll-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  await fs.mkdir(path.join(loreDir, "_index"), { recursive: true });
  await fs.writeFile(path.join(loreDir, "_index", "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(loreDir, "_index", "FACT_UPDATES.md"), "# Updates\n", "utf8");
  await fs.writeFile(path.join(loreDir, "_index", "KEYWORD_INDEX.json"), "{}\n", "utf8");
  await fs.writeFile(
    path.join(loreDir, "TOBY_L7_ExistingLore.md"),
    validDraft("Existing Lore", "L").replaceAll("TOBY_L0000", "TOBY_L7"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_QA2_ExistingQuestion.md"),
    validDraft("Existing Question", "QA").replaceAll("TOBY_QA0000", "TOBY_QA2"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_C9_ExistingCorrection.md"),
    validDraft("Existing Correction", "C").replaceAll("TOBY_C0000", "TOBY_C9"),
    "utf8",
  );
}

function validDraft(title: string, family: "L" | "QA" | "C"): string {
  const opening =
    family === "QA"
      ? "## Question\n\nWhat is asked?\n\n## Answer\n\nThe answer is given.\n"
      : family === "C"
        ? "## Covenant or Commentary\n\nCanon clarification text.\n\n## Interpretation\n\nMeaning is preserved.\n"
        : "## Opening Thesis\n\nA lore telling begins.\n\n## Body Narrative\n\nThe body continues.\n";

  return [
    "---",
    `title: ${title}`,
    "epoch: Epoch1",
    "symbols: [🌅]",
    "sacred_numbers: [7]",
    "sha256_seed: TBD",
    "---",
    "",
    `# ${title}`,
    "",
    `${opening}`,
    "## Cryptic Symbol Table",
    "",
    "🌅: renewal",
    "",
    "## Reference Scrolls",
    "",
    `TOBY_${family}0000`,
    "",
  ].join("\n");
}

describe("commitScroll", () => {
  it("commits a new L scroll with the next L-family number", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await commitScroll({
      draft_scroll_content: validDraft("New Lore Scroll", "L"),
      preferred_filename: "TOBY_L0000_New_Lore_Scroll.md",
    });

    expect(result.committed).toBe(true);
    expect(result.family).toBe("L");
    expect(result.assigned_number).toBe(8);
    expect(result.final_filename).toBe("TOBY_L8_New_Lore_Scroll.md");
    expect(await fs.readFile(result.final_path, "utf8")).toContain("TOBY_L8");
    expect((await fs.readdir(loreDir)).some((entry) => entry.includes(".tmp-"))).toBe(false);
    expect(result.index_refresh_status.indexPath).toBe(
      path.join(loreDir, "_index", "scroll_index.json"),
    );
  });

  it("commits a new QA scroll with the next QA-family number", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await commitScroll({
      draft_scroll_content: validDraft("New QA Scroll", "QA"),
      preferred_filename: "TOBY_QA0000_New_QA_Scroll.md",
    });

    expect(result.committed).toBe(true);
    expect(result.family).toBe("QA");
    expect(result.assigned_number).toBe(3);
    expect(result.final_filename).toBe("TOBY_QA3_New_QA_Scroll.md");
  });

  it("commits a new C scroll with the next C-family number", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await commitScroll({
      draft_scroll_content: validDraft("New Canon Scroll", "C"),
      preferred_filename: "TOBY_C0000_New_Canon_Scroll.md",
    });

    expect(result.committed).toBe(true);
    expect(result.family).toBe("C");
    expect(result.assigned_number).toBe(10);
    expect(result.final_filename).toBe("TOBY_C10_New_Canon_Scroll.md");
  });

  it("supports dry_run without writing the file", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const result = await commitScroll({
      draft_scroll_content: validDraft("Dry Run Lore", "L"),
      preferred_filename: "TOBY_L0000_Dry_Run_Lore.md",
      dry_run: true,
    });

    expect(result.committed).toBe(false);
    expect(result.index_refresh_status.reason).toBe("dry_run");
    expect(result.dry_run_preview?.content).toContain("TOBY_L8");
    await expect(fs.stat(result.final_path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("prevents duplicate numbers and does not overwrite earlier commits", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const first = await commitScroll({
      draft_scroll_content: validDraft("New Lore Scroll", "L"),
      preferred_filename: "TOBY_L0000_New_Lore_Scroll.md",
    });
    const second = await commitScroll({
      draft_scroll_content: validDraft("New Lore Scroll", "L"),
      preferred_filename: "TOBY_L0000_New_Lore_Scroll.md",
    });

    expect(first.committed).toBe(true);
    expect(second.committed).toBe(true);
    expect(first.assigned_number).toBe(8);
    expect(second.assigned_number).toBe(9);
    expect(first.final_filename).toBe("TOBY_L8_New_Lore_Scroll.md");
    expect(second.final_filename).toBe("TOBY_L9_New_Lore_Scroll.md");
    expect(await fs.readFile(first.final_path, "utf8")).toContain("TOBY_L8");
  });

  it("does not write when validation fails", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const invalidDraft = validDraft("Broken Lore", "L").replace(
      "sha256_seed: TBD",
      "sha256_seed: ",
    );
    const result = await commitScroll({
      draft_scroll_content: invalidDraft,
      preferred_filename: "TOBY_L0000_Broken_Lore.md",
    });

    expect(result.committed).toBe(false);
    expect(result.validation.warningCount).toBeGreaterThan(0);
    await expect(fs.stat(result.final_path)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("assigns numbers separately for each family", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const loreResult = await commitScroll({
      draft_scroll_content: validDraft("Family Specific Lore", "L"),
      preferred_filename: "TOBY_L0000_Family_Specific_Lore.md",
    });
    const qaResult = await commitScroll({
      draft_scroll_content: validDraft("Family Specific QA", "QA"),
      preferred_filename: "TOBY_QA0000_Family_Specific_QA.md",
    });

    expect(loreResult.assigned_number).toBe(8);
    expect(qaResult.assigned_number).toBe(3);
  });
});
