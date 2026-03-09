import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PondDispatchRequest } from "../messages.js";
import { setPondAgents } from "../registry.js";
import { dispatchViaGitHubIssue } from "../transport.js";

function toUrlString(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

function parseRequestBody(init?: RequestInit): { title: string; body: string } {
  if (typeof init?.body !== "string") {
    return { title: "", body: "" };
  }
  return JSON.parse(init.body) as { title: string; body: string };
}

function makeRequest(to: string): PondDispatchRequest {
  return {
    from: "mirror-core",
    to,
    type: "lore_query",
    message: "Find cave signal",
    trace_id: "trace-xyz",
  };
}

describe("dispatchViaGitHubIssue", () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    setPondAgents([
      {
        agent_id: "22915",
        agent_name: "Tommy Cave Scribe",
        builder: "tommyn9",
        repo: "tommyn9-22915/lore-keeper",
        role: "Lore Keeper",
        pond_enabled: true,
      },
    ]);
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("returns delivered false when target is missing", async () => {
    const out = await dispatchViaGitHubIssue(makeRequest("missing"));

    expect(out).toEqual({
      delivered: false,
      mode: "github-issue",
      repo: null,
      trace_id: "trace-xyz",
      request: makeRequest("missing"),
    });
  });

  it("resolves target repo and posts issue payload", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(toUrlString(_url)).toBe(
        "https://api.github.com/repos/tommyn9-22915/lore-keeper/issues",
      );
      expect(init?.method).toBe("POST");

      const parsed = parseRequestBody(init);
      expect(parsed.title).toBe("[POND] lore_query from mirror-core (trace-xyz)");
      expect(parsed.body).toContain("from: mirror-core");
      expect(parsed.body).toContain("to: 22915");
      expect(parsed.body).toContain("type: lore_query");
      expect(parsed.body).toContain("trace_id: trace-xyz");
      expect(parsed.body).toContain("message:\nFind cave signal");

      return {
        ok: true,
        status: 201,
        async json() {
          return { number: 77 };
        },
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await dispatchViaGitHubIssue(makeRequest("22915"));

    expect(out.delivered).toBe(true);
    expect(out.repo).toBe("tommyn9-22915/lore-keeper");
    expect(out.trace_id).toBe("trace-xyz");
    expect(out.issue_number).toBe(77);
    expect(out.request).toEqual(makeRequest("22915"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves trace_id and fails gracefully when token is missing", async () => {
    const out = await dispatchViaGitHubIssue(makeRequest("22915"));

    expect(out.delivered).toBe(false);
    expect(out.mode).toBe("github-issue");
    expect(out.repo).toBe("tommyn9-22915/lore-keeper");
    expect(out.trace_id).toBe("trace-xyz");
    expect(out.issue_number).toBeUndefined();
    expect(out.request).toEqual(makeRequest("22915"));
  });
});
