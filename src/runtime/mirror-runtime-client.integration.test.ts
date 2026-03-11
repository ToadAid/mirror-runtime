import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";
import { projectMirrorDaemonReplyRequest } from "../mirror-daemon/reply-backend-adapter.js";
import { HttpMirrorRuntimeClient } from "../mirror-daemon/runtime-http-client.js";
import { MIRROR_EXECUTE_ENDPOINT } from "../mirror-daemon/runtime-http-contract.js";
import { handleMirrorExecuteRequest } from "./mirror-execute.js";

function createInProcessFetch(params?: {
  executeMirrorReply?: Parameters<typeof handleMirrorExecuteRequest>[0]["executeMirrorReply"];
}) {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = rawBody.length > 0 ? JSON.parse(rawBody) : undefined;
    const result = await handleMirrorExecuteRequest({
      body,
      executeMirrorReply:
        params?.executeMirrorReply ??
        (async () => ({
          text: "[mirror-runtime stub response]",
        })),
    });
    return new Response(JSON.stringify(result.body), {
      status: result.statusCode,
      headers: {
        "content-type": "application/json",
      },
    });
  });
}

describe("Mirror runtime client integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("projects a normalized request and returns the stub runtime response", async () => {
    const fetchFn = createInProcessFetch();
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://mirror-runtime.test",
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const request = projectMirrorDaemonReplyRequest(
      finalizeInboundContext({
        Body: "fallback text",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:telegram:direct:42",
        AccountId: "telegram-main",
        Surface: "telegram",
        CommandAuthorized: true,
      }),
      { isHeartbeat: false },
      { agentId: "main" },
    );

    const reply = await client.executeReply(request);

    expect(fetchFn).toHaveBeenCalledWith("http://mirror-runtime.test/mirror/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: expect.any(AbortSignal),
    });
    expect(reply).toEqual({ text: "[mirror-runtime stub response]" });
  });

  it("preserves attachment projection across client and handler", async () => {
    let capturedRequest: unknown;
    const fetchFn = createInProcessFetch({
      executeMirrorReply: async (request) => {
        capturedRequest = request;
        return { text: "[mirror-runtime stub response]" };
      },
    });
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://mirror-runtime.test",
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const request = projectMirrorDaemonReplyRequest(
      finalizeInboundContext({
        Body: "history body",
        BodyForAgent: "voice note summary",
        BodyForCommands: "voice note summary",
        SessionKey: "agent:main:whatsapp:direct:+15550001111",
        Surface: "whatsapp",
        AccountId: "wa-main",
        MediaPaths: ["/tmp/audio.ogg", "/tmp/image.jpg"],
        MediaUrls: ["https://example.com/audio.ogg", "https://example.com/image.jpg"],
        MediaTypes: ["audio/ogg", "image/jpeg"],
        Transcript: "hello from voice note",
        CommandAuthorized: false,
      }),
      { isHeartbeat: true },
      { agentId: "main" },
    );

    const reply = await client.executeReply(request);

    expect(reply).toEqual({ text: "[mirror-runtime stub response]" });
    expect(capturedRequest).toEqual({
      sessionKey: "agent:main:whatsapp:direct:+15550001111",
      agentId: "main",
      accountId: "wa-main",
      surface: "whatsapp",
      text: "voice note summary",
      commandText: "voice note summary",
      attachments: [
        {
          path: "/tmp/audio.ogg",
          url: "https://example.com/audio.ogg",
          mediaType: "audio/ogg",
          transcript: "hello from voice note",
        },
        {
          path: "/tmp/image.jpg",
          url: "https://example.com/image.jpg",
          mediaType: "image/jpeg",
        },
      ],
      flags: {
        commandAuthorized: false,
        isHeartbeat: true,
      },
    });
  });

  it("preserves reply context projection across client and handler", async () => {
    let capturedRequest: unknown;
    const fetchFn = createInProcessFetch({
      executeMirrorReply: async (request) => {
        capturedRequest = request;
        return { text: "[mirror-runtime stub response]" };
      },
    });
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://mirror-runtime.test",
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const request = projectMirrorDaemonReplyRequest(
      finalizeInboundContext({
        Body: "fallback",
        BodyForAgent: "reply normalized text",
        BodyForCommands: "/reply",
        RawBody: "/reply",
        SessionKey: "agent:main:telegram:direct:99",
        Surface: "telegram",
        ReplyToIdFull: "reply-full-id",
        ReplyToBody: "quoted text",
        ReplyToSender: "alice",
        ReplyToIsQuote: true,
        CommandAuthorized: true,
      }),
      { isHeartbeat: false },
      { agentId: "main" },
    );

    const reply = await client.executeReply(request);

    expect(reply).toEqual({ text: "[mirror-runtime stub response]" });
    expect(capturedRequest).toEqual({
      sessionKey: "agent:main:telegram:direct:99",
      agentId: "main",
      surface: "telegram",
      text: "reply normalized text",
      rawText: "/reply",
      commandText: "/reply",
      replyTo: {
        id: "reply-full-id",
        body: "quoted text",
        sender: "alice",
        isQuote: true,
      },
      flags: {
        commandAuthorized: true,
        isHeartbeat: false,
      },
    });
  });

  it("maps server errors through the HTTP client", async () => {
    const fetchFn = createInProcessFetch({
      executeMirrorReply: async () => {
        throw new Error("mirror execute boom");
      },
    });
    const client = new HttpMirrorRuntimeClient({
      baseUrl: "http://mirror-runtime.test",
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const request = projectMirrorDaemonReplyRequest(
      finalizeInboundContext({
        Body: "fallback text",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:telegram:direct:42",
        Surface: "telegram",
        CommandAuthorized: true,
      }),
      undefined,
      { agentId: "main" },
    );

    await expect(client.executeReply(request)).rejects.toThrow(
      "Mirror runtime request failed: Error: mirror execute boom",
    );
  });

  it("times out when the in-process transport does not respond", async () => {
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
      baseUrl: "http://mirror-runtime.test",
      endpointPath: MIRROR_EXECUTE_ENDPOINT,
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 1,
    });
    const request = projectMirrorDaemonReplyRequest(
      finalizeInboundContext({
        Body: "fallback text",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:telegram:direct:42",
        Surface: "telegram",
        CommandAuthorized: true,
      }),
      undefined,
      { agentId: "main" },
    );

    await expect(client.executeReply(request)).rejects.toThrow("Mirror runtime request timed out");
  });
});
