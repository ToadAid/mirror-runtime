import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { runMirrorCli } from "../mirror-cli/index.js";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import {
  loadMirrorServiceConfig,
  MIRROR_RUNTIME_WS_PATH,
  MIRROR_RUNTIME_WS_PROTOCOL,
  startMirrorService,
  type MirrorRuntimeWsEnvelope,
} from "./index.js";

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
    body: undefined as unknown,
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

async function requestJsonFromApp(
  app: { handle: (req: unknown, res: unknown) => void },
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
      app.handle(req, res);
    } catch (error) {
      reject(error);
    }
  });
}

async function openSseStreamFromApp(app: {
  handle: (req: unknown, res: unknown) => void;
}): Promise<{
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

  app.handle(req, res);

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
  return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString("utf8");
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
        message.type === type && (predicate ? predicate(message) : true),
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
        fetchImpl: vi.fn(async (_url: string, init?: RequestInit) => {
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
      const res = createMockResponse();
      await service.handlers.executeChat(
        {
          body: {
            model: "mirror-default",
            messages: [{ role: "user", content: "What happened to the patience vault?" }],
          },
        } as never,
        res as never,
      );
      const body = res.body as {
        response: { choices: Array<{ message: { content: string } }> };
      };

      expect(service.app).toBeDefined();
      expect(service.handlers).toBeDefined();
      expect(body.response.choices[0]?.message.content).toBe("Cancelled.");
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

  it("exposes sync handlers on the main service surface", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

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
        service: { node_id: string; port: number };
      };
      const status = (await requestJsonFromApp(service.app, "GET", "/mirror/status")) as {
        ok: boolean;
        product: string;
        service: { node_id: string; port: number };
      };

      expect(health.ok).toBe(true);
      expect(health.product).toBe("mirror");
      expect(health.service.node_id).toBe("health-node");
      expect(health.service.port).toBe(service.port);
      expect(status).toEqual(health);
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
        node_id: string;
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

      expect(runtime.ok).toBe(true);
      expect(runtime.node_id).toBe("runtime-node");
      expect(runtime.sessions.total).toBe(1);
      expect(sessions.sessions[0]?.session_id).toBe("session-1");
      expect(debug.runtime.node_id).toBe("runtime-node");
      expect(debug.boot_snapshot.config.node_id).toBe("runtime-node");
      expect(debug.sessions[0]?.session_id).toBe("session-1");
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
        fetchImpl: vi.fn(async (_url: string, init?: RequestInit) => {
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

    const service = await startMirrorService(
      {
        port: 0,
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
        nodeId: "events-node",
      },
      {
        fetchImpl: vi.fn(async (_url: string) => {
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
        body: {
          session_id: "runtime-chat-session",
          user_id: "alice",
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      });

      await requestJsonFromApp(service.app, "POST", "/mirror/tools/mirror.find-scroll", {
        body: {
          session_id: "runtime-tool-session",
          user_id: "alice",
          query: "patience vault",
        },
      });

      await requestJsonFromApp(service.app, "POST", "/mirror-sync/announce", {
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      const eventTypes = service.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("chat.started");
      expect(eventTypes).toContain("chat.finished");
      expect(eventTypes).toContain("provider.call.started");
      expect(eventTypes).toContain("provider.call.finished");
      expect(eventTypes).toContain("tool.execution.started");
      expect(eventTypes).toContain("tool.execution.finished");
      expect(eventTypes).toContain("sync.announce.started");
      expect(eventTypes).toContain("sync.announce.finished");
    } finally {
      await service.shutdown();
    }
  });

  it("streams /mirror/runtime/events with backlog and live request events", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

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
        body: {
          peer_id: "peer-1",
          base_url: "http://127.0.0.1:7999",
        },
      });

      const eventTypes = readSseEventTypes(stream.chunks);
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

      stream.close();
    } finally {
      await service.shutdown();
    }
  });

  it("streams /mirror/runtime/ws with backlog, live events, and protocol messages", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

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
      const ws = await openRuntimeWebSocket(service.port);
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
