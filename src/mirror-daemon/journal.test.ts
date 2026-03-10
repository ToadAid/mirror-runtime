import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendMirrorJournalEntry,
  hashJournalArgs,
  readMirrorJournal,
  resolveMirrorJournalPath,
} from "./journal.js";

describe("mirror journal", () => {
  const createdPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      createdPaths.map(async (filePath) => {
        await fs.rm(path.dirname(filePath), { recursive: true, force: true });
      }),
    );
    createdPaths.length = 0;
  });

  it("appends and reads jsonl entries with limit", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-journal-"));
    const filePath = path.join(dir, "run_journal.jsonl");
    createdPaths.push(filePath);

    await appendMirrorJournalEntry(
      { event_type: "policy.decision", trace_id: "t1", tool_name: "read" },
      filePath,
    );
    await appendMirrorJournalEntry(
      { event_type: "tool.executed", trace_id: "t2", tool_name: "exec", ok: true },
      filePath,
    );

    const all = await readMirrorJournal({ path: filePath });
    expect(all).toHaveLength(2);
    const limited = await readMirrorJournal({ path: filePath, limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.trace_id).toBe("t2");
  });

  it("returns stable argument hashes", () => {
    const first = hashJournalArgs({ b: 1, a: [3, 2, 1] });
    const second = hashJournalArgs({ a: [3, 2, 1], b: 1 });
    expect(first).toBe(second);
  });

  it("resolves default path under .mirror", () => {
    const filePath = resolveMirrorJournalPath();
    expect(filePath.endsWith(path.join(".mirror", "run_journal.jsonl"))).toBe(true);
  });
});
