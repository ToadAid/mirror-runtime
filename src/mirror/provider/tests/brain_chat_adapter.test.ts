import { describe, expect, it, vi } from "vitest";
import { createMirrorBrainChatProvider } from "../brain_chat_adapter.js";

describe("mirror brain chat adapter", () => {
  it("wires a concrete transport and normalizes completion", async () => {
    const transport = vi.fn(async () => ({
      id: "chat-1",
      object: "chat.completion",
      created: 1,
      model: "brain-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: "hello from brain" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
      },
    }));

    const provider = createMirrorBrainChatProvider({
      defaultModel: "brain-model",
      transport,
    });

    const completion = await provider.complete(
      {
        prompt: "hello",
        messages: [{ role: "user", content: "hello" }],
      },
      { temperature: 0.2, maxTokens: 32 },
    );

    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
        temperature: 0.2,
        max_tokens: 32,
        stream: false,
      }),
    );
    expect(completion.text).toBe("hello from brain");
    expect(completion.provider).toBe("mirror.brain-chat");
    expect(completion.model).toBe("brain-model");
    expect(completion.usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5 });
  });
});
