import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultReplyBackend } from "../auto-reply/reply/backend.js";
import { finalizeInboundContext } from "../auto-reply/reply/inbound-context.js";
import { handleMirrorExecuteRequest } from "../runtime/mirror-execute.js";
import {
  createConfiguredReplyBackend,
  inferMirrorDaemonReplyRouteMeta,
  isMirrorRuntimeEnabled,
} from "./backend-selection.js";
import { MirrorDaemonReplyBackend } from "./reply-backend.js";
import { MIRROR_EXECUTE_ENDPOINT } from "./runtime-http-contract.js";

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

describe("mirror runtime backend selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the default backend when MIRROR_RUNTIME_ENABLED is absent", async () => {
    const fetchFn = createInProcessFetch();
    const backend = createConfiguredReplyBackend({
      env: {},
      routeMeta: { agentId: "main", surface: "telegram" },
      runtimeClientOptions: {
        baseUrl: "http://mirror-runtime.test",
        fetchFn: fetchFn as unknown as typeof fetch,
      },
    });

    expect(isMirrorRuntimeEnabled({})).toBe(false);
    expect(backend).toBe(defaultReplyBackend);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("uses MirrorDaemonReplyBackend when MIRROR_RUNTIME_ENABLED=1", () => {
    const backend = createConfiguredReplyBackend({
      env: { MIRROR_RUNTIME_ENABLED: "1" },
      routeMeta: inferMirrorDaemonReplyRouteMeta({
        SessionKey: "agent:main:telegram:direct:42",
        Surface: "telegram",
      }),
    });

    expect(isMirrorRuntimeEnabled({ MIRROR_RUNTIME_ENABLED: "1" })).toBe(true);
    expect(backend).toBeInstanceOf(MirrorDaemonReplyBackend);
  });

  it("invokes the runtime client only when enabled", async () => {
    const fetchFn = createInProcessFetch();
    const backend = createConfiguredReplyBackend({
      env: { MIRROR_RUNTIME_ENABLED: "1" },
      routeMeta: { agentId: "main", surface: "telegram" },
      runtimeClientOptions: {
        baseUrl: "http://mirror-runtime.test",
        fetchFn: fetchFn as unknown as typeof fetch,
      },
    });

    const reply = await backend.resolveReply({
      ctx: finalizeInboundContext({
        Body: "fallback text",
        BodyForAgent: "normalized text",
        SessionKey: "agent:main:telegram:direct:42",
        Surface: "telegram",
        CommandAuthorized: true,
      }),
      replyOptions: { isHeartbeat: false },
    });

    expect(reply).toEqual({ text: "[mirror-runtime stub response]" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`http://mirror-runtime.test${MIRROR_EXECUTE_ENDPOINT}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sessionKey: "agent:main:telegram:direct:42",
        agentId: "main",
        surface: "telegram",
        text: "normalized text",
        commandText: "fallback text",
        flags: {
          commandAuthorized: true,
          isHeartbeat: false,
        },
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it("infers route meta from an agent session key", () => {
    expect(
      inferMirrorDaemonReplyRouteMeta({
        SessionKey: "agent:main:telegram:direct:42",
        AccountId: "telegram-main",
        Surface: "telegram",
      }),
    ).toEqual({
      agentId: "main",
      accountId: "telegram-main",
      surface: "telegram",
    });
  });
});
