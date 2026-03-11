import { describe, expect, it, vi } from "vitest";
import { runOpenAIChatCompletion } from "./provider-direct-openai.js";

describe("provider-direct-openai", () => {
  it("posts an OpenAI-compatible chat completion request", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "chat-1",
        object: "chat.completion",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "pong" },
            finish_reason: "stop",
          },
        ],
      }),
    }));

    const result = await runOpenAIChatCompletion({
      baseUrl: "http://127.0.0.1:1234/",
      chatPath: "v1/chat/completions",
      apiKey: "secret",
      timeoutMs: 1_000,
      fetchFn: fetchFn as unknown as typeof fetch,
      request: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
        temperature: 0.2,
        max_tokens: 32,
      },
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: "Bearer secret",
        },
      }),
    );
    expect(result.response.choices[0]?.message.content).toBe("pong");
    expect(result.endpoint).toBe("http://127.0.0.1:1234/v1/chat/completions");
  });

  it("surfaces upstream error messages", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        error: {
          message: "bad key",
        },
      }),
    }));

    await expect(
      runOpenAIChatCompletion({
        baseUrl: "http://127.0.0.1:1234",
        chatPath: "/v1/chat/completions",
        apiKey: "secret",
        timeoutMs: 1_000,
        fetchFn: fetchFn as unknown as typeof fetch,
        request: {
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "ping" }],
        },
      }),
    ).rejects.toThrow("bad key");
  });
});
