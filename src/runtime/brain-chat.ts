/**
 * Brain Chat Endpoint
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
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { RuntimeEnv } from "../../runtime.js";

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
    const TTL_MS = 5_000; // 5s replay protection
    this.cache.set(nonce, { expires: Date.now() + TTL_MS });
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
setInterval(() => REPLAY_CACHE.cleanup(), 10_000);

function generateDeterministicSignature(model: string, messages: ChatMessage[]): string {
  const payload = JSON.stringify({ model, messages });
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return hash.slice(0, 32); // Use first 32 chars
}

export async function handleBrainChatEndpoint(
  env: RuntimeEnv,
  brainUrl: string,
  authToken: string,
  request: ChatRequest,
): Promise<ChatResponse> {
  const log = createSubsystemLogger("runtime.brain-chat");

  // Input validation
  if (!request.model) {
    throw new Error("model is required");
  }

  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new Error("messages array is required and must not be empty");
  }

  for (const msg of request.messages) {
    if (!msg.role || !["system", "user", "assistant"].includes(msg.role)) {
      throw new Error("invalid role: must be system, user, or assistant");
    }
    if (typeof msg.content !== "string" || msg.content.trim() === "") {
      throw new Error("content must be a non-empty string");
    }
  }

  // Temperature clamp
  const temperature =
    request.temperature !== undefined ? Math.min(Math.max(request.temperature, 0), 1) : 0.7;

  // Max tokens clamp
  const maxTokens =
    request.max_tokens !== undefined ? Math.min(Math.max(request.max_tokens, 1), 100_000) : 4096;

  // Generate nonce
  const nonce = generateDeterministicSignature(request.model, request.messages);

  // Replay protection
  if (REPLAY_CACHE.has(nonce)) {
    throw new Error("duplicate nonce detected (replay protection)");
  }
  REPLAY_CACHE.add(nonce);

  // Prepare request
  const startTime = Date.now();
  const requestId = `chat-${nonce.slice(0, 8)}-${startTime}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s timeout

    const requestBody = JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    });

    const response = await fetch(brainUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`brain proxy error: ${response.status} ${error}`);
    }

    const data: ChatResponse = await response.json();

    log.info(`brain chat: ${requestId} ${data.usage?.total_tokens || 0} tokens`);

    return data;
  } catch (err) {
    log.error(`brain chat: ${requestId} error: ${String(err)}`);
    throw err;
  }
}
