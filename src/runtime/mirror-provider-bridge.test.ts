import { describe, expect, it, vi } from "vitest";
import { createMirrorDaemonProviderRuntime } from "../mirror-daemon/provider-runtime.js";
import { createNonExitingRuntime } from "../runtime.js";
import {
  completeBrainChatViaMirrorProvider,
  summarizeMirrorRunViaProvider,
} from "./mirror-provider-bridge.js";

function createInvocationRecorder() {
  return createMirrorDaemonProviderRuntime({
    providerEnv: {
      MIRROR_PROVIDER: "brain-chat",
      MIRROR_PROVIDER_MODEL: "gpt-4o-mini",
    },
    resolveProviderCredentials: async () => ({ apiKey: "unused-test-token" }),
  });
}

describe("mirror provider bridge", () => {
  it("uses daemon-level provider config model for run summary path", async () => {
    const priorProvider = process.env.MIRROR_PROVIDER;
    const priorModel = process.env.MIRROR_PROVIDER_MODEL;
    process.env.MIRROR_PROVIDER = "brain-chat";
    process.env.MIRROR_PROVIDER_MODEL = "configured-model";

    const transport = vi.fn(async () => ({
      id: "chat-0",
      object: "chat.completion",
      created: 1,
      model: "configured-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "summary-configured" },
          finish_reason: "stop",
        },
      ],
    }));

    try {
      const result = await summarizeMirrorRunViaProvider({
        env: createNonExitingRuntime(),
        brainUrl: "http://brain.local/chat",
        authToken: "token",
        summary: { trace_id: "run-1" },
        events: [],
        transport,
      });
      expect(result.ok).toBe(true);
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({ model: "configured-model" }),
      );
    } finally {
      if (priorProvider === undefined) {
        delete process.env.MIRROR_PROVIDER;
      } else {
        process.env.MIRROR_PROVIDER = priorProvider;
      }
      if (priorModel === undefined) {
        delete process.env.MIRROR_PROVIDER_MODEL;
      } else {
        process.env.MIRROR_PROVIDER_MODEL = priorModel;
      }
    }
  });

  it("calls provider abstraction successfully and returns raw response", async () => {
    const invocationRecorder = createInvocationRecorder();
    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "token",
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      transport: vi.fn(async () => ({
        id: "chat-1",
        object: "chat.completion",
        created: 1,
        model: "brain-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "ok" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      })),
      invocationRecorder,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected successful bridge result");
    }
    expect(result.completion.text).toBe("ok");
    expect(result.completion.provider).toBe("mirror.brain-chat");
    expect(result.response.choices[0]?.message.content).toBe("ok");
    expect(invocationRecorder.getInvocationSummary()).toMatchObject({
      last_provider: "mirror.brain-chat",
      last_model: "brain-model",
      last_outcome: "ok",
    });
  });

  it("uses explicit providerEnv over ambient process env", async () => {
    const priorProviderModel = process.env.MIRROR_PROVIDER_MODEL;
    process.env.MIRROR_PROVIDER_MODEL = "ambient-model";
    const transport = vi.fn(async () => ({
      id: "chat-3",
      object: "chat.completion",
      created: 1,
      model: "layered-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
    }));

    try {
      const result = await completeBrainChatViaMirrorProvider({
        env: createNonExitingRuntime(),
        brainUrl: "http://brain.local/chat",
        authToken: "token",
        providerEnv: {
          MIRROR_PROVIDER: "brain-chat",
          MIRROR_PROVIDER_MODEL: "layered-model",
        },
        request: {
          messages: [{ role: "user", content: "hello" }],
        },
        transport,
      });
      expect(result.ok).toBe(true);
      expect(transport).toHaveBeenCalledWith(expect.objectContaining({ model: "layered-model" }));
    } finally {
      if (priorProviderModel === undefined) {
        delete process.env.MIRROR_PROVIDER_MODEL;
      } else {
        process.env.MIRROR_PROVIDER_MODEL = priorProviderModel;
      }
    }
  });

  it("normalizes provider alias and model from providerEnv for brain-chat credential fallback", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-alias",
      object: "chat.completion",
      created: 1,
      model: "alias-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok-alias" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      providerEnv: {
        MIRROR_PROVIDER: "mirror.brain-chat",
        MIRROR_PROVIDER_MODEL: "alias-model",
      },
      request: {
        messages: [{ role: "user", content: "hello" }],
      },
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).toHaveBeenCalledWith({ provider: "brain-chat" });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ model: "alias-model" }));
  });

  it("returns normalized provider error shape on failure", async () => {
    const invocationRecorder = createInvocationRecorder();
    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "token",
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      transport: vi.fn(async () => {
        const error = new Error("upstream timeout") as Error & {
          code?: string;
          retryable?: boolean;
        };
        error.code = "E_TIMEOUT";
        error.retryable = true;
        throw error;
      }),
      invocationRecorder,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected failed bridge result");
    }
    expect(result.error).toEqual({
      code: "E_TIMEOUT",
      message: "upstream timeout",
      retryable: true,
      provider: "mirror.brain-chat",
    });
    expect(invocationRecorder.getInvocationSummary()).toMatchObject({
      last_provider: "brain-chat",
      last_model: "brain-model",
      last_outcome: "error",
      last_error: "upstream timeout",
    });
  });

  it("uses credential resolver seam when brain-chat auth token is missing", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-fallback",
      object: "chat.completion",
      created: 1,
      model: "brain-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok-fallback" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).toHaveBeenCalledWith({ provider: "brain-chat" });
    if (!result.ok) {
      throw new Error("expected successful fallback bridge result");
    }
    expect(result.response.choices[0]?.message.content).toBe("ok-fallback");
  });

  it("bypasses credential resolver when brain-chat auth token already exists", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-bypass",
      object: "chat.completion",
      created: 1,
      model: "brain-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "ok-direct-token" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "provided-token",
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).not.toHaveBeenCalled();
  });

  it("returns normalized credential error when brain-chat resolver fails", async () => {
    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      resolveCredentials: async () => {
        const error = new Error("missing auth profile") as Error & { code?: string };
        error.code = "E_PROVIDER_CREDENTIALS";
        throw error;
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected credential resolver failure");
    }
    expect(result.error).toEqual({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
      retryable: undefined,
      provider: "mirror.brain-chat",
    });
  });

  it("requires injected credential resolver when brain-chat auth token is missing", async () => {
    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing resolver failure");
    }
    expect(result.error).toEqual({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
      retryable: undefined,
      provider: "mirror.brain-chat",
    });
  });

  it("returns normalized config error for bad daemon-level provider", async () => {
    const priorProvider = process.env.MIRROR_PROVIDER;
    process.env.MIRROR_PROVIDER = "unsupported-provider";

    try {
      const result = await completeBrainChatViaMirrorProvider({
        env: createNonExitingRuntime(),
        brainUrl: "http://brain.local/chat",
        authToken: "token",
        request: {
          model: "brain-model",
          messages: [{ role: "user", content: "hello" }],
        },
        transport: vi.fn(async () => ({
          id: "chat-1",
          object: "chat.completion",
          created: 1,
          model: "brain-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
        })),
      });

      expect(result.ok).toBe(false);
      if (result.ok) {
        throw new Error("expected config error");
      }
      expect(result.error.code).toBe("E_PROVIDER_CONFIG");
      expect(result.error.provider).toBe("mirror.brain-chat");
    } finally {
      if (priorProvider === undefined) {
        delete process.env.MIRROR_PROVIDER;
      } else {
        process.env.MIRROR_PROVIDER = priorProvider;
      }
    }
  });

  it("summarizes a run via provider on success", async () => {
    const invocationRecorder = createInvocationRecorder();
    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "token",
      summary: { trace_id: "run-1", status: "completed" },
      events: [{ ts: "2026-03-10T00:00:00.000Z", event_type: "tool.executed", trace_id: "run-1" }],
      transport: vi.fn(async () => ({
        id: "chat-2",
        object: "chat.completion",
        created: 1,
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Run completed with one successful tool call." },
            finish_reason: "stop",
          },
        ],
      })),
      invocationRecorder,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected summary success");
    }
    expect(result.text).toContain("Run completed");
    expect(result.provider).toBe("mirror.brain-chat");
    expect(invocationRecorder.getInvocationSummary()).toMatchObject({
      last_provider: "mirror.brain-chat",
      last_model: "gpt-4o-mini",
      last_outcome: "ok",
    });
  });

  it("returns normalized error when run summary provider fails", async () => {
    const invocationRecorder = createInvocationRecorder();
    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "token",
      summary: { trace_id: "run-2", status: "failed" },
      events: [],
      transport: vi.fn(async () => {
        const error = new Error("provider unreachable") as Error & {
          code?: string;
          retryable?: boolean;
        };
        error.code = "E_CONN";
        error.retryable = true;
        throw error;
      }),
      invocationRecorder,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected summary failure");
    }
    expect(result.error).toEqual({
      code: "E_CONN",
      message: "provider unreachable",
      retryable: true,
      provider: "mirror.brain-chat",
    });
    expect(invocationRecorder.getInvocationSummary()).toMatchObject({
      last_provider: "brain-chat",
      last_model: "gpt-4o-mini",
      last_outcome: "error",
      last_error: "provider unreachable",
    });
  });

  it("uses credential resolver seam when run summary auth token is missing", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-4",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "summarized" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      summary: { trace_id: "run-3", status: "completed" },
      events: [],
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).toHaveBeenCalledWith({ provider: "brain-chat" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("uses shared default provider/model resolution in run summary path", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-summary-default",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "summary-defaults" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      summary: { trace_id: "run-defaults", status: "completed" },
      events: [],
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).toHaveBeenCalledWith({ provider: "brain-chat" });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o-mini" }));
  });

  it("bypasses credential resolver when run summary auth token already exists", async () => {
    const resolveCredentials = vi.fn(async () => ({ apiKey: "resolved-token" }));
    const transport = vi.fn(async () => ({
      id: "chat-summary-bypass",
      object: "chat.completion",
      created: 1,
      model: "gpt-4o-mini",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "summarized-direct-token" },
          finish_reason: "stop",
        },
      ],
    }));

    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "provided-token",
      summary: { trace_id: "run-3b", status: "completed" },
      events: [],
      resolveCredentials,
      transport,
    });

    expect(result.ok).toBe(true);
    expect(resolveCredentials).not.toHaveBeenCalled();
  });

  it("returns normalized error when credential resolver fails", async () => {
    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      summary: { trace_id: "run-4", status: "completed" },
      events: [],
      resolveCredentials: async () => {
        const error = new Error("credentials unavailable") as Error & { code?: string };
        error.code = "E_PROVIDER_CREDENTIALS";
        throw error;
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected credential resolution failure");
    }
    expect(result.error).toEqual({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
      retryable: undefined,
      provider: "mirror.brain-chat",
    });
  });

  it("requires injected credential resolver for run summary when auth token is missing", async () => {
    const result = await summarizeMirrorRunViaProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: undefined,
      summary: { trace_id: "run-no-resolver", status: "completed" },
      events: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected missing resolver failure");
    }
    expect(result.error).toEqual({
      code: "E_PROVIDER_CREDENTIALS",
      message: "provider credentials unavailable",
      retryable: undefined,
      provider: "mirror.brain-chat",
    });
  });

  it("sanitizes sensitive invocation errors in summary", async () => {
    const invocationRecorder = createInvocationRecorder();
    const result = await completeBrainChatViaMirrorProvider({
      env: createNonExitingRuntime(),
      brainUrl: "http://brain.local/chat",
      authToken: "token",
      request: {
        model: "brain-model",
        messages: [{ role: "user", content: "hello" }],
      },
      transport: vi.fn(async () => {
        throw new Error("Bearer token-abc sk-secret-key upstream failed");
      }),
      invocationRecorder,
    });

    expect(result.ok).toBe(false);
    const summary = invocationRecorder.getInvocationSummary();
    expect(summary?.last_outcome).toBe("error");
    expect(summary?.last_error).toContain("Bearer [redacted]");
    expect(summary?.last_error).toContain("[redacted]");
    expect(summary?.last_error).not.toContain("token-abc");
    expect(summary?.last_error).not.toContain("sk-secret-key");
  });
});
