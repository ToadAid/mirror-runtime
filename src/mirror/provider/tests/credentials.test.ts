import { describe, expect, it } from "vitest";
import { resolveMirrorProviderCredentials } from "../credentials.js";

describe("mirror provider credentials adapter", () => {
  it("resolves provider credentials through auth resolver", async () => {
    const resolved = await resolveMirrorProviderCredentials({
      provider: "mirror.brain-chat",
      resolver: async () => ({
        apiKey: "token-123",
        source: "profile:brain:default",
        mode: "token",
        profileId: "brain:default",
      }),
    });

    expect(resolved).toEqual({
      provider: "brain-chat",
      apiKey: "token-123",
      source: "profile:brain:default",
      mode: "token",
      profileId: "brain:default",
    });
  });

  it("returns normalized error when resolver has no usable API key", async () => {
    await expect(
      resolveMirrorProviderCredentials({
        provider: "brain-chat",
        resolver: async () => ({
          source: "aws-sdk default chain",
          mode: "aws-sdk",
        }),
      }),
    ).rejects.toMatchObject({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
    });
  });

  it("returns normalized error when resolver throws", async () => {
    await expect(
      resolveMirrorProviderCredentials({
        provider: "brain-chat",
        resolver: async () => {
          throw new Error("missing profile details");
        },
      }),
    ).rejects.toMatchObject({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
    });
  });
});
