import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPondIssueComments, parsePondResponseFromComment } from "../ingest.js";
import type { PondDispatchRequest } from "../messages.js";

const REQUEST: PondDispatchRequest = {
  from: "mirror-core",
  to: "22915",
  type: "lore_query",
  message: "Summarize current lore",
  trace_id: "trace-999",
};

function toUrlString(url: RequestInfo | URL): string {
  if (typeof url === "string") {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  return url.url;
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get(name);
  }
  if (Array.isArray(headers)) {
    const match = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
    return match?.[1] ?? null;
  }
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

describe("parsePondResponseFromComment", () => {
  it("parses valid cave scribe response", () => {
    const comment = [
      "Signal",
      "Lore pulse stable.",
      "",
      "Reflection",
      "Telemetry aligns with prior cycle.",
      "",
      "Sources",
      "- lore/canonical/TOBY_L001.md",
      "- lore/canonical/TOBY_L002.md",
    ].join("\n");

    const out = parsePondResponseFromComment(comment, REQUEST);

    expect(out).toEqual({
      from: "22915",
      to: "mirror-core",
      type: "lore_response",
      trace_id: "trace-999",
      signal: "Lore pulse stable.",
      reflection: "Telemetry aligns with prior cycle.",
      sources: ["lore/canonical/TOBY_L001.md", "lore/canonical/TOBY_L002.md"],
    });
  });

  it("returns null when Signal section is missing", () => {
    const comment = ["Reflection", "Some reflection", "", "Sources", "- source.md"].join("\n");
    expect(parsePondResponseFromComment(comment, REQUEST)).toBeNull();
  });

  it("returns null when Reflection section is missing", () => {
    const comment = ["Signal", "Some signal", "", "Sources", "- source.md"].join("\n");
    expect(parsePondResponseFromComment(comment, REQUEST)).toBeNull();
  });

  it("returns empty sources when Sources section is missing", () => {
    const comment = ["Signal", "Some signal", "", "Reflection", "Some reflection"].join("\n");

    const out = parsePondResponseFromComment(comment, REQUEST);
    expect(out?.sources).toEqual([]);
  });
});

describe("fetchPondIssueComments", () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  it("returns [] when token is missing", async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const out = await fetchPondIssueComments("owner/repo", 12);

    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches and normalizes GitHub comments", async () => {
    process.env.GITHUB_TOKEN = "test-token";

    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(toUrlString(url)).toBe("https://api.github.com/repos/owner/repo/issues/12/comments");
      expect(init?.method).toBe("GET");
      expect(getHeader(init, "Authorization")).toBe("Bearer test-token");

      return {
        ok: true,
        status: 200,
        async json() {
          return [{ body: "first" }, { body: "second" }, { body: 42 }];
        },
      } as Response;
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await fetchPondIssueComments("owner/repo", 12);
    expect(out).toEqual([{ body: "first" }, { body: "second" }]);
  });

  it("fails gracefully on GitHub HTTP errors", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    globalThis.fetch = vi.fn(async () => {
      return {
        ok: false,
        status: 403,
        async json() {
          return { message: "rate limit" };
        },
      } as Response;
    }) as unknown as typeof fetch;

    const out = await fetchPondIssueComments("owner/repo", 12);
    expect(out).toEqual([]);
  });
});
