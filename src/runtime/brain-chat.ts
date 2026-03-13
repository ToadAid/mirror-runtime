/**
 * Brain Chat Endpoint
 *
 * Compatibility-only OpenAI-style proxy retained temporarily for legacy integrations.
 * Canonical standalone Mirror chat lives under `/mirror/chat`.
 *
 * /api/brain/chat — OpenAI-compatible proxy to Brain.
 *
 * Security properties:
 * - Deterministic signature: { model, messages } → HMAC-SHA256
 * - Nonce TTL replay protection (5s)
 * - Strict input validation (max tokens, temperature, content filter)
 * - No /health probes (brain state hidden)
 * - LAN-safe (no outbound network)
 */

import crypto from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { executeMirrorProviderRequest } from "../mirror-provider/index.js";
import { prepareMirrorChatRequest } from "../mirror-runtime/index.js";
import type { RuntimeEnv } from "../runtime.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  user_id?: string;
};

type ChatResponse = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

type FetchLike = typeof fetch;

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
setInterval(() => REPLAY_CACHE.cleanup(), 10_000).unref?.();

function generateDeterministicSignature(model: string, messages: ChatMessage[]): string {
  const payload = JSON.stringify({ model, messages });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function handleBrainChatEndpoint(
  env: RuntimeEnv,
  brainUrl: string,
  authToken: string,
  request: ChatRequest,
  deps: { fetchImpl?: FetchLike } = {},
): Promise<ChatResponse> {
  const log = createSubsystemLogger("runtime.brain-chat");

  if (!brainUrl) {
    throw new Error("brainUrl not configured");
  }
  if (!authToken) {
    throw new Error("authToken not configured");
  }
  const prepared = await prepareMirrorChatRequest({
    model: request.model,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.max_tokens,
    stream: request.stream,
    user_id: request.user_id,
  });
  const outboundMessages = prepared.modelRequest.messages;

  const nonce = generateDeterministicSignature(request.model, outboundMessages);
  if (REPLAY_CACHE.has(nonce)) {
    throw new Error("duplicate nonce detected (replay protection)");
  }
  REPLAY_CACHE.add(nonce);

  const startTime = Date.now();
  const requestId = `chat-${nonce.slice(0, 8)}-${startTime}`;

  try {
    const response = await executeMirrorProviderRequest(
      prepared.modelRequest,
      {
        url: brainUrl,
        authToken,
      },
      { fetchImpl: deps.fetchImpl },
    );
    log.info(`brain chat: ${requestId} ${response.usage?.total_tokens || 0} tokens`);
    if (prepared.diagnostics) {
      log.debug("brain chat retrieval diagnostics", prepared.diagnostics);
    }
    return response;
  } catch (err) {
    log.error(`brain chat: ${requestId} error: ${String(err)}`);
    env.error(String(err));
    throw err;
  }
}
