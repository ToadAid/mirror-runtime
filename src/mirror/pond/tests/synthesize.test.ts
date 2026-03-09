import { describe, expect, it } from "vitest";
import type { PondOrchestrationResult } from "../orchestrate.js";
import { synthesizePondResult } from "../synthesize.js";

function baseResult(): Omit<PondOrchestrationResult, "status" | "response" | "delivered"> {
  return {
    issue_number: 77,
    target_repo: "tommyn9-22915/lore-keeper",
    request: {
      from: "mirror-core",
      to: "22915",
      type: "lore_query",
      message: "Find lore signal",
      trace_id: "trace-123",
    },
  };
}

describe("synthesizePondResult", () => {
  it("completed result produces combined final_text and sources", () => {
    const result: PondOrchestrationResult = {
      ...baseResult(),
      delivered: true,
      status: "completed",
      response: {
        from: "22915",
        to: "mirror-core",
        type: "lore_response",
        trace_id: "trace-123",
        signal: "Lore pulse stable.",
        reflection: "No drift detected.",
        sources: ["lore/canonical/TOBY_L001.md"],
      },
    };

    const out = synthesizePondResult(result);

    expect(out).toEqual({
      mode: "pond-synthesized",
      target: "22915",
      trace_id: "trace-123",
      final_text: "Signal\nLore pulse stable.\n\nReflection\nNo drift detected.",
      sources: ["lore/canonical/TOBY_L001.md"],
      status: "completed",
    });
  });

  it("awaiting-response produces waiting text", () => {
    const result: PondOrchestrationResult = {
      ...baseResult(),
      delivered: true,
      status: "awaiting-response",
      response: null,
    };

    const out = synthesizePondResult(result);

    expect(out.status).toBe("awaiting-response");
    expect(out.final_text).toBe(
      "The pond has received the question, but no Cave Scribe reply has arrived yet.",
    );
    expect(out.sources).toEqual([]);
    expect(out.target).toBe("22915");
    expect(out.trace_id).toBe("trace-123");
  });

  it("dispatch-failed produces failure text", () => {
    const result: PondOrchestrationResult = {
      ...baseResult(),
      delivered: false,
      status: "dispatch-failed",
      response: null,
    };

    const out = synthesizePondResult(result);

    expect(out.status).toBe("dispatch-failed");
    expect(out.final_text).toBe("The pond could not deliver the query to the target Cave Scribe.");
    expect(out.sources).toEqual([]);
    expect(out.target).toBe("22915");
    expect(out.trace_id).toBe("trace-123");
  });

  it("target-missing produces missing-target text", () => {
    const result: PondOrchestrationResult = {
      ...baseResult(),
      delivered: false,
      status: "target-missing",
      response: null,
      target_repo: null,
    };

    const out = synthesizePondResult(result);

    expect(out.status).toBe("target-missing");
    expect(out.final_text).toBe("The requested Cave Scribe could not be found in the pond.");
    expect(out.sources).toEqual([]);
    expect(out.target).toBeNull();
    expect(out.trace_id).toBe("trace-123");
  });
});
