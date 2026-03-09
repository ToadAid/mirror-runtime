import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setPondAgents, getPondAgents } from "../registry.js";

vi.mock("../discovery.js", () => ({
  discoverPondAgents: vi.fn(),
}));

vi.mock("../orchestrate.js", () => ({
  orchestratePondLoreQuery: vi.fn(),
}));

vi.mock("../consult.js", () => ({
  consultPond: vi.fn(),
}));

vi.mock("../../../runtime/brain-chat.js", () => ({
  handleBrainChatEndpoint: vi.fn(async () => ({})),
}));

vi.mock("../../../runtime/health.js", () => ({
  handleHealthEndpoint: vi.fn(async () => ({ ok: true })),
}));

import { createNonExitingRuntime } from "../../../runtime.js";
import { startRuntimeServer } from "../../../runtime/server.js";
import { consultPond } from "../consult.js";
import { discoverPondAgents } from "../discovery.js";
import { orchestratePondLoreQuery } from "../orchestrate.js";
import type { PondAgent } from "../types.js";

const mockedDiscover = vi.mocked(discoverPondAgents);
const mockedOrchestrate = vi.mocked(orchestratePondLoreQuery);
const mockedConsult = vi.mocked(consultPond);

async function startServer(): Promise<{ baseUrl: string; server: Server }> {
  process.env.MIRROR_ENABLE_RUNTIME = "true";

  const app = await startRuntimeServer(createNonExitingRuntime(), undefined, undefined);
  const server = app.listen(0);
  await once(server, "listening");

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("failed to bind test server");
  }
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    server,
  };
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

describe("pond runtime endpoints", () => {
  let server: Server | null = null;
  let baseUrl = "";

  beforeEach(() => {
    setPondAgents([]);
    mockedDiscover.mockReset();
    mockedDiscover.mockResolvedValue([]);
    mockedOrchestrate.mockReset();
    mockedOrchestrate.mockResolvedValue({
      delivered: false,
      target_repo: null,
      request: {
        from: "mirror-core",
        to: "unknown",
        type: "lore_query",
        message: "default",
        trace_id: "trace-default",
      },
      response: null,
      status: "target-missing",
    });
    mockedConsult.mockReset();
    mockedConsult.mockResolvedValue({
      ok: false,
      target: null,
      trace_id: "trace-default",
      status: "target-missing",
      final_text: "The requested Cave Scribe could not be found in the pond.",
      sources: [],
    });
  });

  afterEach(async () => {
    setPondAgents([]);
    if (server) {
      await stopServer(server);
      server = null;
      baseUrl = "";
    }
  });

  it("GET /pond/agents returns empty registry", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/agents`);
    const body = (await response.json()) as { count: number; agents: PondAgent[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({ count: 0, agents: [] });
  });

  it("GET /pond/agents returns populated registry", async () => {
    const agents: PondAgent[] = [
      {
        agent_id: "22915",
        agent_name: "Tommy Cave Scribe",
        builder: "tommyn9",
        repo: "tommyn9-22915/lore-keeper",
        role: "Lore Keeper",
        pond_enabled: true,
      },
    ];

    mockedDiscover.mockResolvedValue(agents);
    ({ baseUrl, server } = await startServer());
    setPondAgents(agents);

    const response = await fetch(`${baseUrl}/pond/agents`);
    const body = (await response.json()) as { count: number; agents: PondAgent[] };

    expect(response.status).toBe(200);
    expect(body).toEqual({ count: 1, agents });
  });

  it("POST /pond/refresh refreshes and updates registry", async () => {
    const agents: PondAgent[] = [
      {
        agent_id: "42",
        agent_name: "Alpha Scribe",
        builder: "alpha",
        repo: "alpha/lore-keeper",
        role: "Lore Keeper",
        pond_enabled: true,
      },
      {
        agent_id: "43",
        agent_name: "Beta Scribe",
        builder: "beta",
        repo: "beta/lore-keeper",
        role: "Lore Keeper",
        pond_enabled: true,
      },
    ];

    ({ baseUrl, server } = await startServer());
    mockedDiscover.mockResolvedValueOnce(agents);

    const response = await fetch(`${baseUrl}/pond/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const body = (await response.json()) as { discovered: number; agents: PondAgent[] };

    expect(response.status).toBe(200);
    expect(body.discovered).toBe(2);
    expect(body.agents).toEqual(agents);
    expect(getPondAgents()).toEqual(agents);
  });

  it("POST /pond/query returns 400 when from is missing", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "from is required" });
  });

  it("POST /pond/query returns 400 when to is missing", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "to is required" });
  });

  it("POST /pond/query returns 400 when message is missing", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        to: "22915",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "message is required" });
  });

  it("POST /pond/query returns completed orchestration + synthesis", async () => {
    mockedOrchestrate.mockResolvedValueOnce({
      delivered: true,
      issue_number: 77,
      target_repo: "tommyn9-22915/lore-keeper",
      request: {
        from: "mirror-core",
        to: "22915",
        type: "lore_query",
        message: "Hello pond",
        trace_id: "trace-completed",
      },
      response: {
        from: "22915",
        to: "mirror-core",
        type: "lore_response",
        trace_id: "trace-completed",
        signal: "Signal text",
        reflection: "Reflection text",
        sources: ["lore/canonical/TOBY_L001.md"],
      },
      status: "completed",
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orchestration.status).toBe("completed");
    expect(body.orchestration.delivered).toBe(true);
    expect(body.orchestration.issue_number).toBe(77);
    expect(body.orchestration.response?.signal).toBe("Signal text");
    expect(body.synthesis.mode).toBe("pond-synthesized");
    expect(body.synthesis.status).toBe("completed");
    expect(body.synthesis.target).toBe("22915");
    expect(body.synthesis.trace_id).toBe("trace-completed");
    expect(body.synthesis.final_text).toBe("Signal\nSignal text\n\nReflection\nReflection text");
    expect(body.synthesis.sources).toEqual(["lore/canonical/TOBY_L001.md"]);
    expect(mockedOrchestrate).toHaveBeenCalledWith({
      from: "mirror-core",
      to: "22915",
      message: "Hello pond",
    });
  });

  it("POST /pond/query returns awaiting-response orchestration + synthesis", async () => {
    mockedOrchestrate.mockResolvedValueOnce({
      delivered: true,
      issue_number: 88,
      target_repo: "tommyn9-22915/lore-keeper",
      request: {
        from: "mirror-core",
        to: "22915",
        type: "lore_query",
        message: "Hello pond",
        trace_id: "trace-await",
      },
      response: null,
      status: "awaiting-response",
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orchestration.status).toBe("awaiting-response");
    expect(body.orchestration.delivered).toBe(true);
    expect(body.orchestration.response).toBeNull();
    expect(body.synthesis.status).toBe("awaiting-response");
    expect(body.synthesis.trace_id).toBe("trace-await");
    expect(body.synthesis.target).toBe("22915");
    expect(body.synthesis.final_text).toBe(
      "The pond has received the question, but no Cave Scribe reply has arrived yet.",
    );
    expect(body.synthesis.sources).toEqual([]);
  });

  it("POST /pond/query returns dispatch-failed orchestration + synthesis", async () => {
    mockedOrchestrate.mockResolvedValueOnce({
      delivered: false,
      target_repo: "tommyn9-22915/lore-keeper",
      request: {
        from: "mirror-core",
        to: "22915",
        type: "lore_query",
        message: "Hello pond",
        trace_id: "trace-failed",
      },
      response: null,
      status: "dispatch-failed",
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orchestration.status).toBe("dispatch-failed");
    expect(body.orchestration.delivered).toBe(false);
    expect(body.synthesis.status).toBe("dispatch-failed");
    expect(body.synthesis.trace_id).toBe("trace-failed");
    expect(body.synthesis.target).toBe("22915");
    expect(body.synthesis.final_text).toBe(
      "The pond could not deliver the query to the target Cave Scribe.",
    );
    expect(body.synthesis.sources).toEqual([]);
  });

  it("POST /pond/query returns target-missing orchestration + synthesis", async () => {
    mockedOrchestrate.mockResolvedValueOnce({
      delivered: false,
      target_repo: null,
      request: {
        from: "mirror-core",
        to: "missing",
        type: "lore_query",
        message: "Hello pond",
        trace_id: "trace-missing",
      },
      response: null,
      status: "target-missing",
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "mirror-core",
        to: "missing",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.orchestration.status).toBe("target-missing");
    expect(body.orchestration.delivered).toBe(false);
    expect(body.orchestration.target_repo).toBeNull();
    expect(body.synthesis.status).toBe("target-missing");
    expect(body.synthesis.trace_id).toBe("trace-missing");
    expect(body.synthesis.target).toBeNull();
    expect(body.synthesis.final_text).toBe(
      "The requested Cave Scribe could not be found in the pond.",
    );
    expect(body.synthesis.sources).toEqual([]);
  });

  it("POST /pond/consult returns 400 when to is missing", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "to is required" });
  });

  it("POST /pond/consult returns 400 when message is missing", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: "22915",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "message is required" });
  });

  it("POST /pond/consult returns 400 when from is provided but empty", async () => {
    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: " ",
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "from must be a non-empty string when provided",
    });
  });

  it("POST /pond/consult returns consult result and defaults from internally", async () => {
    mockedConsult.mockResolvedValueOnce({
      ok: true,
      target: "22915",
      trace_id: "trace-consult",
      status: "completed",
      final_text: "Signal\nA\n\nReflection\nB",
      sources: ["lore/canonical/TOBY_L001.md"],
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      target: "22915",
      trace_id: "trace-consult",
      status: "completed",
      final_text: "Signal\nA\n\nReflection\nB",
      sources: ["lore/canonical/TOBY_L001.md"],
    });
    expect(mockedConsult).toHaveBeenCalledWith({
      to: "22915",
      message: "Hello pond",
    });
  });

  it("POST /pond/consult passes explicit from when provided", async () => {
    mockedConsult.mockResolvedValueOnce({
      ok: false,
      target: "22915",
      trace_id: "trace-consult-await",
      status: "awaiting-response",
      final_text: "The pond has received the question, but no Cave Scribe reply has arrived yet.",
      sources: [],
    });

    ({ baseUrl, server } = await startServer());

    const response = await fetch(`${baseUrl}/pond/consult`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        from: "agentX",
        to: "22915",
        message: "Hello pond",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("awaiting-response");
    expect(mockedConsult).toHaveBeenCalledWith({
      from: "agentX",
      to: "22915",
      message: "Hello pond",
    });
  });
});
