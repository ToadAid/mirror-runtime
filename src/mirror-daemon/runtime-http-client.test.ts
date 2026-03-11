import { afterEach, describe, expect, it, vi } from "vitest";
import type { MirrorDaemonReplyRequest } from "./reply-backend-adapter.js";
import {
  HttpMirrorRuntimeClient,
  parseMirrorResponse,
  serializeMirrorRequest,
} from "./runtime-http-client.js";
import { MIRROR_EXECUTE_ENDPOINT } from "./runtime-http-contract.js";

function buildRequest(): MirrorDaemonReplyRequest {
  return {
    sessionKey: "agent:main:telegram:direct:42",
    agentId: "main",
    accountId: "telegram-main",
    surface: "telegram",
    text: "hello",
    commandText: "/help",
    flags: {
      commandAuthorized: true,
    },
  };
}

describe("runtime-http-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.MIRROR_RUNTIME_BASE_URL;
    delete process.env.MIRROR_RUNTIME_TOKEN;
    delete process.env.MIRROR_RUNTIME_TIMEOUT_MS;
    delete process.env.MIRROR_DAEMON_TOKEN;
    delete process.env.OPENCLAW_GATEWAY_PORT;
  });

  it("serializes MirrorDaemonReplyRequest to JSON", () => {
    expect(serializeMirrorRequest(buildRequest())).toBe(
      JSON.stringify({
        sessionKey: "agent:main:telegram:direct:42",
        agentId: "main",
        accountId: "telegram-main",
        surface: "telegram",
        text: "hello",
        commandText: "/help",
        flags: {
          commandAuthorized: true,
        },
      }),
    );
  });

  it("parses a ReplyPayload JSON response", async () => {
    const response = new Response(JSON.stringify({ text: "ok", isError: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(parseMirrorResponse(response)).resolves.toEqual({
      text: "ok",
      isError: false,
    });
  });

  it("invokes fetch with the serialized request and returns the parsed reply", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "transport-ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
      token: "secret-token",
    });

    const reply = await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer secret-token",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
    expect(reply).toEqual({ text: "transport-ok" });
  });

  it("adds the Authorization header from the explicit token option", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    process.env.MIRROR_RUNTIME_TOKEN = "env-runtime-token";
    process.env.MIRROR_DAEMON_TOKEN = "env-daemon-token";
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
      token: "explicit-token",
    });

    await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer explicit-token",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
  });

  it("adds the Authorization header from MIRROR_RUNTIME_TOKEN", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    process.env.MIRROR_RUNTIME_TOKEN = "env-runtime-token";
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer env-runtime-token",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
  });

  it("adds the Authorization header from MIRROR_DAEMON_TOKEN when MIRROR_RUNTIME_TOKEN is unset", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    process.env.MIRROR_DAEMON_TOKEN = "env-daemon-token";
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer env-daemon-token",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
  });

  it("leaves Authorization unset when no token source is available", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledWith("http://127.0.0.1:8787/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
  });

  it("uses the gateway default URL when MIRROR_RUNTIME_BASE_URL is unset", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "gateway-ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HttpMirrorRuntimeClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const reply = await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledWith(`http://127.0.0.1:18789${MIRROR_EXECUTE_ENDPOINT}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: serializeMirrorRequest(buildRequest()),
      signal: expect.any(AbortSignal),
    });
    expect(reply).toEqual({ text: "gateway-ok" });
  });

  it("uses the default lore-aware timeout when no override is configured", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.executeReply(buildRequest());

    const signal = fetchFn.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it("uses MIRROR_RUNTIME_TIMEOUT_MS when timeoutMs is not passed explicitly", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    process.env.MIRROR_RUNTIME_TIMEOUT_MS = "25000";

    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await client.executeReply(buildRequest());

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns the stub reply when the runtime returns no content", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new HttpMirrorRuntimeClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.executeReply(buildRequest())).resolves.toEqual({
      text: "[mirror-daemon stub reply]",
    });
  });

  it("throws on non-ok runtime responses", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "bad request" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    );
    const client = new HttpMirrorRuntimeClient({
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.executeReply(buildRequest())).rejects.toThrow(
      "Mirror runtime request failed: bad request",
    );
  });

  it("times out slow runtime requests", async () => {
    const fetchFn = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const client = new HttpMirrorRuntimeClient({
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 1,
    });

    await expect(client.executeReply(buildRequest())).rejects.toThrow(
      "Mirror runtime request timed out after 1ms (url=http://127.0.0.1:18789/mirror/execute)",
    );
  });

  it("includes timeout ms and URL when MIRROR_RUNTIME_TIMEOUT_MS triggers the timeout", async () => {
    const fetchFn = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    process.env.MIRROR_RUNTIME_TIMEOUT_MS = "2";

    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://127.0.0.1:8787",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(client.executeReply(buildRequest())).rejects.toThrow(
      "Mirror runtime request timed out after 2ms (url=http://127.0.0.1:8787/mirror/execute)",
    );
  });
});
