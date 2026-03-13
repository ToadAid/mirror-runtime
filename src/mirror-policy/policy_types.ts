import type { MirrorAdapterDescriptor } from "../mirror-adapters/index.js";
import type { MirrorProviderConfig, MirrorProviderRequest } from "../mirror-provider/index.js";
import type { MirrorChatRequest } from "../mirror-runtime/index.js";
import type { MirrorSkillTool } from "../mirror/skills/index.js";
import type { MirrordaemonSurfaceName } from "../mirrordaemon/index.js";

export type MirrorPolicySurface = MirrordaemonSurfaceName | "adapter";

export type MirrorPolicyPhase = "ingress" | "provider" | "action" | "adapter";

export type MirrorPolicyActor = {
  user_id?: string;
  external_user_id?: string;
  display_name?: string;
  is_operator?: boolean;
  roles?: string[];
  metadata?: Record<string, unknown>;
};

export type MirrorPolicySession = {
  session_id?: string;
  external_session_id?: string;
  conversation_id?: string;
  thread_id?: string;
  channel_id?: string;
  metadata?: Record<string, unknown>;
};

export type MirrorPolicyContext = {
  surface: MirrorPolicySurface;
  route?: string;
  command?: string;
  request_token?: string | null;
  actor?: MirrorPolicyActor;
  session?: MirrorPolicySession;
  adapter?: MirrorAdapterDescriptor;
  metadata?: Record<string, unknown>;
};

export type MirrorChatPolicyTarget = {
  kind: "chat";
  model: string;
  message_count: number;
  latest_user_message?: string;
};

export type MirrorToolPolicyTarget = {
  kind: "tool";
  tool_name: string;
  access: MirrorSkillTool["metadata"]["access"];
  input: Record<string, unknown>;
};

export type MirrorProviderPolicyTarget = {
  kind: "provider";
  provider_url: string;
  model: string;
};

export type MirrorActionPolicyTarget = {
  kind: "action";
  action_name: string;
  input?: Record<string, unknown>;
  access?: "open" | "operator";
  source?: string;
};

export type MirrorAdapterPolicyTarget = {
  kind: "adapter";
  adapter_id: string;
  surface: MirrorAdapterDescriptor["surface"];
  transport: string;
  capabilities: MirrorAdapterDescriptor["capabilities"];
  envelope_kind: string;
};

export type MirrorPolicyTarget =
  | MirrorChatPolicyTarget
  | MirrorToolPolicyTarget
  | MirrorProviderPolicyTarget
  | MirrorActionPolicyTarget
  | MirrorAdapterPolicyTarget;

export type MirrorPolicyEvaluationInput = {
  phase: MirrorPolicyPhase;
  target: MirrorPolicyTarget;
  context: MirrorPolicyContext;
};

export type MirrorPolicyDecision = {
  allowed: boolean;
  code: string;
  reason: string;
  statusCode?: number;
  rule?: string;
  tags?: string[];
};

export type MirrorPolicyRuleEvaluation = {
  rule: string;
  decision: MirrorPolicyDecision;
};

export type MirrorPolicyEvaluationResult = {
  allowed: boolean;
  decision: MirrorPolicyDecision;
  evaluations: MirrorPolicyRuleEvaluation[];
};

export type MirrorPolicyRule = {
  name: string;
  evaluate: (
    input: MirrorPolicyEvaluationInput,
  ) => Promise<MirrorPolicyDecision | null> | MirrorPolicyDecision | null;
};

export function buildMirrorChatPolicyTarget(
  request: Pick<MirrorChatRequest, "model" | "messages">,
): MirrorChatPolicyTarget {
  const latestUserMessage = [...request.messages]
    .toReversed()
    .find((message) => message.role === "user");
  return {
    kind: "chat",
    model: request.model,
    message_count: request.messages.length,
    latest_user_message: latestUserMessage?.content,
  };
}

export function buildMirrorToolPolicyTarget(
  tool: Pick<MirrorSkillTool, "metadata">,
  input: Record<string, unknown>,
): MirrorToolPolicyTarget {
  return {
    kind: "tool",
    tool_name: tool.metadata.name,
    access: tool.metadata.access,
    input,
  };
}

export function buildMirrorProviderPolicyTarget(
  request: Pick<MirrorProviderRequest, "model">,
  config: Pick<MirrorProviderConfig, "url">,
): MirrorProviderPolicyTarget {
  return {
    kind: "provider",
    provider_url: config.url,
    model: request.model,
  };
}

export function buildMirrorActionPolicyTarget(
  actionName: string,
  input?: Record<string, unknown>,
  options: {
    access?: "open" | "operator";
    source?: string;
  } = {},
): MirrorActionPolicyTarget {
  return {
    kind: "action",
    action_name: actionName,
    input,
    access: options.access,
    source: options.source,
  };
}

export function buildMirrorAdapterPolicyTarget(params: {
  adapter: MirrorAdapterDescriptor;
  envelopeKind: string;
}): MirrorAdapterPolicyTarget {
  return {
    kind: "adapter",
    adapter_id: params.adapter.adapter_id,
    surface: params.adapter.surface,
    transport: params.adapter.transport,
    capabilities: [...params.adapter.capabilities],
    envelope_kind: params.envelopeKind,
  };
}
