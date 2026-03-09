import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverPondAgents } from "../discovery.js";

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  } as Response;
}

function b64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function mockGitHubFetch(routes: Record<string, MockResponse>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = toUrlString(input);
    const hit = routes[url];
    if (hit) {
      return hit as unknown as Response;
    }
    return response(404, { message: "not found" });
  }) as unknown as typeof fetch;
}

const FORKS_URL = "https://api.github.com/repos/MirrorAgent1/lore-keeper/forks?per_page=100";

function contentUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${owner}/${repo}/contents/pond-agent.json`;
}

describe("discoverPondAgents", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns a valid pond agent from pond-agent.json", async () => {
    globalThis.fetch = mockGitHubFetch({
      [FORKS_URL]: response(200, [{ owner: { login: "alice" }, name: "lore-keeper" }]),
      [contentUrl("alice", "lore-keeper")]: response(200, {
        encoding: "base64",
        content: b64Json({
          agent_id: "22915",
          agent_name: "Tommy Cave Scribe",
          builder: "tommyn9",
          repo: "tommyn9-22915/lore-keeper",
          role: "Lore Keeper",
          pond_enabled: true,
        }),
      }),
    });

    const out = await discoverPondAgents();
    expect(out).toHaveLength(1);
    expect(out[0]?.agent_id).toBe("22915");
  });

  it("ignores forks missing pond-agent.json", async () => {
    globalThis.fetch = mockGitHubFetch({
      [FORKS_URL]: response(200, [{ owner: { login: "bob" }, name: "lore-keeper" }]),
      [contentUrl("bob", "lore-keeper")]: response(404, { message: "Not Found" }),
    });

    const out = await discoverPondAgents();
    expect(out).toEqual([]);
  });

  it("ignores invalid pond-agent.json JSON payload", async () => {
    globalThis.fetch = mockGitHubFetch({
      [FORKS_URL]: response(200, [{ owner: { login: "carol" }, name: "lore-keeper" }]),
      [contentUrl("carol", "lore-keeper")]: response(200, {
        encoding: "base64",
        content: Buffer.from("not-json", "utf8").toString("base64"),
      }),
    });

    const out = await discoverPondAgents();
    expect(out).toEqual([]);
  });

  it("ignores entries with partial fields", async () => {
    globalThis.fetch = mockGitHubFetch({
      [FORKS_URL]: response(200, [{ owner: { login: "dave" }, name: "lore-keeper" }]),
      [contentUrl("dave", "lore-keeper")]: response(200, {
        encoding: "base64",
        content: b64Json({
          agent_id: "partial",
          agent_name: "Partial Agent",
          builder: "dave",
          repo: "dave/lore-keeper",
          role: "Lore Keeper",
        }),
      }),
    });

    const out = await discoverPondAgents();
    expect(out).toEqual([]);
  });

  it("returns only valid agents from a mixed forks list", async () => {
    globalThis.fetch = mockGitHubFetch({
      [FORKS_URL]: response(200, [
        { owner: { login: "eve" }, name: "lore-keeper" },
        { owner: { login: "frank" }, name: "lore-keeper" },
        { owner: { login: "grace" }, name: "lore-keeper" },
      ]),
      [contentUrl("eve", "lore-keeper")]: response(404, { message: "Not Found" }),
      [contentUrl("frank", "lore-keeper")]: response(200, {
        encoding: "base64",
        content: b64Json({
          agent_id: "1",
          agent_name: "Frank",
          builder: "frank",
          repo: "frank/lore-keeper",
          role: "Lore Keeper",
          pond_enabled: true,
        }),
      }),
      [contentUrl("grace", "lore-keeper")]: response(200, {
        encoding: "base64",
        content: b64Json({ bad: "shape" }),
      }),
    });

    const out = await discoverPondAgents();
    expect(out).toEqual([
      {
        agent_id: "1",
        agent_name: "Frank",
        builder: "frank",
        repo: "frank/lore-keeper",
        role: "Lore Keeper",
        pond_enabled: true,
      },
    ]);
  });
});
