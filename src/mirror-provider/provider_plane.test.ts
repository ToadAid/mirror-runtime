import { describe, expect, it, vi } from "vitest";
import { parseRequestBodyJson } from "../test/request_init.js";
import { buildPrimaryProviderDescriptorFromConfig, createMirrorProviderPlane } from "./index.js";

describe("mirror provider plane", () => {
  it("builds a primary provider descriptor from service config", () => {
    const descriptor = buildPrimaryProviderDescriptorFromConfig({
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    expect(descriptor.provider_id).toBe("primary");
    expect(descriptor.label).toBe("Primary Provider");
    expect(descriptor.kind).toBe("openai_compatible");
  });

  it("tracks provider readiness and active selection", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBodyJson<{ model: string }>(init);
      expect(body.model).toBe("test-model");
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
    const plane = createMirrorProviderPlane([
      {
        provider_id: "primary",
        label: "Primary",
        kind: "openai_compatible",
        url: "http://brain.local/v1/chat/completions",
        authToken: "token",
      },
    ]);

    const execution = await plane.execute(
      {
        model: "test-model",
        messages: [{ role: "system", content: "Mirror canon context:" }],
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      },
      { fetchImpl },
    );

    expect(execution.provider.provider_id).toBe("primary");
    expect(execution.selection.attempted_provider_ids).toEqual(["primary"]);
    expect(plane.getActiveProvider()?.ready).toBe(true);
    expect(plane.getActiveProvider()?.selected).toBe(true);
  });

  it("falls back to the next configured provider when allowed", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("primary")) {
        throw new Error("primary down");
      }
      return {
        ok: true,
        json: async () => ({
          id: "resp_2",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "fallback ok" },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    });
    const plane = createMirrorProviderPlane([
      {
        provider_id: "primary",
        label: "Primary",
        kind: "openai_compatible",
        url: "http://primary.local/v1/chat/completions",
        authToken: "token-a",
        priority: 100,
      },
      {
        provider_id: "secondary",
        label: "Secondary",
        kind: "openai_compatible",
        url: "http://secondary.local/v1/chat/completions",
        authToken: "token-b",
        priority: 90,
      },
    ]);

    const execution = await plane.execute(
      {
        model: "test-model",
        messages: [{ role: "system", content: "Mirror canon context:" }],
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      },
      { fetchImpl },
    );

    expect(execution.provider.provider_id).toBe("secondary");
    expect(execution.selection.attempted_provider_ids).toEqual(["primary", "secondary"]);
    expect(execution.selection.fallback_used).toBe(true);
    expect(plane.getProvider("primary")?.last_error).toContain("primary down");
  });
});
