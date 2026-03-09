import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PondDispatchResponse } from "../messages.js";

vi.mock("../transport.js", () => ({
  dispatchViaGitHubIssue: vi.fn(),
}));

vi.mock("../ingest.js", () => ({
  fetchPondIssueComments: vi.fn(),
  parsePondResponseFromComment: vi.fn(),
}));

import { fetchPondIssueComments, parsePondResponseFromComment } from "../ingest.js";
import { orchestratePondLoreQuery } from "../orchestrate.js";
import { dispatchViaGitHubIssue } from "../transport.js";

const mockedDispatch = vi.mocked(dispatchViaGitHubIssue);
const mockedFetchComments = vi.mocked(fetchPondIssueComments);
const mockedParse = vi.mocked(parsePondResponseFromComment);

describe("orchestratePondLoreQuery", () => {
  beforeEach(() => {
    mockedDispatch.mockReset();
    mockedFetchComments.mockReset();
    mockedParse.mockReset();
  });

  it("returns target-missing when dispatch target does not exist", async () => {
    mockedDispatch.mockResolvedValue({
      delivered: false,
      mode: "github-issue",
      repo: null,
      trace_id: "trace-1",
      request: {
        from: "a",
        to: "b",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-1",
      },
    });

    const out = await orchestratePondLoreQuery({ from: "mirror", to: "missing", message: "hi" });

    expect(out.status).toBe("target-missing");
    expect(out.delivered).toBe(false);
    expect(out.target_repo).toBeNull();
    expect(out.response).toBeNull();
  });

  it("returns dispatch-failed when target exists but transport fails", async () => {
    mockedDispatch.mockResolvedValue({
      delivered: false,
      mode: "github-issue",
      repo: "owner/repo",
      trace_id: "trace-2",
      request: {
        from: "a",
        to: "b",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-2",
      },
    });

    const out = await orchestratePondLoreQuery({ from: "mirror", to: "22915", message: "hi" });

    expect(out.status).toBe("dispatch-failed");
    expect(out.delivered).toBe(false);
    expect(out.target_repo).toBe("owner/repo");
    expect(out.response).toBeNull();
  });

  it("returns awaiting-response when dispatch succeeds without issue_number", async () => {
    mockedDispatch.mockResolvedValue({
      delivered: true,
      mode: "github-issue",
      repo: "owner/repo",
      trace_id: "trace-3",
      request: {
        from: "a",
        to: "b",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-3",
      },
    });

    const out = await orchestratePondLoreQuery({ from: "mirror", to: "22915", message: "hi" });

    expect(out.status).toBe("awaiting-response");
    expect(out.delivered).toBe(true);
    expect(out.issue_number).toBeUndefined();
    expect(out.response).toBeNull();
    expect(mockedFetchComments).not.toHaveBeenCalled();
  });

  it("returns completed when comments contain a valid parsed response", async () => {
    const parsed: PondDispatchResponse = {
      from: "22915",
      to: "mirror",
      type: "lore_response",
      trace_id: "trace-z",
      signal: "s",
      reflection: "r",
      sources: ["a.md"],
    };

    mockedDispatch.mockResolvedValue({
      delivered: true,
      mode: "github-issue",
      repo: "owner/repo",
      issue_number: 17,
      trace_id: "trace-4",
      request: {
        from: "a",
        to: "b",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-4",
      },
    });
    mockedFetchComments.mockResolvedValue([{ body: "old" }, { body: "new" }]);
    mockedParse.mockReturnValueOnce(parsed);

    const out = await orchestratePondLoreQuery({ from: "mirror", to: "22915", message: "hi" });

    expect(out.status).toBe("completed");
    expect(out.delivered).toBe(true);
    expect(out.issue_number).toBe(17);
    expect(out.target_repo).toBe("owner/repo");
    expect(out.response).toEqual(parsed);
    expect(mockedParse).toHaveBeenCalledTimes(1);
    expect(mockedParse.mock.calls[0]?.[0]).toBe("new");
  });

  it("returns awaiting-response when comments have no valid parsed response", async () => {
    mockedDispatch.mockResolvedValue({
      delivered: true,
      mode: "github-issue",
      repo: "owner/repo",
      issue_number: 22,
      trace_id: "trace-5",
      request: {
        from: "a",
        to: "b",
        type: "lore_query",
        message: "hello",
        trace_id: "trace-5",
      },
    });
    mockedFetchComments.mockResolvedValue([{ body: "old" }, { body: "new" }]);
    mockedParse.mockReturnValue(null);

    const out = await orchestratePondLoreQuery({ from: "mirror", to: "22915", message: "hi" });

    expect(out.status).toBe("awaiting-response");
    expect(out.delivered).toBe(true);
    expect(out.issue_number).toBe(22);
    expect(out.response).toBeNull();
    expect(mockedParse).toHaveBeenCalledTimes(2);
    expect(mockedParse.mock.calls[0]?.[0]).toBe("new");
    expect(mockedParse.mock.calls[1]?.[0]).toBe("old");
  });
});
