import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startMirrorService, type MirrorService } from "../mirror-service/index.js";
import { parseRequestBodyJson } from "../test/request_init.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
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
  if (originalMirrorUserWorkspaceDir === undefined) {
    delete process.env.MIRROR_USER_WORKSPACE_DIR;
  } else {
    process.env.MIRROR_USER_WORKSPACE_DIR = originalMirrorUserWorkspaceDir;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-console-"));
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
      "epoch: E3",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Rune3 Patience Vault Cancelled",
      "",
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(loreDir, "TOBY_L0001_SeedOfStillness.md"),
    [
      "---",
      "title: Seed Of Stillness",
      "epoch: E1",
      "symbols: [🌅, 🌊]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Seed Of Stillness",
      "",
      "Renewal begins in stillness beside the pond at sunrise.",
      "Reference: TOBY_L1219_Rune3_PatienceVaultCancelled.md",
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
  await fs.writeFile(
    path.join(indexDir, "SUPERSEDES.json"),
    JSON.stringify(
      {
        "TOBY_L1219_Rune3_PatienceVaultCancelled.md": {
          supersedes_topics: ["renewal"],
          notes: "Use this scroll when answering Patience Vault questions.",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    type(value: string) {
      this.headers["content-type"] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

async function startConsoleHarness(params: {
  loreDir: string;
  fetchImpl?: typeof fetch;
}): Promise<MirrorService> {
  return startMirrorService(
    {
      port: 0,
      loreDir: params.loreDir,
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    },
    {
      fetchImpl: params.fetchImpl,
    },
  );
}

describe("mirror web console", () => {
  it("loads the console HTML", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const res = createMockResponse();
      consoleServer.consoleHandlers.loadConsole({} as never, res as never);

      expect(String(res.body)).toContain("Mirror Console");
      expect(String(res.body)).toContain("Ask Mirror");
      expect(String(res.body)).toContain("Tasks");
      expect(String(res.body)).toContain("Reminders");
      expect(String(res.body)).toContain("Heartbeat");
      expect(String(res.body)).toContain("Monk Assistance");
      expect(String(res.body)).toContain("Sync");
      expect(String(res.body)).toContain("Operations");
      expect(String(res.body)).toContain("/mirror/console/api/tools/");
      expect(String(res.body)).toContain("/mirror/console/api/sync/peers");
      expect(String(res.body)).toContain("/mirror/console/api/ops/metrics");
      expect(String(res.body)).toContain("/mirror/console/api/graph/related");
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("routes chat through the console API", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const consoleServer = await startConsoleHarness({
      loreDir,
      fetchImpl: vi.fn(async (_url: string, init?: RequestInit) => {
        const body = parseRequestBodyJson<{ messages: Array<{ content: string }> }>(init);
        expect(body.messages[0]?.content).toContain("Mirror canon context:");
        return {
          ok: true,
          json: async () => ({
            id: "resp_console",
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
    });

    try {
      const res = createMockResponse();
      await consoleServer.consoleHandlers.executeChat(
        {
          body: {
            model: "mirror-default",
            messages: [{ role: "user", content: "What happened to the patience vault?" }],
          },
        } as never,
        res as never,
      );

      const body = res.body as { response: { choices: Array<{ message: { content: string } }> } };
      expect(body.response.choices[0]?.message.content).toBe("Cancelled.");
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("routes tool execution through the console API", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const res = createMockResponse();
      await consoleServer.consoleHandlers.executeTool(
        {
          params: { tool_name: "mirror.find-scroll" },
          body: { query: "patience vault" },
          header: () => undefined,
        } as never,
        res as never,
      );
      const body = res.body as { tool: string };

      expect(body.tool).toBe("mirror.find-scroll");
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("routes personal utility tools through the console API", async () => {
    const loreDir = await createTempLoreDir();
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-console-users-"));
    tempDirs.push(usersRoot);
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const createTaskRes = createMockResponse();
      await consoleServer.consoleHandlers.executeTool(
        {
          params: { tool_name: "mirror.task.create" },
          body: { user_id: "alice", title: "Check reminders" },
          header: () => undefined,
        } as never,
        createTaskRes as never,
      );

      const evalRes = createMockResponse();
      await consoleServer.consoleHandlers.executeTool(
        {
          params: { tool_name: "mirror.heartbeat.evaluate" },
          body: { user_id: "alice", now: "2026-03-13T09:00:00.000Z" },
          header: () => undefined,
        } as never,
        evalRes as never,
      );

      const body = evalRes.body as { result: { suggested_message: string } };
      expect(createTaskRes.statusCode).toBe(200);
      expect(evalRes.statusCode).toBe(200);
      expect(body.result.suggested_message).toContain("checking in");
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("routes Monk assistance tools through the console API", async () => {
    const loreDir = await createTempLoreDir();
    const usersRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-console-monk-users-"));
    tempDirs.push(usersRoot);
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_USER_WORKSPACE_DIR = usersRoot;

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const contextRes = createMockResponse();
      await consoleServer.consoleHandlers.executeTool(
        {
          params: { tool_name: "mirror.monk.context" },
          body: { user_id: "alice" },
          header: () => undefined,
        } as never,
        contextRes as never,
      );
      const noteRes = createMockResponse();
      await consoleServer.consoleHandlers.executeTool(
        {
          params: { tool_name: "mirror.monk.note" },
          body: { user_id: "alice", note: "Follow up on the next task." },
          header: () => undefined,
        } as never,
        noteRes as never,
      );
      const body = noteRes.body as { result: { note: { content: string } } };

      expect(contextRes.statusCode).toBe(200);
      expect(noteRes.statusCode).toBe(200);
      expect(body.result.note.content).toContain("Monk follow-up");
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("renders graph query results", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const relatedRes = createMockResponse();
      await consoleServer.consoleHandlers.relatedScrolls(
        { query: { scroll: "TOBY_L1219" } } as never,
        relatedRes as never,
      );
      const relatedBody = relatedRes.body as { related_scrolls: string[] };
      expect(relatedBody.related_scrolls).toContain("TOBY_L0001_SeedOfStillness.md");

      const chainRes = createMockResponse();
      await consoleServer.consoleHandlers.supersessionChains(
        { query: { scroll: "TOBY_L1219" } } as never,
        chainRes as never,
      );
      const chainBody = chainRes.body as { chain: string[] };
      expect(Array.isArray(chainBody.chain)).toBe(true);
    } finally {
      await consoleServer.shutdown();
    }
  });

  it("routes sync and ops endpoints through the console API", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const consoleServer = await startConsoleHarness({ loreDir });

    try {
      const announceRes = createMockResponse();
      await consoleServer.consoleHandlers.syncPull(
        {
          body: { base_url: "http://127.0.0.1:7999" },
        } as never,
        announceRes as never,
      );
      expect(announceRes.statusCode).toBe(500);

      const peersRes = createMockResponse();
      await consoleServer.consoleHandlers.syncPeers({} as never, peersRes as never);
      expect(Array.isArray((peersRes.body as { peers: unknown[] }).peers)).toBe(true);

      const metricsRes = createMockResponse();
      consoleServer.consoleHandlers.metrics({} as never, metricsRes as never);
      expect((metricsRes.body as { counters: Record<string, number> }).counters).toBeDefined();

      const healthRes = createMockResponse();
      consoleServer.consoleHandlers.health({} as never, healthRes as never);
      expect((healthRes.body as { ok: boolean; product: string }).ok).toBe(true);
      expect((healthRes.body as { ok: boolean; product: string }).product).toBe("mirror");
    } finally {
      await consoleServer.shutdown();
    }
  });
});
