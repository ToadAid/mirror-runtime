import crypto from "node:crypto";
import type express from "express";
import { readMirrorRequestToken } from "../mirror-gateway/auth.js";
import { isMirrorMutableActionName } from "../mirror-policy/index.js";
import type { MirrorChatMessage } from "../mirror-runtime/index.js";
import { resolveMirrorTraceId } from "../mirror-runtime/index.js";
import type {
  MirrorAdapterChatRequestEnvelope,
  MirrorAdapterContext,
  MirrorAdapterDescriptor,
  MirrorAdapterToolRequestEnvelope,
} from "./adapter_contract.js";

const INGRESS_CAPABILITIES = ["chat", "tool_calls", "policy_context"] as const;

function buildIngressAdapter(params: {
  adapterId: string;
  surface: "cli" | "service" | "console";
  transport: string;
}): MirrorAdapterDescriptor {
  return {
    adapter_id: params.adapterId,
    surface: params.surface,
    transport: params.transport,
    capabilities: [...INGRESS_CAPABILITIES],
  };
}

function buildEnvelopeBase(context: MirrorAdapterContext) {
  const traceId = context.runtime?.trace_id ?? crypto.randomUUID();
  return {
    protocol: "mirror.adapter.v1" as const,
    envelope_id: `env_${traceId}_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    context,
  };
}

function inferRequestedMode(toolName: string): "read" | "write" {
  return isMirrorMutableActionName(toolName) ? "write" : "read";
}

function readBodySessionId(body: Record<string, unknown>): string | undefined {
  if (typeof body.session_id === "string") {
    return body.session_id;
  }
  const session =
    body.session && typeof body.session === "object" && !Array.isArray(body.session)
      ? (body.session as Record<string, unknown>)
      : null;
  return typeof session?.session_id === "string" ? session.session_id : undefined;
}

function readBodyUserId(body: Record<string, unknown>): string | undefined {
  if (typeof body.user_id === "string") {
    return body.user_id;
  }
  const session =
    body.session && typeof body.session === "object" && !Array.isArray(body.session)
      ? (body.session as Record<string, unknown>)
      : null;
  return typeof session?.user_id === "string" ? session.user_id : undefined;
}

function buildHttpContext(params: {
  req: express.Request;
  body: Record<string, unknown>;
  adapterId: string;
  surface: "service" | "console";
  requestedMode: "read" | "write";
}) {
  const header =
    typeof params.req.header === "function"
      ? (name: string) => params.req.header(name)
      : (_name: string) => undefined;
  const traceId = resolveMirrorTraceId(
    header("x-mirror-trace-id") ?? undefined,
    typeof params.body.trace_id === "string" ? params.body.trace_id : undefined,
  );
  const sessionId = header("x-mirror-session-id") ?? readBodySessionId(params.body);
  const userId = readBodyUserId(params.body);
  const operatorToken = readMirrorRequestToken(params.req);

  return {
    adapter: buildIngressAdapter({
      adapterId: params.adapterId,
      surface: params.surface,
      transport: "http",
    }),
    actor: userId ? { user_id: userId } : undefined,
    session: sessionId
      ? {
          session_id: sessionId,
          metadata: {
            path: params.req.path,
            method: params.req.method,
          },
        }
      : undefined,
    policy: {
      requested_mode: params.requestedMode,
      facts: operatorToken ? { mirror_operator_token: operatorToken } : undefined,
    },
    runtime: {
      trace_id: traceId,
      correlation_id: traceId,
      priority: "interactive" as const,
    },
  } satisfies MirrorAdapterContext;
}

export function buildCliChatAdapterEnvelope(params: {
  model: string;
  messages: MirrorChatMessage[];
  userId?: string;
  command: string;
  action?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  preferredProvider?: string;
}): MirrorAdapterChatRequestEnvelope {
  const traceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  return {
    ...buildEnvelopeBase({
      adapter: buildIngressAdapter({
        adapterId: "mirror-cli",
        surface: "cli",
        transport: "argv",
      }),
      actor: params.userId ? { user_id: params.userId } : undefined,
      session: {
        session_id: sessionId,
        metadata: {
          command: params.command,
          action: params.action,
        },
      },
      policy: {
        requested_mode: "read",
      },
      runtime: {
        trace_id: traceId,
        correlation_id: traceId,
        priority: "interactive",
      },
      provider: params.preferredProvider
        ? {
            preferred_provider: params.preferredProvider,
            preferred_model: params.model,
          }
        : undefined,
    }),
    kind: "chat.request",
    request: {
      model: params.model,
      messages: params.messages.map((message) => ({ ...message })),
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      stream: params.stream,
    },
  };
}

export function buildCliToolAdapterEnvelope(params: {
  toolName: string;
  input: Record<string, unknown>;
  userId?: string;
  operatorToken?: string | null;
  command: string;
  action?: string;
}): MirrorAdapterToolRequestEnvelope {
  const traceId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();

  return {
    ...buildEnvelopeBase({
      adapter: buildIngressAdapter({
        adapterId: "mirror-cli",
        surface: "cli",
        transport: "argv",
      }),
      actor: params.userId ? { user_id: params.userId } : undefined,
      session: {
        session_id: sessionId,
        metadata: {
          command: params.command,
          action: params.action,
        },
      },
      policy: {
        requested_mode: inferRequestedMode(params.toolName),
        facts: params.operatorToken
          ? {
              mirror_operator_token: params.operatorToken,
            }
          : undefined,
      },
      runtime: {
        trace_id: traceId,
        correlation_id: traceId,
        priority: "interactive",
      },
    }),
    kind: "tool.request",
    request: {
      tool_name: params.toolName,
      input: { ...params.input },
    },
  };
}

export function buildHttpChatAdapterEnvelope(params: {
  req: express.Request;
  body: Record<string, unknown>;
  adapterId: "mirror-service-http" | "mirror-console-http";
  surface: "service" | "console";
}): MirrorAdapterChatRequestEnvelope {
  return {
    ...buildEnvelopeBase(
      buildHttpContext({
        req: params.req,
        body: params.body,
        adapterId: params.adapterId,
        surface: params.surface,
        requestedMode: "read",
      }),
    ),
    kind: "chat.request",
    request: {
      model: typeof params.body.model === "string" ? params.body.model : "mirror-default",
      messages: Array.isArray(params.body.messages)
        ? (params.body.messages as MirrorChatMessage[]).map((message) => ({ ...message }))
        : [],
      temperature:
        typeof params.body.temperature === "number" ? params.body.temperature : undefined,
      max_tokens: typeof params.body.max_tokens === "number" ? params.body.max_tokens : undefined,
      stream: typeof params.body.stream === "boolean" ? params.body.stream : undefined,
    },
  };
}

export function buildHttpToolAdapterEnvelope(params: {
  req: express.Request;
  body: Record<string, unknown>;
  toolName: string;
  adapterId: "mirror-service-http" | "mirror-console-http";
  surface: "service" | "console";
}): MirrorAdapterToolRequestEnvelope {
  return {
    ...buildEnvelopeBase(
      buildHttpContext({
        req: params.req,
        body: params.body,
        adapterId: params.adapterId,
        surface: params.surface,
        requestedMode: inferRequestedMode(params.toolName),
      }),
    ),
    kind: "tool.request",
    request: {
      tool_name: params.toolName,
      input: { ...params.body },
    },
  };
}
