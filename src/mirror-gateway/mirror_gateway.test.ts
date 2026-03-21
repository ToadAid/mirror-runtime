import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIRROR_ADAPTER_PROTOCOL,
  buildAdapterToolResponseEnvelope,
  type MirrorAdapterToolRequestEnvelope,
} from "../mirror-adapters/index.js";
import { createMirrorPolicyEngine, MirrorPolicyDeniedError } from "../mirror-policy/index.js";
import {
  buildPrimaryProviderDescriptorFromConfig,
  createMirrorProviderPlane,
  type FetchLike,
} from "../mirror-provider/index.js";
import { createMirrorGateway, createMirrorGatewayHandlers } from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
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

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-"));
  tempDirs.push(dir);
  return dir;
}

async function createTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-home-"));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
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
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# Updates\n", "utf8");
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

function createRequest(
  params: Record<string, string>,
  body: Record<string, unknown>,
  token?: string,
) {
  return {
    params,
    body,
    header(name: string) {
      if (name.toLowerCase() === "x-mirror-operator-token") {
        return token;
      }
      return undefined;
    },
  };
}

function createAdapterToolEnvelope(params: {
  toolName: string;
  input: Record<string, unknown>;
  facts?: Record<string, string>;
}): MirrorAdapterToolRequestEnvelope {
  return {
    protocol: MIRROR_ADAPTER_PROTOCOL,
    envelope_id: `env_${params.toolName}`,
    created_at: "2026-03-18T12:00:00.000Z",
    kind: "tool.request",
    context: {
      adapter: {
        adapter_id: "telegram-main",
        surface: "telegram",
        transport: "bot_api",
        capabilities: ["chat", "tool_calls", "policy_context"],
      },
      actor: {
        user_id: "traveler-1",
        external_user_id: "tg:123",
        display_name: "Traveler",
      },
      session: {
        session_id: "mirror-session-1",
        external_session_id: "telegram-chat-99",
        conversation_id: "chat-99",
        thread_id: "topic-7",
      },
      policy: {
        requested_mode: "read",
        facts: params.facts,
      },
      runtime: {
        trace_id: "trace-adapter-1",
        correlation_id: "corr-adapter-1",
      },
    },
    request: {
      tool_name: params.toolName,
      input: params.input,
    },
  };
}

function parseRequestBodyJson<T>(init?: RequestInit): T {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected JSON string request body");
  }
  return JSON.parse(body) as T;
}

describe("mirror gateway", () => {
  it("lists tools from the Mirror-owned gateway surface", () => {
    const handlers = createMirrorGateway().handlers;
    const res = createMockResponse();

    handlers.listTools({} as never, res as never);
    const body = res.body as { tools: Array<{ metadata: { name: string } }> };

    expect(res.statusCode).toBe(200);
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.commit-scroll");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.interpret-tweet");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.task.create");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.reminder.due");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.heartbeat.evaluate");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.monk.context");
    expect(body.tools.map((tool) => tool.metadata.name)).toContain("mirror.monk.note");
  });

  it("executes a read tool", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const handlers = createMirrorGateway().handlers;
    const res = createMockResponse();

    await handlers.executeTool(
      createRequest({ tool_name: "mirror.find-scroll" }, { query: "patience vault" }) as never,
      res as never,
    );

    const body = res.body as { tool: string; result: { candidates: Array<{ path: string }> } };
    expect(res.statusCode).toBe(200);
    expect(body.tool).toBe("mirror.find-scroll");
    expect(body.result.candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
  });

  it("blocks unauthorized write tools", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const handlers = createMirrorGateway().handlers;
    const res = createMockResponse();

    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.forge-scroll" },
        { title: "New Scroll", category: "L", narrative: "Renewal begins." },
      ) as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "Mirror operator authorization required",
      code: "operator_auth_required",
    });
  });

  it("applies policy evaluation at chat ingress", async () => {
    const handlers = createMirrorGateway("/mirror", {
      policy: createMirrorPolicyEngine([
        {
          name: "deny.chat",
          evaluate(input) {
            if (input.target.kind !== "chat") {
              return null;
            }
            return {
              allowed: false,
              code: "chat_blocked",
              reason: "Chat blocked by test policy",
              statusCode: 451,
              rule: "deny.chat",
            };
          },
        },
      ]),
      providerPlane: createMirrorProviderPlane([
        buildPrimaryProviderDescriptorFromConfig({
          providerUrl: "https://provider.example",
          providerAuthToken: "token",
        }),
      ]),
    }).handlers;
    const res = createMockResponse();

    await handlers.executeChat(
      createRequest(
        {},
        {
          model: "mirror-model",
          messages: [{ role: "user", content: "hello" }],
        },
      ) as never,
      res as never,
    );

    expect(res.statusCode).toBe(451);
    expect(res.body).toEqual({
      error: "Chat blocked by test policy",
      code: "chat_blocked",
    });
  });

  it("routes personal utility tools without touching canon", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-users-"));
    tempDirs.push(usersRoot);
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    const canonBefore = await fs.readFile(
      path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
      "utf8",
    );
    const handlers = createMirrorGateway().handlers;

    const createTaskRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.task.create" },
        { user_id: "alice", title: "Daily planning" },
      ) as never,
      createTaskRes as never,
    );
    expect(createTaskRes.statusCode).toBe(503);
    expect(createTaskRes.body).toEqual({
      error: "Mirror operator auth is not configured",
      code: "mutable_surface_auth_unconfigured",
    });

    const listTaskRes = createMockResponse();
    await handlers.executeTool(
      createRequest({ tool_name: "mirror.task.list" }, { user_id: "alice" }) as never,
      listTaskRes as never,
    );
    expect(listTaskRes.statusCode).toBe(200);

    const dueReminderRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.reminder.due" },
        { user_id: "alice", now: "2026-03-13T09:00:00.000Z" },
      ) as never,
      dueReminderRes as never,
    );
    expect(dueReminderRes.statusCode).toBe(200);

    const heartbeatRes = createMockResponse();
    await handlers.executeTool(
      createRequest(
        { tool_name: "mirror.heartbeat.evaluate" },
        { user_id: "alice", now: "2026-03-13T09:00:00.000Z" },
      ) as never,
      heartbeatRes as never,
    );
    expect(heartbeatRes.statusCode).toBe(200);

    const monkRes = createMockResponse();
    await handlers.executeTool(
      createRequest({ tool_name: "mirror.monk.context" }, { user_id: "alice" }) as never,
      monkRes as never,
    );
    expect(monkRes.statusCode).toBe(200);

    const canonAfter = await fs.readFile(
      path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
      "utf8",
    );
    expect(canonAfter).toBe(canonBefore);
  });

  it("blocks adapter ingress before runtime execution when adapter policy denies it", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway("/mirror", {
      policy: createMirrorPolicyEngine([
        {
          name: "deny.adapter",
          evaluate(input) {
            if (input.phase !== "adapter" || input.target.kind !== "adapter") {
              return null;
            }
            return {
              allowed: false,
              code: "adapter_blocked",
              reason: "Adapter blocked by test policy",
              statusCode: 451,
              rule: "deny.adapter",
            };
          },
        },
      ]),
    });

    await expect(
      gateway.executeAdapterRequest(
        createAdapterToolEnvelope({
          toolName: "mirror.find-scroll",
          input: { query: "patience vault" },
        }),
      ),
    ).rejects.toMatchObject({
      code: "adapter_blocked",
      statusCode: 451,
      message: "Adapter blocked by test policy",
    } satisfies Partial<MirrorPolicyDeniedError>);
  });

  it("blocks the public gateway direct chat helper when adapter policy denies it", async () => {
    await createTempHome();
    const gateway = createMirrorGateway("/mirror", {
      policy: createMirrorPolicyEngine([
        {
          name: "deny.adapter",
          evaluate(input) {
            if (input.phase !== "adapter" || input.target.kind !== "adapter") {
              return null;
            }
            return {
              allowed: false,
              code: "adapter_blocked",
              reason: "Adapter blocked by test policy",
              statusCode: 451,
              rule: "deny.adapter",
            };
          },
        },
      ]),
    });

    await expect(
      gateway.executeChat(
        {
          model: "test-model",
          session: { user_id: "user-1" },
          messages: [{ role: "user", content: "hello" }],
        },
        {
          invokeModel: async () => {
            throw new Error("invokeModel should not run");
          },
        },
      ),
    ).rejects.toMatchObject({
      code: "adapter_blocked",
      statusCode: 451,
      message: "Adapter blocked by test policy",
    } satisfies Partial<MirrorPolicyDeniedError>);
  });

  it("rejects unauthorized mutable adapter tool requests", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-users-"));
    tempDirs.push(usersRoot);
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    const gateway = createMirrorGateway();

    await expect(
      gateway.executeAdapterRequest(
        createAdapterToolEnvelope({
          toolName: "mirror.task.create",
          input: { user_id: "traveler-1", title: "Daily planning" },
        }),
      ),
    ).rejects.toMatchObject({
      code: "mutable_surface_auth_required",
      statusCode: 403,
      message: "Mirror operator authorization required",
    } satisfies Partial<MirrorPolicyDeniedError>);
  });

  it("routes exported gateway handlers through canonical mutable-surface policy", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-users-"));
    tempDirs.push(usersRoot);
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    const gateway = createMirrorGateway();
    const res = createMockResponse();

    await gateway.handlers.executeTool(
      createRequest(
        { tool_name: "mirror.task.create" },
        { user_id: "traveler-1", title: "Daily planning" },
      ) as never,
      res as never,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "Mirror operator authorization required",
      code: "mutable_surface_auth_required",
    });
  });

  it("allows authorized mutable adapter tool requests", async () => {
    await createTempHome();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-gateway-users-"));
    tempDirs.push(usersRoot);
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;
    const gateway = createMirrorGateway();

    const response = await gateway.executeAdapterRequest(
      createAdapterToolEnvelope({
        toolName: "mirror.task.create",
        input: { user_id: "traveler-1", title: "Daily planning" },
        facts: {
          mirror_operator_token: "secret",
        },
      }),
    );

    expect(response.kind).toBe("tool.response");
    if (response.kind !== "tool.response") {
      throw new Error(`Unexpected adapter response kind: ${response.kind}`);
    }
    expect(response.response.tool_name).toBe("mirror.task.create");
    expect(response.response.result).toMatchObject({
      task: {
        title: "Daily planning",
      },
    });
  });

  it("preserves read-only behavior through exported gateway handlers", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();
    const res = createMockResponse();

    await gateway.handlers.executeTool(
      createRequest({ tool_name: "mirror.find-scroll" }, { query: "patience vault" }) as never,
      res as never,
    );

    const body = res.body as { tool: string; result: { candidates: Array<{ path: string }> } };
    expect(res.statusCode).toBe(200);
    expect(body.tool).toBe("mirror.find-scroll");
    expect(body.result.candidates[0]?.path).toBe("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
  });

  it("returns 404 for unknown tools through exported gateway handlers", async () => {
    const gateway = createMirrorGateway();
    const res = createMockResponse();

    await gateway.handlers.executeTool(
      createRequest({ tool_name: "mirror.not-a-real-tool" }, {}) as never,
      res as never,
    );

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: "Unknown Mirror tool: mirror.not-a-real-tool",
    });
  });

  it("returns 400 for invalid tool input through exported gateway handlers", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();
    const res = createMockResponse();

    await gateway.handlers.executeTool(
      createRequest({ tool_name: "mirror.find-scroll" }, {}) as never,
      res as never,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: "Invalid tool input",
      details: ["missing required field: query"],
    });
  });

  it("preserves trace correlation and tool runtime event order through delegated gateway handlers", async () => {
    const runtimeEvents: Array<{ type: string; payload?: Record<string, unknown> }> = [];
    const handlers = createMirrorGatewayHandlers(undefined, {
      onRuntimeEvent(type, payload) {
        runtimeEvents.push({ type, payload });
      },
      async executeAdapterRequest(envelope) {
        if (envelope.kind !== "tool.request") {
          throw new Error(`Unexpected adapter request kind: ${envelope.kind}`);
        }
        expect(envelope.context.runtime?.trace_id).toBe("trace-tool-header");
        expect(envelope.context.session?.session_id).toBe("runtime-tool-session");
        return buildAdapterToolResponseEnvelope({
          request: envelope,
          result: {
            candidates: [{ path: "TOBY_L1219_Rune3_PatienceVaultCancelled.md" }],
            review: { status: "approved" },
          },
        });
      },
    });
    const res = createMockResponse();

    await handlers.executeTool(
      {
        params: { tool_name: "mirror.find-scroll" },
        body: {
          session_id: "runtime-tool-session",
          user_id: "alice",
          query: "patience vault",
        },
        path: "/mirror/tools/mirror.find-scroll",
        method: "POST",
        header(name: string) {
          if (name.toLowerCase() === "x-mirror-trace-id") {
            return "trace-tool-header";
          }
          return undefined;
        },
      } as never,
      res as never,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-mirror-trace-id"]).toBe("trace-tool-header");
    expect(res.body).toEqual({
      tool: "mirror.find-scroll",
      result: {
        candidates: [{ path: "TOBY_L1219_Rune3_PatienceVaultCancelled.md" }],
        review: { status: "approved" },
      },
    });
    expect(runtimeEvents.map((event) => event.type)).toEqual([
      "tool.execution.started",
      "action.execution.started",
      "review.decision",
      "tool.execution.finished",
      "action.execution.finished",
    ]);
    expect(runtimeEvents[0]?.payload).toEqual(
      expect.objectContaining({
        tool: "mirror.find-scroll",
        trace_id: "trace-tool-header",
        session_id: "runtime-tool-session",
      }),
    );
    expect(typeof runtimeEvents[0]?.payload?.action_id).toBe("string");
    expect(runtimeEvents[1]?.payload).toEqual(
      expect.objectContaining({
        action: "mirror.find-scroll",
        trace_id: "trace-tool-header",
        session_id: "runtime-tool-session",
      }),
    );
    expect(typeof runtimeEvents[1]?.payload?.execution_id).toBe("string");
    expect(runtimeEvents[2]?.payload).toEqual(
      expect.objectContaining({
        tool: "mirror.find-scroll",
        status: "approved",
        trace_id: "trace-tool-header",
        session_id: "runtime-tool-session",
      }),
    );
  });

  it("routes the public gateway direct chat helper through the canonical adapter boundary", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();

    const response = await gateway.executeChat(
      {
        model: "test-model",
        session: { user_id: "user-1" },
        messages: [{ role: "user", content: "hello" }],
      },
      {
        invokeModel: async (request) => {
          expect(request.model).toBe("test-model");
          expect(request.messages.at(-1)?.content).toBe("hello");
          return {
            id: "resp_gateway_direct_chat",
            object: "chat.completion",
            created: 1,
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "acknowledged" },
                finish_reason: "stop",
              },
            ],
          };
        },
      },
    );

    expect(response.model).toBe("test-model");
    expect(response.choices[0]?.message.content).toBe("acknowledged");
  });

  it("preserves retrieval-backed chat through the public gateway direct helper", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();

    const response = await gateway.executeChat(
      {
        model: "test-model",
        session: { user_id: "user-1" },
        messages: [{ role: "user", content: "patience vault" }],
      },
      {
        invokeModel: async (request) => {
          expect(request.messages[0]?.content).toContain("Mirror canon context:");
          return {
            id: "resp_gateway_direct_chat_retrieval",
            object: "chat.completion",
            created: 1,
            model: "test-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Cancelled." },
                finish_reason: "stop",
              },
            ],
          };
        },
      },
    );

    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });
  it("routes the public gateway chat helper through the canonical adapter path", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();
    const fetchImpl: FetchLike = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        model: string;
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.model).toBe("test-model");
      expect(body.messages.at(-1)?.content).toBe("hello");

      return {
        ok: true,
        json: async () => ({
          id: "resp_gateway_chat",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "acknowledged" },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    };

    const response = await gateway.executeChatWithProvider(
      {
        model: "test-model",
        session: { user_id: "user-1" },
        messages: [{ role: "user", content: "hello" }],
      },
      {
        provider: {
          url: "http://brain.local/v1/chat/completions",
          authToken: "token",
        },
        fetchImpl,
      },
    );

    expect(response.model).toBe("test-model");
    expect(response.choices[0]?.message.content).toBe("acknowledged");
  });

  it("preserves retrieval-backed chat through the public gateway chat helper", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();
    const fetchImpl: FetchLike = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.messages[0]?.content).toContain("Mirror canon context:");

      return {
        ok: true,
        json: async () => ({
          id: "resp_gateway_chat_retrieval",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Cancelled." },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    };

    const response = await gateway.executeChatWithProvider(
      {
        model: "test-model",
        session: { user_id: "user-1" },
        messages: [{ role: "user", content: "patience vault" }],
      },
      {
        provider: {
          url: "http://brain.local/v1/chat/completions",
          authToken: "token",
        },
        fetchImpl,
      },
    );

    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });

  it("preserves current behavior for read-only adapter tool requests", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    const gateway = createMirrorGateway();

    const response = await gateway.executeAdapterRequest(
      createAdapterToolEnvelope({
        toolName: "mirror.find-scroll",
        input: { query: "patience vault" },
      }),
    );

    expect(response.kind).toBe("tool.response");
    if (response.kind !== "tool.response") {
      throw new Error(`Unexpected adapter response kind: ${response.kind}`);
    }
    expect(response.response.tool_name).toBe("mirror.find-scroll");
    expect(response.response.result).toMatchObject({
      candidates: [{ path: "TOBY_L1219_Rune3_PatienceVaultCancelled.md" }],
    });
  });
});
