import { describe, expect, it, vi } from "vitest";
import {
  MirrorDaemonClientError,
  consultOcean,
  getPondManifest,
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
});
