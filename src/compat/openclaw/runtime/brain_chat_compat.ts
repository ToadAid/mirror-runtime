import crypto from "node:crypto";
import type express from "express";
import type {
  MirrorAdapterChatRequestEnvelope,
  MirrorChatMessage,
  MirrorChatRequest,
} from "../../../mirror-runtime/index.js";
import { prepareMirrorChatRequest, resolveMirrorTraceId } from "../../../mirror-runtime/index.js";

export type CompatChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CompatChatRequest = {
  model: string;
  messages: CompatChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  user_id?: string;
};

export type CompatChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: CompatChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

interface ReplayCache {
  has(nonce: string): boolean;
  add(nonce: string): void;
  cleanup(): void;
}

class MemoryReplayCache implements ReplayCache {
  private cache = new Map<string, { expires: number }>();

  has(nonce: string): boolean {
    const entry = this.cache.get(nonce);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expires) {
      this.cache.delete(nonce);
      return false;
    }
    return true;
  }

  add(nonce: string): void {
    const ttlMs = 5_000;
    this.cache.set(nonce, { expires: Date.now() + ttlMs });
  }

  cleanup(): void {
    const now = Date.now();
    for (const [nonce, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(nonce);
      }
    }
  }
}

const REPLAY_CACHE = new MemoryReplayCache();
const COMPAT_BRAIN_CHAT_CAPABILITIES = ["chat", "policy_context"] as const;
setInterval(() => REPLAY_CACHE.cleanup(), 10_000).unref?.();

export async function withMirrorCompatLogLevel<T>(fn: () => Promise<T>): Promise<T> {
  const previousMirrorLogLevel = process.env.MIRROR_LOG_LEVEL;
  if (!previousMirrorLogLevel) {
    const compatLevel = process.env.OPENCLAW_LOG_LEVEL;
    if (typeof compatLevel === "string" && compatLevel.trim().length > 0) {
      process.env.MIRROR_LOG_LEVEL = compatLevel;
    }
  }

  try {
    return await fn();
  } finally {
    if (previousMirrorLogLevel === undefined) {
      delete process.env.MIRROR_LOG_LEVEL;
    } else {
      process.env.MIRROR_LOG_LEVEL = previousMirrorLogLevel;
    }
  }
}

function generateDeterministicSignature(model: string, messages: MirrorChatMessage[]): string {
  const payload = JSON.stringify({ model, messages });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function readCompatSessionId(
  req: Pick<express.Request, "header">,
  body: Record<string, unknown>,
): string | undefined {
  if (typeof req.header === "function") {
    const headerSessionId = req.header("x-mirror-session-id");
    if (typeof headerSessionId === "string" && headerSessionId.length > 0) {
      return headerSessionId;
    }
  }
  if (typeof body.session_id === "string" && body.session_id.length > 0) {
    return body.session_id;
  }
  const session =
    body.session && typeof body.session === "object" && !Array.isArray(body.session)
      ? (body.session as Record<string, unknown>)
      : null;
  return typeof session?.session_id === "string" && session.session_id.length > 0
    ? session.session_id
    : undefined;
}

export function readCompatUserId(body: Record<string, unknown>): string | undefined {
  if (typeof body.user_id === "string" && body.user_id.length > 0) {
    return body.user_id;
  }
  const session =
    body.session && typeof body.session === "object" && !Array.isArray(body.session)
      ? (body.session as Record<string, unknown>)
      : null;
  return typeof session?.user_id === "string" && session.user_id.length > 0
    ? session.user_id
    : undefined;
}

export function readCompatTraceId(
  req: Pick<express.Request, "header">,
  body: Record<string, unknown>,
): string {
  const session =
    body.session && typeof body.session === "object" && !Array.isArray(body.session)
      ? (body.session as Record<string, unknown>)
      : null;
  return resolveMirrorTraceId(
    typeof req.header === "function" ? req.header("x-mirror-trace-id") : undefined,
    typeof body.trace_id === "string" ? body.trace_id : undefined,
    typeof session?.trace_id === "string" ? session.trace_id : undefined,
  );
}

export function normalizeCompatChatRequest(body: Record<string, unknown>): CompatChatRequest {
  return {
    model: typeof body.model === "string" ? body.model : "",
    messages: Array.isArray(body.messages)
      ? body.messages.map((message) =>
          message && typeof message === "object"
            ? {
                role: (message as { role?: CompatChatMessage["role"] }).role ?? "user",
                content:
                  typeof (message as { content?: unknown }).content === "string"
                    ? (message as { content: string }).content
                    : "",
              }
            : { role: "user", content: "" },
        )
      : [],
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    user_id: readCompatUserId(body),
  };
}

export function toMirrorChatRequestFromCompatRequest(
  request: CompatChatRequest,
): MirrorChatRequest {
  return {
    model: request.model,
    messages: request.messages.map((message) => ({ ...message })),
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    stream: request.stream,
    user_id: request.user_id,
  };
}

export async function prepareCompatBrainChatRequest(request: CompatChatRequest): Promise<{
  mirrorRequest: MirrorChatRequest;
  requestId: string;
  diagnostics: unknown;
}> {
  const mirrorRequest = toMirrorChatRequestFromCompatRequest(request);
  // Preserve replay semantics by hashing the canon-prepared outbound prompt.
  const prepared = await prepareMirrorChatRequest(mirrorRequest);
  const nonce = generateDeterministicSignature(mirrorRequest.model, prepared.modelRequest.messages);
  if (REPLAY_CACHE.has(nonce)) {
    throw new Error("duplicate nonce detected (replay protection)");
  }
  REPLAY_CACHE.add(nonce);

  return {
    mirrorRequest,
    requestId: `chat-${nonce.slice(0, 8)}-${Date.now()}`,
    diagnostics: prepared.diagnostics,
  };
}

export function buildCompatBrainChatEnvelope(params: {
  request: CompatChatRequest;
  traceId: string;
  sessionId?: string;
  routePath: string;
  method: string;
}): MirrorAdapterChatRequestEnvelope {
  return {
    protocol: "mirror.adapter.v1",
    envelope_id: `env_${params.traceId}_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    kind: "chat.request",
    context: {
      adapter: {
        adapter_id: "mirror-compat-brain-http",
        surface: "service",
        transport: "http",
        capabilities: [...COMPAT_BRAIN_CHAT_CAPABILITIES],
      },
      actor: params.request.user_id ? { user_id: params.request.user_id } : undefined,
      session: params.sessionId
        ? {
            session_id: params.sessionId,
            metadata: {
              path: params.routePath,
              method: params.method,
            },
          }
        : undefined,
      policy: {
        requested_mode: "read",
      },
      runtime: {
        trace_id: params.traceId,
        correlation_id: params.traceId,
        priority: "interactive",
      },
    },
    request: {
      model: params.request.model,
      messages: params.request.messages.map((message) => ({ ...message })),
      temperature: params.request.temperature,
      max_tokens: params.request.max_tokens,
      stream: params.request.stream,
    },
  };
}
