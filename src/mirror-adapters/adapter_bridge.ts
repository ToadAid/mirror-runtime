import type { MirrorChatRequest, MirrorChatResponse } from "../mirror-runtime/index.js";
import type { MirrordaemonRuntimeEvent } from "../mirrordaemon/index.js";
import {
  MIRROR_ADAPTER_PROTOCOL,
  dedupeAdapterCapabilities,
  type MirrorAdapterChatRequestEnvelope,
  type MirrorAdapterChatResponseEnvelope,
  type MirrorAdapterContext,
  type MirrorAdapterDescriptor,
  type MirrorAdapterRuntimeEventEnvelope,
  type MirrorAdapterToolRequestEnvelope,
  type MirrorAdapterToolResponseEnvelope,
} from "./adapter_contract.js";

function cloneRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  return value ? { ...value } : undefined;
}

export function normalizeAdapterDescriptor(
  adapter: MirrorAdapterDescriptor,
): MirrorAdapterDescriptor {
  return {
    ...adapter,
    capabilities: dedupeAdapterCapabilities(adapter.capabilities),
    metadata: cloneRecord(adapter.metadata),
  };
}

export function buildAdapterToolContext(context: MirrorAdapterContext): Record<string, unknown> {
  return {
    adapter: normalizeAdapterDescriptor(context.adapter),
    actor: context.actor
      ? {
          ...context.actor,
          metadata: cloneRecord(context.actor.metadata),
        }
      : undefined,
    session: context.session
      ? {
          ...context.session,
          metadata: cloneRecord(context.session.metadata),
        }
      : undefined,
    policy: context.policy
      ? {
          ...context.policy,
          tags: context.policy.tags ? [...context.policy.tags] : undefined,
          facts: context.policy.facts ? { ...context.policy.facts } : undefined,
        }
      : undefined,
    runtime: context.runtime ? { ...context.runtime } : undefined,
    provider: context.provider ? { ...context.provider } : undefined,
    action: context.action ? { ...context.action } : undefined,
  };
}

export function toMirrorChatRequestFromAdapter(
  envelope: MirrorAdapterChatRequestEnvelope,
): MirrorChatRequest {
  return {
    model: envelope.request.model,
    messages: envelope.request.messages.map((message) => ({ ...message })),
    temperature: envelope.request.temperature,
    max_tokens: envelope.request.max_tokens,
    stream: envelope.request.stream,
    user_id: envelope.context.actor?.user_id ?? envelope.context.actor?.external_user_id,
    session: {
      session_id:
        envelope.context.session?.session_id ?? envelope.context.session?.external_session_id,
      user_id: envelope.context.actor?.user_id ?? envelope.context.actor?.external_user_id,
      tool_context: buildAdapterToolContext(envelope.context),
    },
  };
}

export function toMirrorToolExecutionFromAdapter(envelope: MirrorAdapterToolRequestEnvelope): {
  toolName: string;
  input: Record<string, unknown>;
  context: { user_id?: string; session_id?: string; tool_context: Record<string, unknown> };
} {
  return {
    toolName: envelope.request.tool_name,
    input: { ...envelope.request.input },
    context: {
      user_id: envelope.context.actor?.user_id ?? envelope.context.actor?.external_user_id,
      session_id:
        envelope.context.session?.session_id ?? envelope.context.session?.external_session_id,
      tool_context: buildAdapterToolContext(envelope.context),
    },
  };
}

function buildResponseBase(
  context: MirrorAdapterContext,
  params: { envelopeId: string; createdAt?: string },
) {
  return {
    protocol: MIRROR_ADAPTER_PROTOCOL,
    envelope_id: params.envelopeId,
    created_at: params.createdAt ?? new Date().toISOString(),
    context: {
      ...context,
      adapter: normalizeAdapterDescriptor(context.adapter),
    },
  };
}

export function buildAdapterChatResponseEnvelope(params: {
  request: MirrorAdapterChatRequestEnvelope;
  response: MirrorChatResponse;
  envelopeId?: string;
  createdAt?: string;
}): MirrorAdapterChatResponseEnvelope {
  return {
    ...buildResponseBase(params.request.context, {
      envelopeId: params.envelopeId ?? `${params.request.envelope_id}:response`,
      createdAt: params.createdAt,
    }),
    kind: "chat.response",
    response: {
      ...params.response,
      choices: params.response.choices.map((choice) => ({
        ...choice,
        message: { ...choice.message },
      })),
      usage: params.response.usage ? { ...params.response.usage } : undefined,
    },
  };
}

export function buildAdapterToolResponseEnvelope(params: {
  request: MirrorAdapterToolRequestEnvelope;
  result: Record<string, unknown>;
  envelopeId?: string;
  createdAt?: string;
}): MirrorAdapterToolResponseEnvelope {
  return {
    ...buildResponseBase(params.request.context, {
      envelopeId: params.envelopeId ?? `${params.request.envelope_id}:response`,
      createdAt: params.createdAt,
    }),
    kind: "tool.response",
    response: {
      tool_name: params.request.request.tool_name,
      result: { ...params.result },
    },
  };
}

export function buildAdapterRuntimeEventEnvelope(params: {
  context: MirrorAdapterContext;
  event: MirrordaemonRuntimeEvent;
  envelopeId?: string;
  createdAt?: string;
}): MirrorAdapterRuntimeEventEnvelope {
  return {
    ...buildResponseBase(params.context, {
      envelopeId: params.envelopeId ?? `${params.event.id}:adapter`,
      createdAt: params.createdAt ?? params.event.timestamp,
    }),
    kind: "runtime.event",
    event: {
      ...params.event,
      payload: { ...params.event.payload },
    },
  };
}
