import { describe, expect, it } from "vitest";
import {
  MIRROR_ADAPTER_PROTOCOL,
  buildAdapterChatResponseEnvelope,
  buildAdapterRuntimeEventEnvelope,
  buildAdapterToolResponseEnvelope,
  dedupeAdapterCapabilities,
  toMirrorChatRequestFromAdapter,
  toMirrorToolExecutionFromAdapter,
  type MirrorAdapterChatRequestEnvelope,
  type MirrorAdapterToolRequestEnvelope,
} from "./index.js";

function buildChatEnvelope(): MirrorAdapterChatRequestEnvelope {
  return {
    protocol: MIRROR_ADAPTER_PROTOCOL,
    envelope_id: "env_chat_1",
    created_at: "2026-03-13T12:00:00.000Z",
    kind: "chat.request",
    context: {
      adapter: {
        adapter_id: "telegram-main",
        surface: "telegram",
        transport: "bot_api",
        capabilities: ["chat", "threads", "chat"],
        account_id: "primary",
      },
      actor: {
        user_id: "traveler-1",
        external_user_id: "tg:123",
        display_name: "Traveler",
      },
      session: {
        session_id: "mirror-session-1",
        external_session_id: "telegram-chat-99",
        conversation_id: "chat-99",
        thread_id: "topic-7",
      },
      policy: {
        requested_mode: "read",
        tags: ["dm", "trusted"],
      },
      runtime: {
        priority: "interactive",
        correlation_id: "corr-1",
      },
      provider: {
        preferred_model: "mirror-default",
      },
    },
    request: {
      model: "mirror-default",
      messages: [{ role: "user", content: "What happened to the patience vault?" }],
      temperature: 0.2,
      max_tokens: 400,
    },
  };
}

describe("mirror adapter contract", () => {
  it("normalizes adapter chat envelopes into Mirror chat requests", () => {
    const envelope = buildChatEnvelope();

    const request = toMirrorChatRequestFromAdapter(envelope);

    expect(request.model).toBe("mirror-default");
    expect(request.user_id).toBe("traveler-1");
    expect(request.session?.session_id).toBe("mirror-session-1");
    expect(request.session?.tool_context).toMatchObject({
      adapter: {
        adapter_id: "telegram-main",
        surface: "telegram",
        transport: "bot_api",
        capabilities: ["chat", "threads"],
      },
      actor: {
        user_id: "traveler-1",
        external_user_id: "tg:123",
      },
      session: {
        conversation_id: "chat-99",
        thread_id: "topic-7",
      },
      policy: {
        requested_mode: "read",
      },
      runtime: {
        correlation_id: "corr-1",
      },
      provider: {
        preferred_model: "mirror-default",
      },
    });
  });

  it("normalizes adapter tool envelopes into tool execution inputs", () => {
    const envelope: MirrorAdapterToolRequestEnvelope = {
      protocol: MIRROR_ADAPTER_PROTOCOL,
      envelope_id: "env_tool_1",
      created_at: "2026-03-13T12:00:00.000Z",
      kind: "tool.request",
      context: buildChatEnvelope().context,
      request: {
        tool_name: "mirror.find-scroll",
        input: { query: "patience vault", limit: 5 },
      },
    };

    const execution = toMirrorToolExecutionFromAdapter(envelope);

    expect(execution.toolName).toBe("mirror.find-scroll");
    expect(execution.input).toEqual({ query: "patience vault", limit: 5 });
    expect(execution.context.user_id).toBe("traveler-1");
    expect(execution.context.session_id).toBe("mirror-session-1");
    expect(execution.context.tool_context).toHaveProperty("adapter");
  });

  it("builds stable adapter response and event envelopes", () => {
    const chatEnvelope = buildChatEnvelope();
    const chatResponse = buildAdapterChatResponseEnvelope({
      request: chatEnvelope,
      response: {
        id: "resp_1",
        object: "chat.completion",
        created: 1,
        model: "mirror-default",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "The Patience Vault was cancelled." },
            finish_reason: "stop",
          },
        ],
      },
    });

    const toolEnvelope: MirrorAdapterToolRequestEnvelope = {
      protocol: MIRROR_ADAPTER_PROTOCOL,
      envelope_id: "env_tool_2",
      created_at: "2026-03-13T12:00:00.000Z",
      kind: "tool.request",
      context: chatEnvelope.context,
      request: {
        tool_name: "mirror.find-scroll",
        input: { query: "patience vault" },
      },
    };
    const toolResponse = buildAdapterToolResponseEnvelope({
      request: toolEnvelope,
      result: { candidates: [{ scroll_id: "TOBY_L1219" }] },
    });
    const runtimeEvent = buildAdapterRuntimeEventEnvelope({
      context: chatEnvelope.context,
      event: {
        id: "event_1",
        type: "chat.finished",
        timestamp: "2026-03-13T12:00:02.000Z",
        payload: { session_id: "mirror-session-1" },
      },
    });

    expect(chatResponse.protocol).toBe(MIRROR_ADAPTER_PROTOCOL);
    expect(chatResponse.kind).toBe("chat.response");
    expect(chatResponse.envelope_id).toBe("env_chat_1:response");
    expect(toolResponse.response.tool_name).toBe("mirror.find-scroll");
    expect(runtimeEvent.kind).toBe("runtime.event");
    expect(runtimeEvent.event.type).toBe("chat.finished");
    expect(runtimeEvent.context.adapter.capabilities).toEqual(["chat", "threads"]);
  });

  it("deduplicates declared adapter capabilities", () => {
    expect(dedupeAdapterCapabilities(["chat", "tool_calls", "chat"])).toEqual([
      "chat",
      "tool_calls",
    ]);
  });
});
