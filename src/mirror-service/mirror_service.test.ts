import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { runMirrorCli } from "../mirror-cli/index.js";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import type { MirrorPolicyEngine, MirrorPolicyEvaluationInput } from "../mirror-policy/index.js";
import type { MirrorSyncManager } from "../mirror-sync/index.js";
import type { Mirrordaemon } from "../mirrordaemon/index.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import {
  loadMirrorServiceConfig,
  MIRROR_RUNTIME_WS_PATH,
  MIRROR_RUNTIME_WS_PROTOCOL,
  startMirrorService,
  type MirrorRuntimeWsEnvelope,
} from "./index.js";
import { createMirrorServiceSyncHandlers } from "./sync_handlers.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
const originalMirrorProviderUrl = process.env.MIRROR_PROVIDER_URL;
const originalMirrorProviderAuthToken = process.env.MIRROR_PROVIDER_AUTH_TOKEN;
const originalMirrorPort = process.env.MIRROR_PORT;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;
const originalMirrorNodeId = process.env.MIRROR_NODE_ID;
const originalMirrorBaseUrl = process.env.MIRROR_BASE_URL;
const originalMirrorUserWorkspaceDir = process.env.MIRROR_USER_WORKSPACE_DIR;
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }
  if (originalMirrorOperatorToken === undefined) {
    delete process.env.MIRROR_OPERATOR_TOKEN;
  } else {
    process.env.MIRROR_OPERATOR_TOKEN = originalMirrorOperatorToken;
  }
  if (originalMirrorProviderUrl === undefined) {
    delete process.env.MIRROR_PROVIDER_URL;
  } else {
    process.env.MIRROR_PROVIDER_URL = originalMirrorProviderUrl;
  }
  if (originalMirrorProviderAuthToken === undefined) {
    delete process.env.MIRROR_PROVIDER_AUTH_TOKEN;
  } else {
    process.env.MIRROR_PROVIDER_AUTH_TOKEN = originalMirrorProviderAuthToken;
  }
  if (originalMirrorPort === undefined) {
    delete process.env.MIRROR_PORT;
  } else {
    process.env.MIRROR_PORT = originalMirrorPort;
  }
  if (originalMirrorNodeId === undefined) {
    delete process.env.MIRROR_NODE_ID;
  } else {
    process.env.MIRROR_NODE_ID = originalMirrorNodeId;
  }
  if (originalMirrorBaseUrl === undefined) {
    delete process.env.MIRROR_BASE_URL;
  } else {
    process.env.MIRROR_BASE_URL = originalMirrorBaseUrl;
  }
  if (originalMirrorUserWorkspaceDir === undefined) {
    delete process.env.MIRROR_USER_WORKSPACE_DIR;
  } else {
    process.env.MIRROR_USER_WORKSPACE_DIR = originalMirrorUserWorkspaceDir;
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  closeMirrorMemoryDb();
  if (originalMirrorMemoryDbPath === undefined) {
    delete process.env.MIRROR_MEMORY_DB_PATH;
  } else {
    process.env.MIRROR_MEMORY_DB_PATH = originalMirrorMemoryDbPath;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-service-"));
  tempDirs.push(dir);
  return dir;
}

async function createTempHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

async function createTempMemoryDbPath(): Promise<string> {
  const dir = await createTempLoreDir();
  return path.join(dir, "mirror-memory.sqlite");
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    [
      "---",
      "title: Rune3 Patience Vault Cancelled",
      "epoch: E3",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Rune3",
      "",
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(
      {
        "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function createSyncHandlerTestDeps(
  overrides: {
    policyEvaluate?: MirrorPolicyEngine["evaluate"];
    publishRuntimeEvent?: Mirrordaemon["publishRuntimeEvent"];
    announcePeer?: MirrorSyncManager["announcePeer"];
    listPeers?: MirrorSyncManager["listPeers"];
    getLocalUpdates?: MirrorSyncManager["getLocalUpdates"];
    pullFromPeer?: MirrorSyncManager["pullFromPeer"];
  } = {},
) {
  const daemon = {
    publishRuntimeEvent: overrides.publishRuntimeEvent ?? vi.fn(),
  } as Pick<Mirrordaemon, "publishRuntimeEvent"> as Mirrordaemon;
  const policy = {
    evaluate:
      overrides.policyEvaluate ??
      vi.fn(async () => ({
        allowed: true as const,
        decision: {
          allowed: true,
          reason: "allowed",
          code: "allowed",
          statusCode: 200,
        },
        evaluations: [],
      })),
  } as MirrorPolicyEngine;
  const syncManager = {
    announcePeer:
      overrides.announcePeer ??
      vi.fn(async (input) => ({
        peer_id: input.peer_id,
        base_url: input.base_url,
        last_seen_at: "2026-03-20T00:00:00.000Z",
        sync_status: "idle" as const,
      })),
    listPeers: overrides.listPeers ?? vi.fn(() => []),
    getLocalUpdates:
      overrides.getLocalUpdates ??
      vi.fn(async () => ({
        node_id: "service-node",
        base_url: "http://127.0.0.1:7001",
        canon: {
          lore_dir: "/tmp/mirror-service-test",
          index_path: "/tmp/mirror-service-test/_index/KEYWORD_INDEX.json",
          index_version: 1,
          latest_update_at: "2026-03-20T00:00:00.000Z",
          files: [],
        },
        graph: {
          version: "graph-v1",
          updated_at: "2026-03-20T00:00:00.000Z",
          updated_at_ms: Date.parse("2026-03-20T00:00:00.000Z"),
          node_count: 0,
          edge_count: 0,
        },
      })),
    pullFromPeer:
      overrides.pullFromPeer ??
      vi.fn(async () => ({
        peer_id: "peer-1",
        peer_base_url: "http://127.0.0.1:7999",
        pulled_files: [],
        skipped_files: [],
        conflicts: [],
        graph: {
          remote_version: "graph-v1",
          local_version: "graph-v1",
          rebuilt: false,
        },
      })),
    setLocalBaseUrl: vi.fn(),
    getLocalBaseUrl: vi.fn(() => null),
    registry: {} as never,
  } satisfies MirrorSyncManager;

  return {
    handlers: createMirrorServiceSyncHandlers({
      daemon,
      policy,
      syncManager,
    }),
    daemon,
    policy,
    syncManager,
  };
}

async function requestJsonFromApp(
  app: unknown,
  method: string,
  url: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const reqHeaders = { ...options.headers };
    const req = {
      method,
      url,
      headers: reqHeaders,
      body: options.body,
      header(name: string) {
        const value = reqHeaders[name] ?? reqHeaders[name.toLowerCase()];
        return typeof value === "string" ? value : undefined;
      },
    };
    const headers = new Map<string, string>();
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase());
      },
      removeHeader(name: string) {
        headers.delete(name.toLowerCase());
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        resolve(payload);
        return this;
      },
      send(payload: unknown) {
        this.body = payload;
        resolve(payload);
        return this;
      },
      end(payload?: unknown) {
        resolve(payload);
        return this;
      },
    };

    try {
      if (typeof app === "function") {
        (app as (req: unknown, res: unknown) => void)(req, res);
      } else {
        (app as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function requestResponseFromApp(
  app: unknown,
  method: string,
  url: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{ statusCode: number; body: unknown }> {
  return await new Promise((resolve, reject) => {
    const reqHeaders = { ...options.headers };
    const req = {
      method,
      url,
      headers: reqHeaders,
      body: options.body,
      header(name: string) {
        const value = reqHeaders[name] ?? reqHeaders[name.toLowerCase()];
        return typeof value === "string" ? value : undefined;
      },
    };
    const headers = new Map<string, string>();
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        headers.set(name.toLowerCase(), value);
      },
      getHeader(name: string) {
        return headers.get(name.toLowerCase());
      },
      removeHeader(name: string) {
        headers.delete(name.toLowerCase());
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
      send(payload: unknown) {
        this.body = payload;
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
      end(payload?: unknown) {
        resolve({ statusCode: this.statusCode, body: payload });
        return this;
      },
    };

    try {
      if (typeof app === "function") {
        (app as (req: unknown, res: unknown) => void)(req, res);
      } else {
        (app as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function openSseStreamFromApp(app: unknown): Promise<{
  chunks: string[];
  headers: Map<string, string>;
  close: () => void;
}> {
  const chunks: string[] = [];
  const headers = new Map<string, string>();
  let closeListener: (() => void) | undefined;

  const req = {
    method: "GET",
    url: "/mirror/runtime/events",
    path: "/mirror/runtime/events",
    on(event: string, listener: () => void) {
      if (event === "close") {
        closeListener = listener;
      }
    },
    header() {
      return undefined;
    },
  };
  const res = {
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      return this;
    },
  };

  if (typeof app === "function") {
    (app as (req: unknown, res: unknown) => void)(req, res);
  } else {
    (app as { handle: (req: unknown, res: unknown) => void }).handle(req, res);
  }

  return {
    chunks,
    headers,
    close() {
      closeListener?.();
    },
  };
}

function readSseEventTypes(chunks: string[]): string[] {
  return chunks
    .join("")
    .split("\n\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eventLine = entry
        .split("\n")
        .find((line) => line.startsWith("event: "))
        ?.slice("event: ".length);
      return eventLine ?? "";
    })
    .filter(Boolean);
}

function decodeWebSocketPayload(payload: WebSocket.RawData): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf8");
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  if (ArrayBuffer.isView(payload)) {
    const view = payload as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("utf8");
  }
  throw new Error("Unsupported websocket payload");
}

function isLoopbackSocketPermissionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  return code === "EPERM" && error.message.includes("127.0.0.1");
}

async function openRuntimeWebSocket(
  port: number,
  query = "",
): Promise<{
  socket: WebSocket;
  messages: MirrorRuntimeWsEnvelope[];
  waitFor: <T extends MirrorRuntimeWsEnvelope["type"]>(
    type: T,
    predicate?: (message: Extract<MirrorRuntimeWsEnvelope, { type: T }>) => boolean,
  ) => Promise<Extract<MirrorRuntimeWsEnvelope, { type: T }>>;
}> {
  const socket = new WebSocket(
    `ws://127.0.0.1:${port}${MIRROR_RUNTIME_WS_PATH}${query}`,
    MIRROR_RUNTIME_WS_PROTOCOL,
  );
  const messages: MirrorRuntimeWsEnvelope[] = [];

  socket.on("message", (payload) => {
    messages.push(JSON.parse(decodeWebSocketPayload(payload)) as MirrorRuntimeWsEnvelope);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) => reject(error));
  });

  const waitFor = async <T extends MirrorRuntimeWsEnvelope["type"]>(
    type: T,
    predicate?: (message: Extract<MirrorRuntimeWsEnvelope, { type: T }>) => boolean,
  ): Promise<Extract<MirrorRuntimeWsEnvelope, { type: T }>> => {
    const existing = messages.find(
      (message): message is Extract<MirrorRuntimeWsEnvelope, { type: T }> =>
        message.type === type &&
        (predicate ? predicate(message as Extract<MirrorRuntimeWsEnvelope, { type: T }>) : true),
    );
    if (existing) {
      return existing;
    }

    return await new Promise<Extract<MirrorRuntimeWsEnvelope, { type: T }>>((resolve) => {
      const listener = (payload: WebSocket.RawData) => {
        const message = JSON.parse(decodeWebSocketPayload(payload)) as MirrorRuntimeWsEnvelope;
        if (message.type === type && (!predicate || predicate(message as never))) {
          socket.off("message", listener);
          resolve(message as Extract<MirrorRuntimeWsEnvelope, { type: T }>);
        }
      };
      socket.on("message", listener);
    });
  };

  return {
    socket,
    messages,
    waitFor,
  };
}

describe("mirror service", () => {
  it("preserves sync handler policy denial responses and events", async () => {
    const policyEvaluate = vi.fn(async () => ({
      allowed: false as const,
      decision: {
        allowed: false,
        reason: "denied",
        code: "operator_auth_required",
        statusCode: 401,
      },
      evaluations: [],
    }));
    const publishRuntimeEvent = vi.fn();
    const { handlers } = createSyncHandlerTestDeps({
      policyEvaluate,
      publishRuntimeEvent,
    });
    const res = createMockResponse();

    await handlers.pull(
      {
        path: "/mirror-sync/pull",
        method: "POST",
        body: {
          peer_id: "peer-1",
        },
        header(name: string) {
          if (name === "x-mirror-session-id") {
            return "session-1";
          }
          if (name === "x-mirror-operator-token") {
            return "secret";
          }
          return undefined;
        },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: "denied",
      code: "operator_auth_required",
    });
    expect(policyEvaluate).toHaveBeenCalledTimes(1);
    expect(publishRuntimeEvent).toHaveBeenCalledWith("policy.denied", {
      phase: "action",
      target: "action",
      action: "sync.pull",
      code: "operator_auth_required",
      route: "/mirror-sync/pull",
    });
  });

  it("loads config from environment", () => {
    process.env.MIRROR_PORT = "7777";
    process.env.MIRROR_PROVIDER_URL = "http://brain.local/v1/chat/completions";
    process.env.MIRROR_PROVIDER_AUTH_TOKEN = "token";
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    process.env.MIRROR_LORE_DIR = "/tmp/mirror-lore";
    process.env.MIRROR_NODE_ID = "mirror-service-test";
    process.env.MIRROR_BASE_URL = "http://127.0.0.1:7777";

    const config = loadMirrorServiceConfig();

    expect(config.port).toBe(7777);
    expect(config.providerUrl).toBe("http://brain.local/v1/chat/completions");
    expect(config.providerAuthToken).toBe("token");
    expect(config.operatorToken).toBe("secret");
    expect(config.loreDir).toBe(path.resolve("/tmp/mirror-lore"));
    expect(config.nodeId).toBe("mirror-service-test");
    expect(config.baseUrl).toBe("http://127.0.0.1:7777");
  });

  it("starts a gateway server and responds on gateway routes", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      {
        fetchImpl: vi.fn(async () => {
          throw new Error("provider fetch should not be called");
        }),
      },
    );

    try {
      const res = createMockResponse();
      service.handlers.listTools({} as never, res as never);
      const body = res.body as { tools: Array<{ metadata: { name: string } }> };

      expect(service.app).toBeDefined();
      expect(service.handlers).toBeDefined();
      expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.find-scroll");
      expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.task.create");
      expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.monk.context");
    } finally {
      await service.shutdown();
    }
  });

  it("routes /mirror/chat through the gateway layer", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      {
        fetchImpl: vi.fn<typeof fetch>(async (_url, init) => {
          const body = parseRequestBodyJson<{
            messages: Array<{ role: string; content: string }>;
          }>(init);
          expect(body.messages[0]?.content).toContain("Mirror canon context:");
          return {
            ok: true,
            json: async () => ({
              id: "resp_service",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      const executeAdapterRequestSpy = vi.spyOn(service.runtimeHost, "executeAdapterRequest");
      const executeChatWithProviderSpy = vi.spyOn(service.runtimeHost, "executeChatWithProvider");
      const res = createMockResponse();
      await service.handlers.executeChat(
        {
          method: "POST",
          path: "/mirror/chat",
          body: {
            model: "mirror-default",
            messages: [{ role: "user", content: "What happened to the patience vault?" }],
          },
          header: () => undefined,
        } as never,
        res as never,
      );
      const body = res.body as {
        response: { choices: Array<{ message: { content: string } }> };
      };

      expect(service.app).toBeDefined();
      expect(service.handlers).toBeDefined();
      expect(body.response.choices[0]?.message.content).toBe("Cancelled.");
      expect(executeAdapterRequestSpy).toHaveBeenCalledTimes(1);
      expect(executeAdapterRequestSpy.mock.calls[0]?.[0]).toMatchObject({
        kind: "chat.request",
        context: {
          adapter: {
            adapter_id: "mirror-service-http",
            transport: "http",
          },
        },
      });
      expect(executeChatWithProviderSpy).not.toHaveBeenCalled();
    } finally {
      await service.shutdown();
    }
  });

  it("preserves service and console response shapes through adapter-backed routing", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      {
        fetchImpl: vi.fn(async () => {
          return {
            ok: true,
            json: async () => ({
              id: "resp_service_shapes",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      const serviceChat = (await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
        body: {
          session_id: "shape-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      })) as { response: { choices: Array<{ message: { content: string } }> } };
      expect(serviceChat.response.choices[0]?.message.content).toBe("Cancelled.");

      const serviceTool = (await requestJsonFromApp(
        service.app,
        "POST",
        "/mirror/tools/mirror.find-scroll",
        {
          body: {
            session_id: "shape-tool-session",
            user_id: "alice",
            query: "patience vault",
          },
        },
      )) as { tool: string; result: { candidates: Array<{ path: string }> } };
      expect(serviceTool.tool).toBe("mirror.find-scroll");
      expect(serviceTool.result.candidates[0]?.path).toBe(
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
      );

      const consoleChat = (await requestJsonFromApp(
        service.app,
        "POST",
        "/mirror/console/api/chat",
        {
          body: {
            session_id: "shape-console-chat-session",
            user_id: "alice",
            model: "mirror-default",
            messages: [{ role: "user", content: "What happened to the patience vault?" }],
          },
        },
      )) as { response: { choices: Array<{ message: { content: string } }> } };
      expect(consoleChat.response.choices[0]?.message.content).toBe("Cancelled.");

      const consoleTool = (await requestJsonFromApp(
        service.app,
        "POST",
        "/mirror/console/api/tools/mirror.find-scroll",
        {
          body: {
            session_id: "shape-console-tool-session",
            user_id: "alice",
            query: "patience vault",
          },
        },
      )) as { tool: string; result: { candidates: Array<{ path: string }> } };
      expect(consoleTool.tool).toBe("mirror.find-scroll");
      expect(consoleTool.result.candidates[0]?.path).toBe(
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
      );
    } finally {
      await service.shutdown();
    }
  });

  it("preserves mutable auth rejection through adapter-backed service routing", async () => {
    const loreDir = await createTempLoreDir();
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const usersRoot = path.join(await createTempLoreDir(), "users");
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const response = (await requestResponseFromApp(
        service.app,
        "POST",
        "/mirror/tools/mirror.task.create",
        {
          body: {
            session_id: "mutable-tool-session",
            user_id: "alice",
            title: "Daily planning",
          },
        },
      )) as { statusCode: number; body: unknown };

      expect(response.statusCode).toBe(403);
      expect(response.body).toEqual({
        error: "Mirror operator authorization required",
        code: "mutable_surface_auth_required",
      });
    } finally {
      await service.shutdown();
    }
  });

  it("mounts the Mirror console on the main service surface", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const res = {
        headers: {} as Record<string, string>,
        body: undefined as unknown,
        type(value: string) {
          this.headers["content-type"] = value;
          return this;
        },
        send(payload: unknown) {
          this.body = payload;
          return this;
        },
      };

      service.consoleHandlers.loadConsole({} as never, res as never);

      expect(String(res.body)).toContain("Mirror Console");
      expect(String(res.body)).toContain("/mirror/console/api/tools/");
    } finally {
      await service.shutdown();
    }
  });

  it("fails closed for mutable network-exposed routes when operator auth is unconfigured", async () => {
    await createTempHome("mirror-service-unconfigured-home-");
    const loreDir = await createTempLoreDir();
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-service-users-"));
    tempDirs.push(usersRoot);
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    delete process.env.MIRROR_OPERATOR_TOKEN;
    await seedLoreCorpus(loreDir);

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const syncPull = await requestResponseFromApp(service.app, "POST", "/mirror-sync/pull", {
        body: {
          peer_id: "peer-a",
        },
      });
      expect(syncPull).toEqual({
        statusCode: 503,
        body: {
          code: "mutable_surface_auth_unconfigured",
          error: "Mirror operator auth is not configured",
        },
      });

      const createTask = await requestResponseFromApp(
        service.app,
        "POST",
        "/mirror/tools/mirror.task.create",
        {
          body: {
            user_id: "alice",
            title: "Daily planning",
          },
        },
      );
      expect(createTask).toEqual({
        statusCode: 503,
        body: {
          code: "mutable_surface_auth_unconfigured",
          error: "Mirror operator auth is not configured",
        },
      });

      const listTasks = await requestResponseFromApp(
        service.app,
        "POST",
        "/mirror/tools/mirror.task.list",
        {
          body: {
            user_id: "alice",
          },
        },
      );
      expect(listTasks.statusCode).toBe(200);
      expect(listTasks.body).toEqual({
        tool: "mirror.task.list",
        result: {
          tasks: [],
        },
      });
    } finally {
      await service.shutdown();
    }
  });

  it("preserves tool policy denial responses and runtime events through the service route", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });
    const evaluate = vi.fn(async (input: MirrorPolicyEvaluationInput) => {
      if (
        input.phase === "action" &&
        input.target.kind === "action" &&
        input.target.action_name === "mirror.find-scroll"
      ) {
        return {
          allowed: false as const,
          decision: {
            allowed: false,
            reason: "denied",
            code: "tool_blocked",
            statusCode: 451,
          },
          evaluations: [],
        };
      }
      return {
        allowed: true as const,
        decision: {
          allowed: true,
          code: "allowed",
          reason: "allowed",
          statusCode: 200,
        },
        evaluations: [],
      };
    });
    service.runtimeHost.gateway.policy.evaluate = evaluate;

    try {
      const response = await requestResponseFromApp(
        service.app,
        "POST",
        "/mirror/tools/mirror.find-scroll",
        {
          headers: {
            "x-mirror-trace-id": "trace-tool-denied-1",
          },
          body: {
            session_id: "runtime-tool-session",
            user_id: "alice",
            query: "patience vault",
          },
        },
      );

      expect(response).toEqual({
        statusCode: 451,
        body: {
          error: "denied",
          code: "tool_blocked",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("tool.execution.started");
      expect(eventTypes).toContain("action.execution.started");
      expect(eventTypes).toContain("tool.execution.failed");
      expect(eventTypes).toContain("policy.denied");
      expect(eventTypes).toContain("action.execution.failed");
      expect(eventTypes).not.toContain("tool.execution.finished");
      expect(eventTypes).not.toContain("action.execution.finished");

      const deniedEvent = service.daemon
        .getRecentEvents()
        .find((event) => event.type === "policy.denied");
      expect(deniedEvent?.payload).toEqual(
        expect.objectContaining({
          phase: "adapter",
          target: "action",
          tool: "mirror.find-scroll",
          code: "tool_blocked",
          route: "/mirror/tools/mirror.find-scroll",
        }),
      );
      expect(deniedEvent?.correlation).toEqual(
        expect.objectContaining({
          trace_id: "trace-tool-denied-1",
          session_id: "runtime-tool-session",
        }),
      );
    } finally {
      await service.shutdown();
    }
  });

  it("exposes sync handlers on the main service surface", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "service-node",
    });

    try {
      const announceRes = createMockResponse();
      await service.syncHandlers.announce(
        {
          body: {
            peer_id: "peer-1",
            base_url: "http://127.0.0.1:7999",
          },
          header(name: string) {
            if (name.toLowerCase() === "x-mirror-operator-token") {
              return "secret";
            }
            return undefined;
          },
        } as never,
        announceRes as never,
      );
      expect((announceRes.body as { peer: { peer_id: string } }).peer.peer_id).toBe("peer-1");

      const peersRes = createMockResponse();
      await service.syncHandlers.peers({} as never, peersRes as never);
      expect((peersRes.body as { peers: Array<{ peer_id: string }> }).peers[0]?.peer_id).toBe(
        "peer-1",
      );

      const updatesRes = createMockResponse();
      await service.syncHandlers.updates({ query: {} } as never, updatesRes as never);
      expect((updatesRes.body as { node_id: string }).node_id).toBe("service-node");

      const updatesWithContentRes = createMockResponse();
      await service.syncHandlers.updates(
        {
          query: {
            include_content: "1",
            paths: " TOBY_L1219_Rune3_PatienceVaultCancelled.md , ",
          },
        } as never,
        updatesWithContentRes as never,
      );
      expect(
        (
          updatesWithContentRes.body as {
            file_contents?: Record<string, string>;
          }
        ).file_contents,
      ).toEqual({
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md": expect.stringContaining(
          "The Patience Vault was cancelled.",
        ),
      });
    } finally {
      await service.shutdown();
    }
  });

  it("preserves sync announce responses and wrapper event order", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "service-node",
      baseUrl: "http://127.0.0.1:7001",
    });

    try {
      const response = await requestResponseFromApp(service.app, "POST", "/mirror-sync/announce", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toEqual({
        peer: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
          last_seen_at: expect.any(String),
          sync_status: "idle",
        },
        local: {
          node_id: "service-node",
          base_url: "http://127.0.0.1:7001",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      const announceStartedIndex = eventTypes.indexOf("sync.announce.started");
      const announceFinishedIndex = eventTypes.indexOf("sync.announce.finished");
      const announceIndex = eventTypes.indexOf("sync.announce");

      expect(announceIndex).toBeGreaterThan(-1);
      expect(announceFinishedIndex).toBeGreaterThan(announceIndex);
      expect(announceStartedIndex).toBeGreaterThan(announceFinishedIndex);
    } finally {
      await service.shutdown();
    }
  });

  it("preserves invalid sync announce responses and wrapper events", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const response = await requestResponseFromApp(service.app, "POST", "/mirror-sync/announce", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "peer-1",
        },
      });

      expect(response).toEqual({
        statusCode: 400,
        body: {
          error: "peer_id and base_url are required",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("sync.announce");
      expect(eventTypes).not.toContain("sync.announce.started");
      expect(eventTypes).not.toContain("sync.announce.finished");
    } finally {
      await service.shutdown();
    }
  });

  it("preserves sync pull error responses and wrapper events", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const response = await requestResponseFromApp(service.app, "POST", "/mirror-sync/pull", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "missing-peer",
        },
      });

      expect(response).toEqual({
        statusCode: 500,
        body: {
          error: "Error: mirror sync pull requires a known peer_id or base_url",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("sync.pull");
      expect(eventTypes).not.toContain("sync.pull.started");
      expect(eventTypes).not.toContain("sync.pull.failed");
    } finally {
      await service.shutdown();
    }
  });

  it("exposes standalone health and status endpoints", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "health-node",
    });

    try {
      const health = (await requestJsonFromApp(service.app, "GET", "/mirror/health")) as {
        ok: boolean;
        product: string;
        version: string;
        daemon_session_id: string;
        uptime_ms: number;
        service: { node_id: string; port: number };
        event_stream: { sse_available: boolean; ws_available: boolean };
        correlation: { trace_id: boolean; session_id: boolean };
      };
      const status = (await requestJsonFromApp(service.app, "GET", "/mirror/status")) as {
        ok: boolean;
        product: string;
        version: string;
        daemon_session_id: string;
        service: { node_id: string; port: number };
      };

      expect(health.ok).toBe(true);
      expect(health.product).toBe("mirror");
      expect(health.version.length).toBeGreaterThan(0);
      expect(health.daemon_session_id.length).toBeGreaterThan(0);
      expect(health.uptime_ms).toBeGreaterThanOrEqual(0);
      expect(health.service.node_id).toBe("health-node");
      expect(health.service.port).toBe(service.port);
      expect(health.event_stream.sse_available).toBe(true);
      expect(health.event_stream.ws_available).toBe(true);
      expect(health.correlation.trace_id).toBe(true);
      expect(health.correlation.session_id).toBe(true);
      expect(status.ok).toBe(health.ok);
      expect(status.product).toBe(health.product);
      expect(status.version).toBe(health.version);
      expect(status.daemon_session_id).toBe(health.daemon_session_id);
      expect(status.service.node_id).toBe(health.service.node_id);
      expect(status.service.port).toBe(health.service.port);
    } finally {
      await service.shutdown();
    }
  });

  it("exposes canonical runtime state and debug endpoints", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "runtime-node",
    });

    try {
      service.daemon.createSession({
        session_id: "session-1",
        user_id: "alice",
        metadata: { path: "/mirror/chat" },
      });

      const runtime = (await requestJsonFromApp(service.app, "GET", "/mirror/runtime")) as {
        ok: boolean;
        version: string;
        daemon_session_id: string;
        node_id: string;
        actions: { active: number; registered: number };
        providers: { total: number; active_provider_id: string | null };
        event_stream: { recent_events: number; sse_available: boolean; ws_available: boolean };
        sessions: { total: number };
      };
      const sessions = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/runtime/sessions",
      )) as {
        sessions: Array<{ session_id: string }>;
      };
      const debug = (await requestJsonFromApp(service.app, "GET", "/mirror/runtime/debug")) as {
        runtime: { node_id: string };
        boot_snapshot: { config: { node_id: string } };
        sessions: Array<{ session_id: string }>;
      };
      const actions = (await requestJsonFromApp(service.app, "GET", "/mirror/actions")) as {
        ok: boolean;
        registered: number;
        active: number;
        actions: Array<{ action_id: string; action_name: string }>;
      };
      const providers = (await requestJsonFromApp(service.app, "GET", "/mirror/providers")) as {
        ok: boolean;
        active_provider_id: string | null;
        total: number;
        providers: Array<{ provider_id: string; selected: boolean }>;
      };

      expect(runtime.ok).toBe(true);
      expect(runtime.version.length).toBeGreaterThan(0);
      expect(runtime.daemon_session_id.length).toBeGreaterThan(0);
      expect(runtime.node_id).toBe("runtime-node");
      expect(runtime.sessions.total).toBe(1);
      expect(runtime.actions.registered).toBeGreaterThan(0);
      expect(runtime.providers.total).toBe(1);
      expect(runtime.providers.active_provider_id).toBe("primary");
      expect(runtime.event_stream.sse_available).toBe(true);
      expect(runtime.event_stream.ws_available).toBe(true);
      expect(sessions.sessions[0]?.session_id).toBe("session-1");
      expect(debug.runtime.node_id).toBe("runtime-node");
      expect(debug.boot_snapshot.config.node_id).toBe("runtime-node");
      expect(debug.sessions[0]?.session_id).toBe("session-1");
      expect(actions.ok).toBe(true);
      expect(actions.registered).toBeGreaterThan(0);
      expect(actions.active).toBe(0);
      expect(providers.ok).toBe(true);
      expect(providers.active_provider_id).toBe("primary");
      expect(providers.total).toBe(1);
      expect(providers.providers[0]?.provider_id).toBe("primary");
      expect(providers.providers[0]?.selected).toBe(true);
    } finally {
      await service.shutdown();
    }
  });

  it("reports active actions while an action execution is in flight", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "actions-node",
    });

    try {
      service.daemon.publishRuntimeEvent("action.execution.started", {
        trace_id: "trace-action-1",
        session_id: "action-session",
        action_id: "action-1",
        action: "mirror.find-scroll",
        execution_id: "action-1",
      });

      const actions = (await requestJsonFromApp(service.app, "GET", "/mirror/actions")) as {
        active: number;
        actions: Array<{
          action_id: string;
          action_name: string;
          session_id?: string;
          trace_id: string;
        }>;
      };

      expect(actions.active).toBe(1);
      expect(actions.actions[0]?.action_id).toBe("action-1");
      expect(actions.actions[0]?.action_name).toBe("mirror.find-scroll");
      expect(actions.actions[0]?.session_id).toBe("action-session");
      expect(actions.actions[0]?.trace_id).toBe("trace-action-1");
    } finally {
      await service.shutdown();
    }
  });

  it("tracks console chat requests in daemon sessions", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "console-runtime-node",
      },
      {
        fetchImpl: vi.fn<typeof fetch>(async (_url, init) => {
          const body = parseRequestBodyJson<{
            messages: Array<{ role: string; content: string }>;
          }>(init);
          expect(body.messages[0]?.content).toContain("Mirror canon context:");
          return {
            ok: true,
            json: async () => ({
              id: "resp_console_chat",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      await requestJsonFromApp(service.app, "POST", "/mirror/console/api/chat", {
        body: {
          session_id: "console-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });

      const sessions = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/runtime/sessions",
      )) as {
        sessions: Array<{
          session_id: string;
          user_id?: string;
          metadata: { path?: string; method?: string };
        }>;
      };

      expect(sessions.sessions[0]?.session_id).toBe("console-chat-session");
      expect(sessions.sessions[0]?.user_id).toBe("alice");
      expect(sessions.sessions[0]?.metadata.path).toBe("/mirror/console/api/chat");
      expect(sessions.sessions[0]?.metadata.method).toBe("POST");
    } finally {
      await service.shutdown();
    }
  });

  it("tracks console tool requests in daemon sessions", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
      nodeId: "console-tool-node",
    });

    try {
      await requestJsonFromApp(
        service.app,
        "POST",
        "/mirror/console/api/tools/mirror.find-scroll",
        {
          body: {
            session_id: "console-tool-session",
            user_id: "alice",
            query: "patience vault",
          },
        },
      );

      const sessions = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/runtime/sessions",
      )) as {
        sessions: Array<{
          session_id: string;
          user_id?: string;
          metadata: { path?: string; method?: string };
        }>;
      };

      expect(sessions.sessions[0]?.session_id).toBe("console-tool-session");
      expect(sessions.sessions[0]?.user_id).toBe("alice");
      expect(sessions.sessions[0]?.metadata.path).toBe(
        "/mirror/console/api/tools/mirror.find-scroll",
      );
      expect(sessions.sessions[0]?.metadata.method).toBe("POST");
    } finally {
      await service.shutdown();
    }
  });

  it("emits daemon runtime events for chat, tool, provider, and sync lifecycle", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "events-node",
      },
      {
        fetchImpl: vi.fn<typeof fetch>(async (_url) => {
          return {
            ok: true,
            json: async () => ({
              id: "resp_events",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
        headers: {
          "x-mirror-trace-id": "trace-chat-1",
        },
        body: {
          session_id: "runtime-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });

      await requestJsonFromApp(service.app, "POST", "/mirror/tools/mirror.find-scroll", {
        headers: {
          "x-mirror-trace-id": "trace-tool-1",
        },
        body: {
          session_id: "runtime-tool-session",
          user_id: "alice",
          query: "patience vault",
        },
      });

      await requestJsonFromApp(service.app, "POST", "/mirror-sync/announce", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      const chatStarted = service.daemon
        .getRecentEvents()
        .find((event) => event.type === "chat.started");
      const providerStarted = service.daemon
        .getRecentEvents()
        .find((event) => event.type === "provider.call.started");
      const actionStarted = service.daemon
        .getRecentEvents()
        .find((event) => event.type === "action.execution.started");
      expect(eventTypes).toContain("chat.started");
      expect(eventTypes).toContain("chat.finished");
      expect(eventTypes).toContain("provider.call.started");
      expect(eventTypes).toContain("provider.call.finished");
      expect(eventTypes).toContain("tool.execution.started");
      expect(eventTypes).toContain("tool.execution.finished");
      expect(eventTypes).toContain("sync.announce.started");
      expect(eventTypes).toContain("sync.announce.finished");
      expect(chatStarted?.correlation).toEqual(
        expect.objectContaining({
          trace_id: "trace-chat-1",
          session_id: "runtime-chat-session",
        }),
      );
      expect(providerStarted?.correlation).toEqual(
        expect.objectContaining({
          trace_id: "trace-chat-1",
          session_id: "runtime-chat-session",
          provider_id: "primary",
        }),
      );
      expect(actionStarted?.correlation).toEqual(
        expect.objectContaining({
          trace_id: "trace-tool-1",
          session_id: "runtime-tool-session",
        }),
      );
      expect(typeof actionStarted?.correlation?.action_id).toBe("string");
    } finally {
      await service.shutdown();
    }
  });

  it("streams /mirror/runtime/events with backlog and live request events", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "events-stream-node",
      },
      {
        fetchImpl: vi.fn(async () => {
          return {
            ok: true,
            json: async () => ({
              id: "resp_stream",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      const stream = await openSseStreamFromApp(service.app);
      expect(stream.headers.get("content-type")).toBe("text/event-stream");
      expect(stream.headers.get("cache-control")).toBe("no-cache");
      expect(stream.headers.get("connection")).toBe("keep-alive");

      await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
        headers: {
          "x-mirror-trace-id": "trace-sse-1",
        },
        body: {
          session_id: "stream-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });
      await requestJsonFromApp(service.app, "POST", "/mirror/tools/mirror.find-scroll", {
        body: {
          session_id: "stream-tool-session",
          user_id: "alice",
          query: "patience vault",
        },
      });
      await requestJsonFromApp(service.app, "POST", "/mirror-sync/announce", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      const eventTypes = readSseEventTypes(stream.chunks);
      const sseData = stream.chunks
        .join("")
        .split("\n\n")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) =>
          entry
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6),
        )
        .filter((entry): entry is string => Boolean(entry))
        .map((entry) => JSON.parse(entry) as { type: string; correlation?: { trace_id?: string } });
      expect(eventTypes).toContain("runtime.started");
      expect(eventTypes).toContain("session.created");
      expect(eventTypes).toContain("chat.started");
      expect(eventTypes).toContain("chat.finished");
      expect(eventTypes).toContain("provider.call.started");
      expect(eventTypes).toContain("provider.call.finished");
      expect(eventTypes).toContain("tool.execution.started");
      expect(eventTypes).toContain("tool.execution.finished");
      expect(eventTypes).toContain("sync.announce.started");
      expect(eventTypes).toContain("sync.announce.finished");
      expect(
        sseData.some(
          (event) => event.type === "chat.started" && event.correlation?.trace_id === "trace-sse-1",
        ),
      ).toBe(true);

      stream.close();
    } finally {
      await service.shutdown();
    }
  });

  it("streams /mirror/runtime/ws with backlog, live events, and protocol messages", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "events-ws-node",
      },
      {
        fetchImpl: vi.fn(async () => {
          return {
            ok: true,
            json: async () => ({
              id: "resp_ws",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      let ws;
      try {
        ws = await openRuntimeWebSocket(service.port);
      } catch (error) {
        if (isLoopbackSocketPermissionError(error)) {
          return;
        }
        throw error;
      }
      const hello = await ws.waitFor("hello");
      expect(hello.protocol).toBe(MIRROR_RUNTIME_WS_PROTOCOL);
      expect(hello.stream).toBe("runtime.events");
      expect(hello.node_id).toBe("events-ws-node");

      const subscribed = await ws.waitFor("subscribed");
      expect(subscribed.stream).toBe("runtime.events");
      expect(subscribed.backlog_sent).toBeGreaterThan(0);
      expect(
        ws.messages.some(
          (message) => message.type === "runtime.event" && message.event.type === "runtime.started",
        ),
      ).toBe(true);

      await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
        headers: {
          "x-mirror-trace-id": "trace-ws-1",
        },
        body: {
          session_id: "ws-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });
      await requestJsonFromApp(service.app, "POST", "/mirror/tools/mirror.find-scroll", {
        body: {
          session_id: "ws-tool-session",
          user_id: "alice",
          query: "patience vault",
        },
      });
      await requestJsonFromApp(service.app, "POST", "/mirror-sync/announce", {
        headers: {
          "x-mirror-operator-token": "secret",
        },
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      await ws.waitFor(
        "runtime.event",
        (message) => message.event.type === "provider.call.finished",
      );
      await ws.waitFor(
        "runtime.event",
        (message) => message.event.type === "action.execution.finished",
      );
      await ws.waitFor(
        "runtime.event",
        (message) => message.event.type === "sync.announce.finished",
      );

      ws.socket.send(JSON.stringify({ type: "ping", ts: "123" }));
      const pong = await ws.waitFor("pong", (message) => message.ts === "123");
      expect(pong.connection_id).toBe(hello.connection_id);

      const runtimeEventTypes = ws.messages
        .filter(
          (message): message is Extract<MirrorRuntimeWsEnvelope, { type: "runtime.event" }> =>
            message.type === "runtime.event",
        )
        .map((message) => message.event.type);
      const correlatedChatEvent = ws.messages.find(
        (message) =>
          message.type === "runtime.event" &&
          message.event.type === "chat.started" &&
          message.event.correlation?.trace_id === "trace-ws-1",
      );
      expect(runtimeEventTypes).toContain("chat.started");
      expect(runtimeEventTypes).toContain("chat.finished");
      expect(runtimeEventTypes).toContain("provider.call.started");
      expect(runtimeEventTypes).toContain("provider.call.finished");
      expect(runtimeEventTypes).toContain("tool.execution.started");
      expect(runtimeEventTypes).toContain("tool.execution.finished");
      expect(runtimeEventTypes).toContain("action.execution.started");
      expect(runtimeEventTypes).toContain("action.execution.finished");
      expect(runtimeEventTypes).toContain("sync.announce.started");
      expect(runtimeEventTypes).toContain("sync.announce.finished");
      expect(correlatedChatEvent).toBeDefined();

      ws.socket.close();
      await new Promise<void>((resolve) => {
        ws.socket.once("close", () => resolve());
      });
    } finally {
      await service.shutdown();
    }
  });

  it("keeps service, console, daemon, observability, and status surfaces in sync", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "truth-node",
      },
      {
        fetchImpl: vi.fn(async () => {
          return {
            ok: true,
            json: async () => ({
              id: "resp_truth",
              object: "chat.completion",
              created: 1,
              model: "mirror-default",
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content: "Cancelled." },
                  finish_reason: "stop",
                },
              ],
            }),
          } as Response;
        }),
      },
    );

    try {
      await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
        body: {
          session_id: "truth-service-chat",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });
      await requestJsonFromApp(
        service.app,
        "POST",
        "/mirror/console/api/tools/mirror.find-scroll",
        {
          body: {
            session_id: "truth-console-tool",
            user_id: "alice",
            query: "patience vault",
          },
        },
      );

      const runtime = (await requestJsonFromApp(service.app, "GET", "/mirror/runtime")) as {
        node_id: string;
        sessions: { total: number; open: number };
      };
      const sessions = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/runtime/sessions",
      )) as {
        sessions: Array<{ session_id: string }>;
      };
      const debug = (await requestJsonFromApp(service.app, "GET", "/mirror/runtime/debug")) as {
        runtime: { node_id: string; sessions: { total: number; open: number } };
        sessions: Array<{ session_id: string }>;
        diagnostics: Array<{ event: string }>;
        recent_events: Array<{ type: string }>;
      };
      const metrics = (await requestJsonFromApp(service.app, "GET", "/mirror/metrics")) as {
        counters: {
          chat_requests: number;
          tool_executions: number;
        };
      };
      const diagnostics = (await requestJsonFromApp(service.app, "GET", "/mirror/diagnostics")) as {
        events: Array<{ event: string }>;
      };
      const status = (await requestJsonFromApp(service.app, "GET", "/mirror/status")) as {
        service: { node_id: string };
      };

      expect(runtime.node_id).toBe("truth-node");
      expect(runtime.sessions.total).toBe(2);
      expect(runtime.sessions.open).toBe(2);
      expect(sessions.sessions.map((session) => session.session_id).toSorted()).toEqual([
        "truth-console-tool",
        "truth-service-chat",
      ]);
      expect(debug.runtime.node_id).toBe("truth-node");
      expect(debug.runtime.sessions.total).toBe(runtime.sessions.total);
      expect(debug.runtime.sessions.open).toBe(runtime.sessions.open);
      expect(debug.sessions.map((session) => session.session_id).toSorted()).toEqual(
        sessions.sessions.map((session) => session.session_id).toSorted(),
      );
      expect(metrics.counters.chat_requests).toBe(1);
      expect(metrics.counters.tool_executions).toBe(1);
      expect(diagnostics.events.length).toBe(debug.diagnostics.length);
      expect(diagnostics.events.some((event) => event.event === "chat.pipeline")).toBe(true);
      expect(diagnostics.events.some((event) => event.event === "tool.execution")).toBe(true);
      expect(debug.recent_events.some((event) => event.type === "chat.started")).toBe(true);
      expect(debug.recent_events.some((event) => event.type === "tool.execution.started")).toBe(
        true,
      );
      expect(status.service.node_id).toBe(runtime.node_id);
    } finally {
      await service.shutdown();
    }
  });

  it("supports graceful shutdown", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const service = await startMirrorService({
      port: 0,
      loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    await service.shutdown();

    expect(service.server.listening).toBe(false);
  });

  it("can be started from the Mirror CLI", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_PROVIDER_URL = "http://brain.local/v1/chat/completions";
    process.env.MIRROR_PROVIDER_AUTH_TOKEN = "token";

    let shutdown: (() => Promise<void>) | undefined;
    try {
      const output = await runMirrorCli(["mirror", "serve", "--port", "0"], {
        onServiceStarted(service) {
          shutdown = service.shutdown;
        },
      });

      expect(output).toContain("Mirror Service");
      expect(typeof shutdown).toBe("function");
    } finally {
      await shutdown?.();
    }
  });
});
