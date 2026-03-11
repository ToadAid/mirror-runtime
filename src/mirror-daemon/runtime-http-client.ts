import type { ReplyBackendResult } from "../auto-reply/reply/backend.js";
import type { ReplyPayload } from "../auto-reply/types.js";
import type { MirrorDaemonReplyRequest } from "./reply-backend-adapter.js";
import type { MirrorRuntimeClient } from "./runtime-client.js";
import { MIRROR_EXECUTE_ENDPOINT } from "./runtime-http-contract.js";

export type HttpMirrorRuntimeClientOptions = {
  baseUrl?: string;
  endpointPath?: string;
  fetchFn?: typeof fetch;
  token?: string;
  timeoutMs?: number;
};

const STUB_REPLY: ReplyPayload = { text: "[mirror-daemon stub reply]" };
const DEFAULT_RUNTIME_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReplyPayload(value: unknown): value is ReplyPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.text === "string" ||
    typeof value.mediaUrl === "string" ||
    Array.isArray(value.mediaUrls) ||
    typeof value.replyToId === "string" ||
    typeof value.replyToTag === "boolean" ||
    typeof value.replyToCurrent === "boolean" ||
    typeof value.audioAsVoice === "boolean" ||
    typeof value.isError === "boolean" ||
    typeof value.isReasoning === "boolean" ||
    isRecord(value.channelData)
  );
}

function resolveBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.trim().length > 0) {
    return baseUrl.replace(/\/+$/, "");
  }
  const envBaseUrl = process.env.MIRROR_RUNTIME_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl.replace(/\/+$/, "");
  }
  const port = process.env.OPENCLAW_GATEWAY_PORT?.trim() || "18789";
  return `http://127.0.0.1:${port}`;
}

function resolveEndpointPath(endpointPath?: string): string {
  if (!endpointPath || endpointPath.trim().length === 0) {
    return MIRROR_EXECUTE_ENDPOINT;
  }
  return endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
}

function resolveToken(token?: string): string | undefined {
  const explicitToken = token?.trim();
  if (explicitToken) {
    return explicitToken;
  }

  const runtimeToken = process.env.MIRROR_RUNTIME_TOKEN?.trim();
  if (runtimeToken) {
    return runtimeToken;
  }

  const daemonToken = process.env.MIRROR_DAEMON_TOKEN?.trim();
  return daemonToken || undefined;
}

function resolveTimeoutMs(timeoutMs?: number): number {
  if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    return Math.floor(timeoutMs);
  }

  const envTimeout = process.env.MIRROR_RUNTIME_TIMEOUT_MS?.trim();
  if (envTimeout) {
    const parsed = Number.parseInt(envTimeout, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return DEFAULT_RUNTIME_TIMEOUT_MS;
}

export function serializeMirrorRequest(request: MirrorDaemonReplyRequest): string {
  return JSON.stringify(request);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  const text = await response.text();
  return text.trim().length > 0 ? text : null;
}

export async function parseMirrorResponse(response: Response): Promise<ReplyBackendResult> {
  if (!response.ok) {
    const payload = await parseResponseBody(response).catch(() => null);
    const reason =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(`Mirror runtime request failed: ${reason}`);
  }

  const payload = await parseResponseBody(response);
  if (payload == null) {
    return undefined;
  }
  if (Array.isArray(payload)) {
    if (payload.every((entry) => isReplyPayload(entry))) {
      return payload;
    }
    throw new Error("Mirror runtime returned invalid reply payload array");
  }
  if (isReplyPayload(payload)) {
    return payload;
  }
  throw new Error("Mirror runtime returned invalid reply payload");
}

export class HttpMirrorRuntimeClient implements MirrorRuntimeClient {
  private readonly baseUrl: string;
  private readonly endpointPath: string;
  private readonly fetchFn: typeof fetch;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(options: HttpMirrorRuntimeClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.endpointPath = resolveEndpointPath(options.endpointPath);
    this.fetchFn = options.fetchFn ?? fetch;
    this.token = resolveToken(options.token);
    this.timeoutMs = resolveTimeoutMs(options.timeoutMs);
  }

  async executeReply(request: MirrorDaemonReplyRequest): Promise<ReplyBackendResult> {
    const controller = new AbortController();
    const url = `${this.baseUrl}${this.endpointPath}`;
    const timeoutMessage = `Mirror runtime request timed out after ${this.timeoutMs}ms (url=${url})`;
    const timeout = setTimeout(() => controller.abort(new Error(timeoutMessage)), this.timeoutMs);

    try {
      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: serializeMirrorRequest(request),
        signal: controller.signal,
      });

      return (await parseMirrorResponse(response)) ?? STUB_REPLY;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("timed out"))
      ) {
        throw new Error(timeoutMessage, { cause: error });
      }
      console.error("[mirror-runtime] request failed", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
