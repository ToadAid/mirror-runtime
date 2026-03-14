import type { MirrorChatMessage, MirrorChatResponse } from "../mirror-runtime/index.js";
import type { MirrordaemonRuntimeEvent } from "../mirrordaemon/index.js";

export const MIRROR_ADAPTER_PROTOCOL = "mirror.adapter.v1" as const;

export type MirrorAdapterProtocol = typeof MIRROR_ADAPTER_PROTOCOL;

export type MirrorAdapterSurface =
  | "telegram"
  | "whatsapp_web"
  | "discord"
  | "slack"
  | "imessage"
  | "signal"
  | "web_ui"
  | "mobile_app"
  | "desktop_app"
  | "custom";

export type MirrorAdapterCapability =
  | "chat"
  | "tool_calls"
  | "streaming_events"
  | "attachments"
  | "threads"
  | "reactions"
  | "rich_text"
  | "operator_auth"
  | "session_resume"
  | "policy_context";

export type MirrorAdapterDescriptor = {
  adapter_id: string;
  surface: MirrorAdapterSurface;
  transport: string;
  version?: string;
  installation_id?: string;
  account_id?: string;
  capabilities: MirrorAdapterCapability[];
  metadata?: Record<string, unknown>;
};

export type MirrorAdapterActorIdentity = {
  actor_id?: string;
  user_id?: string;
  external_user_id?: string;
  display_name?: string;
  roles?: string[];
  is_operator?: boolean;
  metadata?: Record<string, unknown>;
};

export type MirrorAdapterSessionIdentity = {
  session_id?: string;
  external_session_id?: string;
  conversation_id?: string;
  thread_id?: string;
  channel_id?: string;
  message_id?: string;
  metadata?: Record<string, unknown>;
};

export type MirrorAdapterPolicyHook = {
  policy_scope?: string;
  requested_mode?: "read" | "write" | "operator";
  tags?: string[];
  facts?: Record<string, string>;
};

export type MirrorAdapterRuntimeHook = {
  priority?: "interactive" | "background";
  trace_id?: string;
  correlation_id?: string;
};

export type MirrorAdapterProviderHook = {
  preferred_provider?: string;
  preferred_model?: string;
};

export type MirrorAdapterActionHook = {
  tool_call_id?: string;
  action_group?: string;
};

export type MirrorAdapterContext = {
  adapter: MirrorAdapterDescriptor;
  actor?: MirrorAdapterActorIdentity;
  session?: MirrorAdapterSessionIdentity;
  policy?: MirrorAdapterPolicyHook;
  runtime?: MirrorAdapterRuntimeHook;
  provider?: MirrorAdapterProviderHook;
  action?: MirrorAdapterActionHook;
};

export type MirrorAdapterEnvelopeBase = {
  protocol: MirrorAdapterProtocol;
  envelope_id: string;
  created_at: string;
  context: MirrorAdapterContext;
};

export type MirrorAdapterChatRequestEnvelope = MirrorAdapterEnvelopeBase & {
  kind: "chat.request";
  request: {
    model: string;
    messages: MirrorChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  };
};

export type MirrorAdapterToolRequestEnvelope = MirrorAdapterEnvelopeBase & {
  kind: "tool.request";
  request: {
    tool_name: string;
    input: Record<string, unknown>;
  };
};

export type MirrorAdapterChatResponseEnvelope = MirrorAdapterEnvelopeBase & {
  kind: "chat.response";
  response: MirrorChatResponse;
};

export type MirrorAdapterToolResponseEnvelope = MirrorAdapterEnvelopeBase & {
  kind: "tool.response";
  response: {
    tool_name: string;
    result: Record<string, unknown>;
  };
};

export type MirrorAdapterRuntimeEventEnvelope = MirrorAdapterEnvelopeBase & {
  kind: "runtime.event";
  event: MirrordaemonRuntimeEvent;
};

export type MirrorAdapterRequestEnvelope =
  | MirrorAdapterChatRequestEnvelope
  | MirrorAdapterToolRequestEnvelope;

export type MirrorAdapterResponseEnvelope =
  | MirrorAdapterChatResponseEnvelope
  | MirrorAdapterToolResponseEnvelope;

export function dedupeAdapterCapabilities(
  capabilities: MirrorAdapterCapability[],
): MirrorAdapterCapability[] {
  return Array.from(new Set(capabilities));
}
