import { beforeEach, describe, expect, it } from "vitest";
import { dispatchToPondAgent, resolvePondAgent } from "../dispatch.js";
import type { PondDispatchRequest } from "../messages.js";
import { setPondAgents } from "../registry.js";
import type { PondAgent } from "../types.js";

const AGENTS: PondAgent[] = [
  {
    agent_id: "22915",
    agent_name: "Tommy Cave Scribe",
    builder: "tommyn9",
    repo: "tommyn9-22915/lore-keeper",
    role: "Lore Keeper",
    pond_enabled: true,
  },
  {
    agent_id: "44100",
    agent_name: "Delta Scribe",
    builder: "delta",
    repo: "delta-44100/lore-keeper",
    role: "Lore Keeper",
    pond_enabled: true,
  },
];

function makeRequest(to: string): PondDispatchRequest {
  return {
    from: "mirror-core",
    to,
    type: "lore_query",
    message: "Find lore signal",
    trace_id: "trace-001",
  };
}

describe("pond dispatch v0", () => {
  beforeEach(() => {
    setPondAgents(AGENTS);
  });

  it("resolves existing agent by agent_id", () => {
    const out = resolvePondAgent("22915");
    expect(out).toEqual(AGENTS[0]);
  });

  it("resolves existing agent by repo", () => {
    const out = resolvePondAgent("delta-44100/lore-keeper");
    expect(out).toEqual(AGENTS[1]);
  });

  it("returns null for missing target", () => {
    const out = resolvePondAgent("missing-agent");
    expect(out).toBeNull();
  });

  it("dispatch to existing agent returns delivered true", async () => {
    const req = makeRequest("22915");
    const out = await dispatchToPondAgent(req);

    expect(out.delivered).toBe(true);
    expect(out.target).toEqual(AGENTS[0]);
    expect(out.mode).toBe("resolved-only");
  });

  it("dispatch to missing agent returns delivered false", async () => {
    const req = makeRequest("not-found");
    const out = await dispatchToPondAgent(req);

    expect(out.delivered).toBe(false);
    expect(out.target).toBeNull();
    expect(out.mode).toBe("resolved-only");
  });

  it("preserves request payload exactly", async () => {
    const req: PondDispatchRequest = {
      from: "mirror-core",
      to: "delta-44100/lore-keeper",
      type: "lore_query",
      message: "Reflect on cave ledger",
      trace_id: "trace-preserve-123",
    };

    const out = await dispatchToPondAgent(req);
    expect(out.request).toBe(req);
    expect(out.request).toEqual(req);
  });
});
