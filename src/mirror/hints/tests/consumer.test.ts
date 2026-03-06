import { describe, expect, it } from "vitest";
import { consumeMirrorHints, type MirrorHint } from "../consumer.js";

describe("consumeMirrorHints", () => {
  it("dedupes by toolName+signature and keeps top 3", () => {
    const hints: MirrorHint[] = [
      {
        type: "mirror_hint",
        ts: 100,
        runId: "run-1",
        toolName: "exec",
        signature: "tool:exec|err:a",
        repeats: 4,
        hint: "h1",
      },
      {
        type: "mirror_hint",
        ts: 101,
        runId: "run-1",
        toolName: "exec",
        signature: "tool:exec|err:a",
        repeats: 9,
        hint: "dup",
      },
      {
        type: "mirror_hint",
        ts: 102,
        runId: "run-1",
        toolName: "read",
        signature: "tool:read|err:b",
        repeats: 3,
        hint: "h2",
      },
      {
        type: "mirror_hint",
        ts: 103,
        runId: "run-1",
        toolName: "write",
        signature: "tool:write|err:c",
        repeats: 7,
        hint: "h3",
      },
      {
        type: "mirror_hint",
        ts: 104,
        runId: "run-1",
        toolName: "message",
        signature: "tool:message|err:d",
        repeats: 2,
        hint: "h4",
      },
    ];

    const { nudges } = consumeMirrorHints({ runId: "run-1", hints });

    expect(nudges).toEqual([
      "Adjust write: repeated tool_error (7x).",
      "Adjust exec: repeated tool_error (4x).",
      "Adjust read: repeated tool_error (3x).",
    ]);
  });

  it("returns no nudges for empty hints", () => {
    const { nudges } = consumeMirrorHints({ runId: "run-1", hints: [] });
    expect(nudges).toEqual([]);
  });
});
