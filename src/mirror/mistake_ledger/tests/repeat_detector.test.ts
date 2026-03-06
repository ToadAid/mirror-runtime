import { describe, expect, it } from "vitest";
import { countSignatureMatches, makeErrorSignature } from "../repeat_detector.js";
import type { LedgerEventRow } from "../types.js";

function makeRow(detail: Record<string, unknown>): LedgerEventRow {
  return {
    id: "id",
    ts: Date.now(),
    kind: "mistake",
    run_id: null,
    tool_name: "exec",
    agent_id: null,
    user_id: null,
    session_id: null,
    severity: "warn",
    title: "tool_error",
    detail_json: JSON.stringify(detail),
    tags_json: null,
    source: "system",
    related_id: null,
    hash: "hash",
  };
}

describe("repeat_detector", () => {
  it("normalizes different hex addresses into the same signature", () => {
    const a = makeErrorSignature({
      toolName: "exec",
      error: "Execution reverted at 0xABCDEF000123 and code 10001",
    });
    const b = makeErrorSignature({
      toolName: "EXEC",
      error: "execution reverted at 0x999999999999 and code 99999",
    });

    expect(a).toBe("tool:exec|err:execution reverted at 0x* and code #");
    expect(b).toBe("tool:exec|err:execution reverted at 0x* and code #");
    expect(a).toBe(b);
  });

  it("counts signature matches from detail_json", () => {
    const signature = "tool:exec|err:command failed";
    const rows: LedgerEventRow[] = [
      makeRow({ message: "command failed", signature }),
      makeRow({ message: "command failed", meta: { signature } }),
      makeRow({ message: "different", signature: "tool:exec|err:different" }),
      { ...makeRow({}), detail_json: "invalid-json" },
    ];

    expect(countSignatureMatches(rows, signature)).toBe(2);
  });
});
