import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../orchestrate.js", () => ({
  orchestratePondLoreQuery: vi.fn(),
}));

vi.mock("../synthesize.js", () => ({
  synthesizePondResult: vi.fn(),
}));

import { consultPond } from "../consult.js";
import { orchestratePondLoreQuery } from "../orchestrate.js";
import { synthesizePondResult } from "../synthesize.js";

const mockedOrchestrate = vi.mocked(orchestratePondLoreQuery);
const mockedSynthesize = vi.mocked(synthesizePondResult);

function setupSynthesis(
  status: "completed" | "awaiting-response" | "dispatch-failed" | "target-missing",
) {
  mockedSynthesize.mockReturnValue({
    mode: "pond-synthesized",
    target: status === "target-missing" ? null : "22915",
    trace_id: "trace-123",
    final_text: `status=${status}`,
    sources: status === "completed" ? ["lore/canonical/TOBY_L001.md"] : [],
    status,
  });
}

describe("consultPond", () => {
  beforeEach(() => {
    mockedOrchestrate.mockReset();
    mockedSynthesize.mockReset();
    mockedOrchestrate.mockResolvedValue({
      delivered: true,
      issue_number: 1,
      target_repo: "owner/repo",
      request: {
        from: "agent0",
        to: "22915",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-123",
      },
      response: null,
      status: "awaiting-response",
    });
  });

  it("completed => ok true", async () => {
    setupSynthesis("completed");

    const out = await consultPond({ to: "22915", message: "hello" });

    expect(out.ok).toBe(true);
    expect(out.status).toBe("completed");
    expect(out.target).toBe("22915");
    expect(out.trace_id).toBe("trace-123");
    expect(out.sources).toEqual(["lore/canonical/TOBY_L001.md"]);
    expect(mockedOrchestrate).toHaveBeenCalledWith({
      from: "agent0",
      to: "22915",
      message: "hello",
    });
  });

  it("awaiting-response => ok false", async () => {
    setupSynthesis("awaiting-response");

    const out = await consultPond({ to: "22915", message: "hello", from: "agentX" });

    expect(out.ok).toBe(false);
    expect(out.status).toBe("awaiting-response");
    expect(out.target).toBe("22915");
    expect(out.trace_id).toBe("trace-123");
    expect(out.sources).toEqual([]);
    expect(mockedOrchestrate).toHaveBeenCalledWith({
      from: "agentX",
      to: "22915",
      message: "hello",
    });
  });

  it("dispatch-failed => ok false", async () => {
    setupSynthesis("dispatch-failed");

    const out = await consultPond({ to: "22915", message: "hello" });

    expect(out.ok).toBe(false);
    expect(out.status).toBe("dispatch-failed");
    expect(out.target).toBe("22915");
    expect(out.trace_id).toBe("trace-123");
    expect(out.sources).toEqual([]);
  });

  it("target-missing => ok false", async () => {
    setupSynthesis("target-missing");

    const out = await consultPond({ to: "missing", message: "hello" });

    expect(out.ok).toBe(false);
    expect(out.status).toBe("target-missing");
    expect(out.target).toBeNull();
    expect(out.trace_id).toBe("trace-123");
    expect(out.sources).toEqual([]);
  });
});
