import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIRROR_ADAPTER_PROTOCOL,
  type MirrorAdapterToolRequestEnvelope,
} from "../mirror-adapters/index.js";
import type { MirrorPolicyEvaluationInput } from "../mirror-policy/index.js";
import type { FetchLike } from "../mirror-provider/index.js";
import { createMirrorRuntimeHost } from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }
  if (originalMirrorMemoryDbPath === undefined) {
    delete process.env.MIRROR_MEMORY_DB_PATH;
  } else {
    process.env.MIRROR_MEMORY_DB_PATH = originalMirrorMemoryDbPath;
  }
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-host-home-"));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-host-lore-"));
  tempDirs.push(dir);
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
      "---",
      "",
      "# Rune3",
      "",
      "The vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify({ "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"] }, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# Updates\n", "utf8");
}

function createAdapterEnvelope(): MirrorAdapterToolRequestEnvelope {
  return {
    protocol: MIRROR_ADAPTER_PROTOCOL,
    envelope_id: "env_host_tool_1",
    created_at: "2026-03-18T12:00:00.000Z",
    kind: "tool.request",
    context: {
      adapter: {
        adapter_id: "telegram-main",
        surface: "telegram",
        transport: "bot_api",
        capabilities: ["chat", "tool_calls"],
      },
      actor: {
        user_id: "traveler-1",
      },
      session: {
        session_id: "mirror-session-1",
      },
      runtime: {
        trace_id: "trace-host-adapter-1",
      },
    },
    request: {
      tool_name: "mirror.find-scroll",
      input: {
        query: "patience vault",
      },
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

describe("mirror runtime host adapter boundary", () => {
  it("routes adapter requests through the canonical gateway boundary", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    try {
      const response = await runtimeHost.executeAdapterRequest(createAdapterEnvelope());

      expect(response.kind).toBe("tool.response");
      if (response.kind !== "tool.response") {
        throw new Error(`Unexpected adapter response kind: ${response.kind}`);
      }
      expect(response.response.tool_name).toBe("mirror.find-scroll");
      expect(response.response.result).toMatchObject({
        candidates: [{ path: "TOBY_L1219_Rune3_PatienceVaultCancelled.md" }],
      });
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("routes the public chat helper through the canonical adapter path", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
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
          id: "resp_runtime_host_chat",
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

    const runtimeHost = await createMirrorRuntimeHost({ loreDir }, { fetchImpl });
    try {
      const response = await runtimeHost.executeChatWithProvider(
        {
          model: "test-model",
          session: { user_id: "traveler-1" },
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
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves canon retrieval when the public chat helper uses the adapter path", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const fetchImpl: FetchLike = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.messages[0]?.content).toContain("Mirror canon context:");

      return {
        ok: true,
        json: async () => ({
          id: "resp_runtime_host_chat_canon",
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

    const runtimeHost = await createMirrorRuntimeHost({ loreDir }, { fetchImpl });
    try {
      const response = await runtimeHost.executeChatWithProvider(
        {
          model: "test-model",
          session: { user_id: "traveler-1" },
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
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves runtime host tool policy denial events and session metadata", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    const evaluate = vi.fn(async (_input: MirrorPolicyEvaluationInput) => ({
      allowed: false as const,
      decision: {
        allowed: false,
        code: "tool_blocked",
        reason: "denied",
        statusCode: 451,
      },
      evaluations: [],
    }));
    runtimeHost.gateway.policy.evaluate = evaluate;

    try {
      await expect(
        runtimeHost.executeTool(
          "mirror.find-scroll",
          { query: "patience vault" },
          {
            user_id: "traveler-1",
          },
        ),
      ).rejects.toThrow("denied");

      expect(evaluate).toHaveBeenCalledTimes(1);
      const policyCall = evaluate.mock.calls[0];
      const policyInput = policyCall?.[0];
      expect(policyInput).toBeDefined();
      if (!policyInput) {
        throw new Error("Expected policy evaluation input");
      }
      expect(policyInput).toMatchObject({
        phase: "action",
        target: {
          kind: "action",
          action_name: "mirror.find-scroll",
          input: { query: "patience vault" },
        },
        context: {
          surface: "cli",
          command: "tool",
          actor: {
            user_id: "traveler-1",
          },
          metadata: {
            tool: "mirror.find-scroll",
            trace_id: expect.any(String),
          },
        },
      });
      const session = policyInput.context.session;
      expect(session).toBeDefined();
      if (!session) {
        throw new Error("Expected policy session context");
      }
      expect(session.session_id).toEqual(expect.any(String));

      const eventTypes = runtimeHost.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("policy.denied");
      expect(eventTypes).toContain("tool.execution.failed");
      expect(eventTypes).not.toContain("action.execution.started");

      const deniedEvent = runtimeHost.daemon
        .getRecentEvents()
        .find((event) => event.type === "policy.denied");
      expect(deniedEvent?.payload).toEqual(
        expect.objectContaining({
          phase: "action",
          target: "action",
          action: "mirror.find-scroll",
          code: "tool_blocked",
        }),
      );

      const daemonSession = runtimeHost.daemon
        .listSessions()
        .find(
          (entry) =>
            entry.user_id === "traveler-1" && entry.metadata?.tool === "mirror.find-scroll",
        );
      expect(daemonSession).toBeDefined();
      expect(daemonSession).toMatchObject({
        user_id: "traveler-1",
        metadata: {
          surface: "cli",
          command: "tool",
          tool: "mirror.find-scroll",
        },
      });
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("preserves runtime sync policy denial events and session metadata", async () => {
    await createTempHome();
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });
    const evaluate = vi.fn(async (_input: MirrorPolicyEvaluationInput) => ({
      allowed: false as const,
      decision: {
        allowed: false,
        code: "operator_auth_required",
        reason: "denied",
        statusCode: 403,
      },
      evaluations: [],
    }));
    runtimeHost.gateway.policy.evaluate = evaluate;

    try {
      await expect(
        runtimeHost.executeSyncAction(
          "peers",
          {},
          {
            user_id: "traveler-1",
          },
        ),
      ).rejects.toThrow("denied");

      expect(evaluate).toHaveBeenCalledTimes(1);
      const policyCall = evaluate.mock.calls[0];
      const policyInput = policyCall?.[0];
      expect(policyInput).toBeDefined();
      if (!policyInput) {
        throw new Error("Expected policy evaluation input");
      }
      expect(policyInput).toMatchObject({
        phase: "action",
        target: {
          kind: "action",
          action_name: "sync.peers",
          input: {},
        },
        context: {
          surface: "cli",
          command: "sync",
          actor: {
            user_id: "traveler-1",
          },
          metadata: {
            action: "peers",
            trace_id: expect.any(String),
          },
        },
      });
      const session = policyInput.context.session;
      expect(session).toBeDefined();
      if (!session) {
        throw new Error("Expected policy session context");
      }
      expect(session.session_id).toEqual(expect.any(String));

      const eventTypes = runtimeHost.daemon.getRecentEvents().map((event) => event.type);
      expect(eventTypes).toContain("policy.denied");
      expect(eventTypes).toContain("sync.action.failed");
      expect(eventTypes).toContain("sync.action.finished");
      expect(eventTypes).not.toContain("sync.action.started");

      const daemonSession = runtimeHost.daemon
        .listSessions()
        .find((entry) => entry.user_id === "traveler-1");
      expect(daemonSession).toBeDefined();
      expect(daemonSession).toMatchObject({
        user_id: "traveler-1",
        metadata: {
          surface: "cli",
          command: "sync",
          action: "peers",
        },
      });
    } finally {
      await runtimeHost.shutdown();
    }
  });
});
