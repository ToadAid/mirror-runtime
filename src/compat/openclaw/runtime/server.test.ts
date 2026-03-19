import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeMirrorMemoryDb } from "../../../mirror-memory/db.js";
import type { FetchLike } from "../../../mirror-provider/index.js";
import { createMirrorRuntimeHost } from "../../../mirror-service/index.js";
import { createNonExitingRuntime } from "../../../runtime.js";
import { startRuntimeServer } from "./server.js";

const tempDirs: string[] = [];
const originalMirrorEnableRuntime = process.env.MIRROR_ENABLE_RUNTIME;
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
const originalMirrorUserWorkspaceDir = process.env.MIRROR_USER_WORKSPACE_DIR;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;

afterEach(async () => {
  if (originalMirrorEnableRuntime === undefined) {
    delete process.env.MIRROR_ENABLE_RUNTIME;
  } else {
    process.env.MIRROR_ENABLE_RUNTIME = originalMirrorEnableRuntime;
  }
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "compat-runtime-"));
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
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader(_name: string, _value: string) {},
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

describe("compat runtime server", () => {
  it("routes /api/brain/chat through runtimeHost.executeAdapterRequest and preserves the raw response shape", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const fetchImpl: FetchLike = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          id: "resp_compat_brain",
          object: "chat.completion",
          created: 1,
          model: "mirror-default",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Compat routed." },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    });
    const runtimeHost = await createMirrorRuntimeHost(
      {
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      { fetchImpl },
    );
    const executeAdapterRequestSpy = vi.spyOn(runtimeHost, "executeAdapterRequest");

    try {
      const app = await startRuntimeServer(
        createNonExitingRuntime(),
        "http://brain.local/v1/chat/completions",
        "token",
        { runtimeHost, fetchImpl },
      );
      const body = (await requestJsonFromApp(app, "POST", "/api/brain/chat", {
        headers: {
          "x-mirror-session-id": "sess-compat-1",
          "x-mirror-trace-id": "trace-compat-1",
        },
        body: {
          model: "mirror-default",
          user_id: "alice",
          messages: [{ role: "user", content: "What is the compat route doing now?" }],
        },
      })) as {
        id: string;
        object: string;
        model: string;
        choices: Array<{ message: { content: string } }>;
      };

      expect(body.id).toBe("resp_compat_brain");
      expect(body.object).toBe("chat.completion");
      expect(body.model).toBe("mirror-default");
      expect(body.choices[0]?.message.content).toBe("Compat routed.");
      expect(executeAdapterRequestSpy).toHaveBeenCalledTimes(1);
      expect(executeAdapterRequestSpy.mock.calls[0]?.[0]).toMatchObject({
        kind: "chat.request",
        context: {
          adapter: {
            adapter_id: "mirror-compat-brain-http",
            surface: "service",
            transport: "http",
          },
          actor: {
            user_id: "alice",
          },
          session: {
            session_id: "sess-compat-1",
          },
          runtime: {
            trace_id: "trace-compat-1",
          },
        },
      });
    } finally {
      await runtimeHost.shutdown();
    }
  });
  it("routes /mirror/chat through runtimeHost.executeAdapterRequest and preserves response shape", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const fetchImpl: FetchLike = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          id: "resp_compat_chat",
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
    });
    const runtimeHost = await createMirrorRuntimeHost(
      {
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      { fetchImpl },
    );
    const executeAdapterRequestSpy = vi.spyOn(runtimeHost, "executeAdapterRequest");

    try {
      const app = await startRuntimeServer(
        createNonExitingRuntime(),
        "http://brain.local/v1/chat/completions",
        "token",
        { runtimeHost },
      );
      const body = (await requestJsonFromApp(app, "POST", "/mirror/chat", {
        body: {
          model: "mirror-default",
          messages: [{ role: "user", content: "What happened to the patience vault?" }],
        },
      })) as { response: { choices: Array<{ message: { content: string } }> } };

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
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves /mirror/tools/:tool_name response shape through adapter-backed routing", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    try {
      const app = await startRuntimeServer(createNonExitingRuntime(), undefined, undefined, {
        runtimeHost,
      });
      const body = (await requestJsonFromApp(app, "POST", "/mirror/tools/mirror.find-scroll", {
        body: {
          query: "patience vault",
        },
      })) as { tool: string; result: { candidates: Array<{ path: string }> } };

      expect(body.tool).toBe("mirror.find-scroll");
      expect(body.result.candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves unauthorized mutable tool rejection through adapter-backed routing", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const loreDir = await createTempLoreDir();
    const usersRoot = await createTempLoreDir();
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    try {
      const app = await startRuntimeServer(createNonExitingRuntime(), undefined, undefined, {
        runtimeHost,
      });
      const response = await requestResponseFromApp(
        app,
        "POST",
        "/mirror/tools/mirror.task.create",
        {
          body: {
            user_id: "alice",
            title: "Daily planning",
          },
        },
      );

      expect(response.statusCode).toBe(403);
      expect(response.body).toEqual({
        error: "Mirror operator authorization required",
        code: "mutable_surface_auth_required",
      });
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves missing brainUrl 400 behavior for /api/brain/chat", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    const executeAdapterRequestSpy = vi.spyOn(runtimeHost, "executeAdapterRequest");
    try {
      const app = await startRuntimeServer(createNonExitingRuntime(), undefined, "token", {
        runtimeHost,
      });
      const response = await requestResponseFromApp(app, "POST", "/api/brain/chat", {
        body: {
          model: "mirror-default",
          messages: [{ role: "user", content: "Missing brain url request." }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({ error: "brainUrl not configured" });
      expect(executeAdapterRequestSpy).not.toHaveBeenCalled();
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves missing authToken 400 behavior for /api/brain/chat", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    const executeAdapterRequestSpy = vi.spyOn(runtimeHost, "executeAdapterRequest");
    try {
      const app = await startRuntimeServer(
        createNonExitingRuntime(),
        "http://brain.local/v1/chat/completions",
        undefined,
        { runtimeHost },
      );
      const response = await requestResponseFromApp(app, "POST", "/api/brain/chat", {
        body: {
          model: "mirror-default",
          messages: [{ role: "user", content: "Missing auth token request." }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({ error: "authToken not configured" });
      expect(executeAdapterRequestSpy).not.toHaveBeenCalled();
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves replay protection for duplicate /api/brain/chat requests", async () => {
    process.env.MIRROR_ENABLE_RUNTIME = "true";
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const fetchImpl: FetchLike = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          id: "resp_replay_guard",
          object: "chat.completion",
          created: 1,
          model: "mirror-default",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "First request accepted." },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    });
    const runtimeHost = await createMirrorRuntimeHost(
      {
        loreDir,
        providerUrl: "http://brain.local/v1/chat/completions",
        providerAuthToken: "token",
      },
      { fetchImpl },
    );
    const executeAdapterRequestSpy = vi.spyOn(runtimeHost, "executeAdapterRequest");
    try {
      const app = await startRuntimeServer(
        createNonExitingRuntime(),
        "http://brain.local/v1/chat/completions",
        "token",
        { runtimeHost, fetchImpl },
      );
      const requestBody = {
        model: "mirror-default",
        messages: [{ role: "user", content: "Repeat this compat brain request exactly once." }],
      };

      const firstResponse = (await requestJsonFromApp(app, "POST", "/api/brain/chat", {
        body: requestBody,
      })) as { choices: Array<{ message: { content: string } }> };
      const secondResponse = await requestResponseFromApp(app, "POST", "/api/brain/chat", {
        body: requestBody,
      });

      expect(firstResponse.choices[0]?.message.content).toBe("First request accepted.");
      expect(secondResponse.statusCode).toBe(500);
      expect(secondResponse.body).toEqual({
        error: "Error: duplicate nonce detected (replay protection)",
      });
      expect(executeAdapterRequestSpy).toHaveBeenCalledTimes(1);
    } finally {
      await runtimeHost.shutdown();
    }
  });
});
