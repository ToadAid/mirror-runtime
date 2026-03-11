import { describe, expect, it, vi } from "vitest";
import { createConfiguredMirrorProvider, resolveMirrorProviderConfig } from "../config.js";

describe("mirror provider config v0", () => {
  it("resolves default provider and fallback model", () => {
    const config = resolveMirrorProviderConfig({}, "fallback-model");
    expect(config).toEqual({
      provider: "brain-chat",
      model: "fallback-model",
    });
  });

  it("resolves MIRROR_PROVIDER and MIRROR_PROVIDER_MODEL", () => {
    const config = resolveMirrorProviderConfig({
      MIRROR_PROVIDER: "mirror.brain-chat",
      MIRROR_PROVIDER_MODEL: "brain-model-1",
    });
    expect(config).toEqual({
      provider: "brain-chat",
      model: "brain-model-1",
    });
  });

  it("throws normalized config error for unsupported provider", () => {
    expect(() =>
      resolveMirrorProviderConfig({
        MIRROR_PROVIDER: "unsupported-provider",
      }),
    ).toThrow(/unsupported MIRROR_PROVIDER/);
    try {
      resolveMirrorProviderConfig({
        MIRROR_PROVIDER: "unsupported-provider",
      });
    } catch (error) {
      const withCode = error as Error & { code?: string };
      expect(withCode.code).toBe("E_PROVIDER_CONFIG");
    }
  });

  it("creates a configured provider instance", async () => {
    const provider = createConfiguredMirrorProvider({
      env: { MIRROR_PROVIDER_MODEL: "brain-model-2" },
      fallbackModel: "fallback-model",
      brainChatTransport: vi.fn(async () => ({
        id: "chat-1",
        object: "chat.completion",
        created: 1,
        model: "brain-model-2",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
      })),
    });

    const completion = await provider.complete({ prompt: "hello" });
    expect(completion.provider).toBe("mirror.brain-chat");
    expect(completion.model).toBe("brain-model-2");
  });
});
