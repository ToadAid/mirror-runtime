import { describe, expect, it, vi } from "vitest";
import {
  MirrorDaemonClientError,
  consultOcean,
  getMirrorRun,
  getMirrorProviderHealth,
  getMirrorProviderStatus,
  getOceanEvidence,
  getPondManifest,
  listMirrorJournal,
  listMirrorRuns,
  updateOceanTrust,
} from "./client.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("mirror-daemon client", () => {
  it("uses default base URL from MIRROR_DAEMON_PORT", async () => {
    const prior = process.env.MIRROR_DAEMON_PORT;
    process.env.MIRROR_DAEMON_PORT = "19999";
    try {
      const fetchMock = vi.fn(async (_url: string | URL | Request) =>
        jsonResponse({ pond_id: "toadaid-main" }),
      );
      await getPondManifest({ fetchFn: fetchMock as unknown as typeof fetch });
      expect(fetchMock).toHaveBeenCalledWith(
        "http://127.0.0.1:19999/pond/manifest",
        expect.objectContaining({ method: "GET" }),
      );
    } finally {
      if (prior === undefined) {
        delete process.env.MIRROR_DAEMON_PORT;
      } else {
        process.env.MIRROR_DAEMON_PORT = prior;
      }
    }
  });

  it("normalizes JSON error responses with status", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "unknown pond_id: x" }, 404));
    await expect(
      updateOceanTrust("x", "trusted", {
        baseUrl: "http://127.0.0.1:8787",
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      message: "unknown pond_id: x",
      status: 404,
      method: "POST",
    });
  });

  it("normalizes network failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await expect(
      consultOcean(
        "toadaid-main",
        { q: "ping" },
        {
          baseUrl: "http://127.0.0.1:8787",
          fetchFn: fetchMock as unknown as typeof fetch,
        },
      ),
    ).rejects.toBeInstanceOf(MirrorDaemonClientError);
    await expect(
      consultOcean(
        "toadaid-main",
        { q: "ping" },
        {
          baseUrl: "http://127.0.0.1:8787",
          fetchFn: fetchMock as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      status: undefined,
      method: "POST",
      message: "connect ECONNREFUSED",
    });
  });

  it("sends bearer token from options", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ local_pond_id: "toadaid-main" }));

    await getPondManifest({
      baseUrl: "http://127.0.0.1:8787",
      token: "daemon-token",
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/pond/manifest",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer daemon-token",
        }),
      }),
    );
  });

  it("calls mirror runs and ocean evidence endpoints", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({ count: 0, total: 0, order: "newest-first", runs: [] }),
    );

    await listMirrorRuns(
      { limit: 10, callerAgent: "agent0", status: "completed" },
      {
        baseUrl: "http://127.0.0.1:8787",
        fetchFn: fetchMock as unknown as typeof fetch,
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/mirror/runs?limit=10&caller_agent=agent0&status=completed",
      expect.objectContaining({ method: "GET" }),
    );

    const runFetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({
        summary: { run_id: "trace-1", trace_id: "trace-1" },
        order: "oldest-first",
        events: [],
      }),
    );
    await getMirrorRun("trace-1", {
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: runFetchMock as unknown as typeof fetch,
    });
    expect(runFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/mirror/runs/trace-1",
      expect.objectContaining({ method: "GET" }),
    );

    const evidenceFetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({ pond_id: "pond-a" }),
    );
    await getOceanEvidence("pond-a", {
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: evidenceFetchMock as unknown as typeof fetch,
    });
    expect(evidenceFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/ocean/ponds/pond-a/evidence",
      expect.objectContaining({ method: "GET" }),
    );

    const journalFetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({ count: 0, order: "newest-first", entries: [] }),
    );
    await listMirrorJournal(
      { limit: 3, type: "tool.executed", traceId: "trace-1" },
      {
        baseUrl: "http://127.0.0.1:8787",
        fetchFn: journalFetchMock as unknown as typeof fetch,
      },
    );
    expect(journalFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/mirror/journal?limit=3&type=tool.executed&trace_id=trace-1",
      expect.objectContaining({ method: "GET" }),
    );

    const providerFetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({
        provider: "brain-chat",
        default_model: "gpt-4o-mini",
        source: { runtime_snapshot: true },
        invocation_summary: {
          last_invoked_at: "2026-03-10T00:00:00.000Z",
          last_provider: "mirror.brain-chat",
          last_model: "gpt-4o-mini",
          last_outcome: "ok",
        },
        provider_env: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
        },
      }),
    );
    await getMirrorProviderStatus({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: providerFetchMock as unknown as typeof fetch,
    });
    expect(providerFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/mirror/provider/status",
      expect.objectContaining({ method: "GET" }),
    );

    const providerHealthFetchMock = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({
        provider: "brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: true,
        ok: true,
        invocation_summary: {
          last_invoked_at: "2026-03-10T00:00:00.000Z",
          last_provider: "mirror.brain-chat",
          last_model: "gpt-4o-mini",
          last_outcome: "ok",
        },
        source: { runtime_snapshot: true },
      }),
    );
    await getMirrorProviderHealth({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: providerHealthFetchMock as unknown as typeof fetch,
    });
    expect(providerHealthFetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/mirror/provider/health",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
