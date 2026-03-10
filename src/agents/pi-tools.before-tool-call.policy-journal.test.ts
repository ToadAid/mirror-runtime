import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readMirrorJournal } from "../mirror-daemon/journal.js";
import { runBeforeToolCallHook } from "./pi-tools.before-tool-call.js";

describe("before_tool_call policy journal", () => {
  const tempDirs: string[] = [];
  const priorJournalPath = process.env.MIRROR_RUN_JOURNAL_PATH;

  afterEach(async () => {
    if (priorJournalPath === undefined) {
      delete process.env.MIRROR_RUN_JOURNAL_PATH;
    } else {
      process.env.MIRROR_RUN_JOURNAL_PATH = priorJournalPath;
    }
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("writes decision path entries for allow/require_approval/deny", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-policy-journal-"));
    tempDirs.push(dir);
    process.env.MIRROR_RUN_JOURNAL_PATH = path.join(dir, "run_journal.jsonl");

    const allow = await runBeforeToolCallHook({
      toolName: "onchain.read",
      toolCallId: "call-allow",
      params: { rpcUrl: "https://example.test" },
      ctx: { agentId: "agent-a" },
    });
    const requireApproval = await runBeforeToolCallHook({
      toolName: "fs.write",
      toolCallId: "call-approval",
      params: { path: "notes.txt", content: "hello" },
      ctx: { agentId: "agent-a" },
    });
    const deny = await runBeforeToolCallHook({
      toolName: "onchain.write",
      toolCallId: "call-deny-onchain-write",
      params: { tx: "0xdeadbeef" },
      ctx: { agentId: "agent-a" },
    });

    expect(allow.blocked).toBe(false);
    expect(requireApproval.blocked).toBe(false);
    expect(deny.blocked).toBe(true);

    const entries = await readMirrorJournal({
      path: process.env.MIRROR_RUN_JOURNAL_PATH,
    });
    const decisions = entries.filter((entry) => entry.event_type === "policy.decision");
    const approvals = entries.filter((entry) => entry.event_type === "approval.requested");
    expect(decisions.length).toBeGreaterThanOrEqual(3);
    expect(approvals.some((entry) => entry.trace_id === "call-approval")).toBe(true);
    expect(
      approvals.some(
        (entry) =>
          entry.trace_id === "call-approval" &&
          entry.reason?.includes("enforcement=advisory-only-non-exec-v0"),
      ),
    ).toBe(true);
    expect(
      decisions.some(
        (entry) =>
          entry.trace_id === "call-deny-onchain-write" &&
          entry.decision === "deny" &&
          entry.risk_tier === "forbidden",
      ),
    ).toBe(true);
  });
});
