import { describe, expect, it, vi } from "vitest";
import {
  MirrorProviderException,
  createMirrorProvider,
  normalizeMirrorProviderError,
  runMirrorProviderCompletion,
} from "../index.js";

describe("mirror provider v0", () => {
  it("initializes a provider and exposes metadata name", async () => {
    const provider = createMirrorProvider({
      name: "mirror.mock",
      defaultModel: "mock-1",
      adapter: {
        complete: async () => ({ text: "ok" }),
      },
    });

    expect(provider.name).toBe("mirror.mock");
    const completion = await provider.complete({ prompt: "hello" });
    expect(completion.provider).toBe("mirror.mock");
    expect(completion.model).toBe("mock-1");
  });

  it("normalizes successful completion shape from adapter", async () => {
    const provider = createMirrorProvider({
      name: "mirror.mock",
      defaultModel: "default-model",
      adapter: {
        complete: vi.fn(async () => ({
          text: "answer",
          model: "adapter-model",
          usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
          raw: { id: "resp-1" },
        })),
      },
    });

    const completion = await runMirrorProviderCompletion(provider, { prompt: "Q" });
    expect(completion).toEqual({
      text: "answer",
      provider: "mirror.mock",
      model: "adapter-model",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
      raw: { id: "resp-1" },
    });
  });

  it("uses options model when adapter omits model", async () => {
    const provider = createMirrorProvider({
      name: "mirror.mock",
      defaultModel: "default-model",
      adapter: {
        complete: async () => ({
          text: "answer",
        }),
      },
    });

    const completion = await provider.complete({ prompt: "Q" }, { model: "override-model" });
    expect(completion.model).toBe("override-model");
  });

  it("normalizes adapter errors into MirrorProviderException", async () => {
    const provider = createMirrorProvider({
      name: "mirror.mock",
      defaultModel: "default-model",
      adapter: {
        complete: async () => {
          const error = new Error("provider timeout") as Error & {
            code?: string;
            retryable?: boolean;
          };
          error.code = "E_TIMEOUT";
          error.retryable = true;
          throw error;
        },
      },
    });

    await expect(provider.complete({ prompt: "Q" })).rejects.toMatchObject({
      code: "E_TIMEOUT",
      message: "provider timeout",
      retryable: true,
      provider: "mirror.mock",
    });
  });

  it("rejects invalid response text shape", async () => {
    const provider = createMirrorProvider({
      name: "mirror.mock",
      defaultModel: "default-model",
      adapter: {
        complete: async () =>
          ({
            text: 123,
          }) as unknown as { text: string },
      },
    });

    await expect(provider.complete({ prompt: "Q" })).rejects.toBeInstanceOf(
      MirrorProviderException,
    );
    await expect(provider.complete({ prompt: "Q" })).rejects.toMatchObject({
      code: "E_PROVIDER_INVALID_RESPONSE",
      provider: "mirror.mock",
    });
  });

  it("normalizes non-Error thrown values", () => {
    const normalized = normalizeMirrorProviderError("offline", "mirror.mock");
    expect(normalized).toEqual({
      code: "E_PROVIDER",
      message: "offline",
      provider: "mirror.mock",
    });
  });
});
