import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMirrorCli } from "../mirror-cli/index.js";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import { loadMirrorServiceConfig, startMirrorService } from "./index.js";

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
      service.syncHandlers.peers({} as never, peersRes as never);
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
