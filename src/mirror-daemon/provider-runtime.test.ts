import { describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";
import { createMirrorDaemonProviderRuntime } from "./provider-runtime.js";

describe("mirror daemon provider runtime", () => {
  it("resolves provider config with alias normalization metadata", () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "mirror.brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: undefined,
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    expect(runtime.resolveProviderConfig()).toEqual({
      provider: "brain-chat",
      model: "gpt-4o-mini",
      aliasNormalizedFrom: "mirror.brain-chat",
    });
  });

  it("uses configured auth token without credential resolution calls", async () => {
    const resolver = vi.fn(async () => ({ apiKey: "should-not-be-used" }));
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: "configured-token",
      resolveProviderCredentials: resolver,
    });

    const result = await runtime.resolveCredentialResolution(runtime.resolveProviderConfig());
    expect(result).toEqual({
      authToken: "configured-token",
      evidence: {
        effective_provider: "brain-chat",
        effective_model: "gpt-4o-mini",
        auth_source: "configured_token",
        credential_resolution_attempted: false,
      },
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("uses resolver path when auth token is not configured", async () => {
    const resolver = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: undefined,
      resolveProviderCredentials: resolver,
    });

    const result = await runtime.resolveCredentialResolution(runtime.resolveProviderConfig());
    expect(result).toEqual({
      authToken: "resolved-token",
      evidence: {
        effective_provider: "brain-chat",
        effective_model: "gpt-4o-mini",
        auth_source: "resolved_credentials",
        credential_resolution_attempted: true,
        credential_resolution_ok: true,
      },
    });
    expect(resolver).toHaveBeenCalledWith({ provider: "brain-chat" });
  });

  it("returns sanitized missing-credential evidence when resolver fails", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: undefined,
      resolveProviderCredentials: async () => {
        throw new Error("sensitive resolver stack");
      },
    });

    const result = await runtime.resolveCredentialResolution(runtime.resolveProviderConfig());
    expect(result).toEqual({
      evidence: {
        effective_provider: "brain-chat",
        effective_model: "gpt-4o-mini",
        auth_source: "none",
        credential_resolution_attempted: true,
        credential_resolution_ok: false,
        last_error: "provider credentials unavailable",
      },
    });
  });

  it("returns provider status with invocation summary and credential evidence", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: "configured-token",
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });
    runtime.recordInvocationSuccess({ provider: "mirror.brain-chat", model: "gpt-4o-mini" });

    await expect(
      runtime.getProviderStatus({
        runtimeSnapshot: true,
      }),
    ).resolves.toMatchObject({
      provider: "brain-chat",
      default_model: "gpt-4o-mini",
      source: {
        runtime_snapshot: true,
      },
      provider_env: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      adapter: "brain-chat",
      invocation_summary: {
        last_provider: "mirror.brain-chat",
        last_model: "gpt-4o-mini",
        last_outcome: "ok",
      },
      recent_invocations: [
        {
          provider: "mirror.brain-chat",
          model: "gpt-4o-mini",
          outcome: "ok",
        },
      ],
      evidence: {
        auth_source: "configured_token",
        credential_resolution_attempted: false,
      },
    });
  });

  it("returns an operator snapshot with normalized provider evidence", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "mirror.brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: undefined,
      resolveProviderCredentials: async () => ({ apiKey: "resolved-token" }),
    });
    runtime.recordInvocationFailure({
      provider: "mirror.brain-chat",
      model: "gpt-4o-mini",
      error: "Bearer secret-token exploded",
    });

    await expect(runtime.getOperatorSnapshot()).resolves.toEqual({
      effective_provider: "brain-chat",
      effective_model: "gpt-4o-mini",
      alias_normalized_from: "mirror.brain-chat",
      auth_source: "resolved_credentials",
      credential_resolution_attempted: true,
      credential_resolution_ok: true,
      invocation_summary: {
        last_invoked_at: expect.any(String),
        last_provider: "mirror.brain-chat",
        last_model: "gpt-4o-mini",
        last_outcome: "error",
        last_error: "Bearer [redacted] exploded",
      },
      recent_invocations: [
        {
          invoked_at: expect.any(String),
          provider: "mirror.brain-chat",
          model: "gpt-4o-mini",
          outcome: "error",
          error: "Bearer [redacted] exploded",
        },
      ],
    });
  });

  it("builds provider status from the operator snapshot accessor", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: "configured-token",
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });
    const getOperatorSnapshot = vi.spyOn(runtime, "getOperatorSnapshot");

    await runtime.getProviderStatus({
      runtimeSnapshot: true,
    });

    expect(getOperatorSnapshot).toHaveBeenCalledTimes(1);
    expect(getOperatorSnapshot).toHaveBeenCalledWith();
  });

  it("tracks recent invocation entries in bounded newest-first order", () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: "configured-token",
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    for (let index = 0; index < 12; index += 1) {
      if (index % 2 === 0) {
        runtime.recordInvocationSuccess({
          provider: `mirror.brain-chat-${index}`,
          model: `model-${index}`,
        });
        continue;
      }
      runtime.recordInvocationFailure({
        provider: `mirror.brain-chat-${index}`,
        model: `model-${index}`,
        error: `Bearer secret-${index} exploded`,
      });
    }

    const recent = runtime.getRecentInvocations();
    expect(recent).toHaveLength(10);
    expect(recent[0]).toMatchObject({
      provider: "mirror.brain-chat-11",
      model: "model-11",
      outcome: "error",
      error: "Bearer [redacted] exploded",
    });
    expect(recent[9]).toMatchObject({
      provider: "mirror.brain-chat-2",
      model: "model-2",
      outcome: "ok",
    });
    expect(JSON.stringify(recent)).not.toContain("secret-11");
  });

  it("returns sanitized provider health failure evidence", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: "secret-token",
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });
    runtime.resolveCredentialResolution = vi.fn(async (config) => ({
      authToken: "secret-token",
      evidence: {
        effective_provider: config.provider,
        effective_model: config.model,
        auth_source: "configured_token",
        credential_resolution_attempted: false,
      },
    }));
    runtime.resolveCredentials = vi.fn(async () => ({ apiKey: "unused" }));
    runtime.providerEnv = {
      MIRROR_PROVIDER: "broken-provider",
      MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
    };

    await expect(
      runtime.probeProviderHealth({
        runtimeSnapshot: false,
      }),
    ).resolves.toSatisfy((result) => {
      expect(result).toMatchObject({
        provider: "brain-chat",
        model: "gpt-4o-mini",
        configured: true,
        reachable: false,
        ok: false,
        source: {
          runtime_snapshot: false,
        },
        recent_invocations: [
          {
            provider: "mirror.brain-chat",
            model: "gpt-4o-mini",
            outcome: "error",
          },
        ],
        evidence: {
          effective_provider: "brain-chat",
          effective_model: "gpt-4o-mini",
          auth_source: "configured_token",
          credential_resolution_attempted: false,
        },
      });
      expect(result.error).toBeTruthy();
      expect(result.error).not.toContain("secret-token");
      return true;
    });
  });

  it("builds provider health from the operator snapshot accessor for preflight failures", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      authToken: undefined,
      resolveProviderCredentials: async () => {
        throw new Error("hidden resolver details");
      },
    });
    const getOperatorSnapshot = vi.spyOn(runtime, "getOperatorSnapshot");

    await expect(
      runtime.probeProviderHealth({
        runtimeSnapshot: true,
      }),
    ).resolves.toMatchObject({
      configured: false,
      reachable: false,
      ok: false,
      error: "provider transport is not configured",
      evidence: {
        auth_source: "none",
        credential_resolution_attempted: true,
        credential_resolution_ok: false,
        last_error: "provider credentials unavailable",
      },
    });

    expect(getOperatorSnapshot).toHaveBeenCalledTimes(1);
    expect(getOperatorSnapshot).toHaveBeenCalledWith();
  });

  it("executes brain chat through the runtime and records invocation summary", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "brain-token",
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    const result = await runtime.executeBrainChat({
      request: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
      },
      transport: async () => ({
        id: "chat-runtime",
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected runtime brain chat success");
    }
    expect(result.response.choices[0]?.message.content).toBe("pong");
    expect(runtime.getInvocationSummary()).toMatchObject({
      last_provider: "mirror.brain-chat",
      last_model: "gpt-4o-mini",
      last_outcome: "ok",
    });
  });

  it("returns sanitized runtime brain chat config failures", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      brainUrl: undefined,
      authToken: "brain-token",
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    const result = await runtime.executeBrainChat({
      request: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "E_BRAIN_URL_NOT_CONFIGURED",
        message:
          "brainUrl not configured; set MIRROR_BRAIN_URL, .mirror/config.json brain.url, or --brain-url",
        provider: "mirror.brain-chat",
      },
    });
    expect(runtime.getInvocationSummary()).toMatchObject({
      last_provider: "mirror.brain-chat",
      last_model: "gpt-4o-mini",
      last_outcome: "error",
      last_error:
        "brainUrl not configured; set MIRROR_BRAIN_URL, .mirror/config.json brain.url, or --brain-url",
    });
  });

  it("defaults to bridge mode when MIRROR_PROVIDER_MODE is unset", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "brain-token",
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    const result = await runtime.executeBrainChat({
      request: {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "ping" }],
      },
      transport: async () => ({
        id: "chat-runtime",
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected bridge mode success");
    }
    expect(result.completion.provider).toBe("mirror.brain-chat");
  });

  it("uses direct mode for OpenAI-compatible upstream calls", async () => {
    const runtimeEnv = createNonExitingRuntime();
    runtimeEnv.log = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "chat-direct",
        object: "chat.completion",
        created: 1,
        model: "direct-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "direct pong" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 7,
          total_tokens: 12,
        },
      }),
    } as unknown as Response);

    try {
      const runtime = createMirrorDaemonProviderRuntime({
        env: runtimeEnv,
        providerEnv: {
          MIRROR_PROVIDER_MODE: "direct",
          MIRROR_PROVIDER_KIND: "openai_compat",
          MIRROR_PROVIDER_BASE_URL: "http://127.0.0.1:1234",
          MIRROR_PROVIDER_CHAT_PATH: "/v1/chat/completions",
          MIRROR_PROVIDER_API_KEY: "direct-key",
          MIRROR_PROVIDER_MODEL: "direct-model",
        },
        resolveProviderCredentials: async () => ({ apiKey: "unused" }),
      });

      const result = await runtime.executeBrainChat({
        request: {
          model: "ignored-model",
          messages: [{ role: "user", content: "ping" }],
          temperature: 0.1,
          max_tokens: 20,
        },
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:1234/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("expected direct mode success");
      }
      expect(result.completion.provider).toBe("mirror.direct.openai_compat");
      expect(result.completion.text).toBe("direct pong");
      expect(result.response.model).toBe("direct-model");
      expect(runtimeEnv.log).toHaveBeenCalledWith("[mirror-provider] mode=direct");
      expect(runtime.getInvocationSummary()).toMatchObject({
        last_provider: "mirror.direct.openai_compat",
        last_model: "direct-model",
        last_outcome: "ok",
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns a direct-mode config error when MIRROR_PROVIDER_BASE_URL is missing", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      providerEnv: {
        MIRROR_PROVIDER_MODE: "direct",
        MIRROR_PROVIDER_KIND: "openai_compat",
        MIRROR_PROVIDER_API_KEY: "direct-key",
        MIRROR_PROVIDER_MODEL: "direct-model",
      },
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    const result = await runtime.executeBrainChat({
      request: {
        model: "direct-model",
        messages: [{ role: "user", content: "ping" }],
      },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "E_PROVIDER_NOT_CONFIGURED",
        message: "direct provider base URL not configured; set MIRROR_PROVIDER_BASE_URL",
        provider: "mirror.direct.openai_compat",
      },
    });
  });

  it("summarizes a run through the runtime and records invocation summary", async () => {
    const runtime = createMirrorDaemonProviderRuntime({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "brain-token",
      providerEnv: {
        MIRROR_PROVIDER: "brain-chat",
        MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
      },
      resolveProviderCredentials: async () => ({ apiKey: "unused" }),
    });

    const result = await runtime.summarizeRunViaProvider({
      summary: { trace_id: "run-1", status: "completed" },
      events: [],
      transport: async () => ({
        id: "run-summary-runtime",
        object: "chat.completion",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Completed without errors." },
            finish_reason: "stop",
          },
        ],
      }),
    });

    expect(result).toEqual({
      ok: true,
      text: "Completed without errors.",
      provider: "mirror.brain-chat",
      model: "gpt-4o-mini",
    });
    expect(runtime.getInvocationSummary()).toMatchObject({
      last_provider: "mirror.brain-chat",
      last_model: "gpt-4o-mini",
      last_outcome: "ok",
    });
  });
});
