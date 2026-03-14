import { describe, expect, it, vi } from "vitest";
import { parseRequestBodyJson } from "../test/request_init.js";
import { executeMirrorProviderRequest, type FetchLike } from "./mirror_provider.js";
import { buildMirrorProviderHeaders } from "./provider_auth.js";

describe("mirror provider runtime", () => {
  it("builds provider auth headers correctly", () => {
    const headers = buildMirrorProviderHeaders({
      url: "http://brain.local/v1/chat/completions",
      authToken: "token",
    });

    expect(headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token",
    });
  });

  it("executes a normalized provider request and returns a normalized response", async () => {
    const fetchImpl: FetchLike = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        model: string;
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.model).toBe("test-model");
      expect(body.messages[0]?.content).toBe("Mirror canon context:");
      expect(init?.headers).toEqual({
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      });

      return {
        ok: true,
        json: async () => ({
          id: "resp_1",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    });
    const onRuntimeEvent = vi.fn();

    const response = await executeMirrorProviderRequest(
      {
        model: "test-model",
        messages: [{ role: "system", content: "Mirror canon context:" }],
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      },
      {
        url: "http://brain.local/v1/chat/completions",
        authToken: "token",
      },
      {
        fetchImpl,
        onRuntimeEvent,
        correlation: {
          trace_id: "trace-1",
          session_id: "session-1",
          action_id: "action-1",
          provider_id: "primary",
        },
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("ok");
    expect(onRuntimeEvent).toHaveBeenCalledWith(
      "provider.call.started",
      expect.objectContaining({
        trace_id: "trace-1",
        session_id: "session-1",
        action_id: "action-1",
        provider_id: "primary",
        url: "http://brain.local/v1/chat/completions",
        model: "test-model",
      }),
    );
    expect(onRuntimeEvent).toHaveBeenCalledWith(
      "provider.call.finished",
      expect.objectContaining({
        trace_id: "trace-1",
        session_id: "session-1",
        action_id: "action-1",
        provider_id: "primary",
        url: "http://brain.local/v1/chat/completions",
        model: "test-model",
      }),
    );
  });
});
