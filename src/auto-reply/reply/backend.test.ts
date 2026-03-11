import { describe, expect, it, vi } from "vitest";

const getReplyFromConfig = vi.hoisted(() => vi.fn());

vi.mock("../reply.js", () => ({
  getReplyFromConfig,
}));

describe("reply backend", () => {
  it("wraps a resolver without changing reply payload shape", async () => {
    const payload = { text: "hello", mediaUrls: ["https://example.com/a.png"] };
    const resolver = vi.fn(async () => payload);
    const { createReplyBackendFromResolver } = await import("./backend.js");

    const result = await createReplyBackendFromResolver(resolver).resolveReply({
      ctx: { Body: "hi" },
      replyOptions: { isHeartbeat: true },
      configOverride: { messages: {} },
    });

    expect(resolver).toHaveBeenCalledWith({ Body: "hi" }, { isHeartbeat: true }, { messages: {} });
    expect(result).toBe(payload);
  });

  it("default backend preserves getReplyFromConfig behavior", async () => {
    const payload = { text: "default-ok" };
    getReplyFromConfig.mockResolvedValueOnce(payload);
    const { defaultReplyBackend } = await import("./backend.js");

    const result = await defaultReplyBackend.resolveReply({
      ctx: { Body: "hi" },
      replyOptions: { timeoutOverrideSeconds: 12 },
      configOverride: { messages: {} },
    });

    expect(getReplyFromConfig).toHaveBeenCalledWith(
      { Body: "hi" },
      { timeoutOverrideSeconds: 12 },
      { messages: {} },
    );
    expect(result).toBe(payload);
  });
});
