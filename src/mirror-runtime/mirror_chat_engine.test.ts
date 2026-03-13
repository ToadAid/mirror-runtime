import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMirrorGateway } from "../mirror-gateway/index.js";
import { closeMirrorMemoryDb, initMirrorMemoryDb } from "../mirror-memory/db.js";
import {
  addObservation,
  addRetrievalHistory,
  upsertUserReflection,
} from "../mirror-memory/repository.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import {
  executeMirrorChatRequest,
  executeMirrorChatWithProvider,
  prepareMirrorChatRequest,
} from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;
const originalLogLevel = process.env.MIRROR_LOG_LEVEL;

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
  if (originalLogLevel === undefined) {
    delete process.env.MIRROR_LOG_LEVEL;
  } else {
    process.env.MIRROR_LOG_LEVEL = originalLogLevel;
  }

  closeMirrorMemoryDb();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-chat-engine-"));
  tempDirs.push(dir);
  return dir;
}

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    "# Rune3 Patience Vault Cancelled\n\nThe Patience Vault was cancelled.\n",
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

describe("mirror chat engine", () => {
  it("accepts a normalized request and produces a model-facing payload", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const prepared = await prepareMirrorChatRequest({
      model: "test-model",
      messages: [{ role: "user", content: "What happened to the patience vault?" }],
    });

    expect(prepared.modelRequest.model).toBe("test-model");
    expect(prepared.modelRequest.messages[0]?.role).toBe("system");
    expect(prepared.modelRequest.messages[0]?.content).toContain("Mirror canon context:");
    expect(prepared.modelRequest.messages.at(-1)?.content).toBe(
      "What happened to the patience vault?",
    );
  });

  it("assembles canon context through the existing retrieval core", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const prepared = await prepareMirrorChatRequest({
      model: "test-model",
      messages: [{ role: "user", content: "patience vault" }],
    });

    expect(prepared.modelRequest.messages[0]?.content).toContain(
      "TOBY_L1219_Rune3_PatienceVaultCancelled.md",
    );
    expect(prepared.modelRequest.messages[0]?.content).toContain(
      "The Patience Vault was cancelled.",
    );
  });

  it("appends memory context after canon context", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const dbDir = await createTempLoreDir();
    const dbPath = path.join(dbDir, "mirror-memory.sqlite");
    process.env.MIRROR_MEMORY_DB_PATH = dbPath;
    const db = initMirrorMemoryDb({ path: dbPath });
    addObservation(
      {
        source_type: "manual",
        topic: "patience vault",
        content: "Traveler note: the Patience Vault still exists.",
        confidence: 0.3,
      },
      db,
    );
    upsertUserReflection(
      {
        user_id: "user-1",
        recurring_topics: "patience, vault",
        notes: "This user often asks about Rune3.",
      },
      db,
    );
    addRetrievalHistory(
      {
        user_id: "user-1",
        question: "What happened to the patience vault?",
        answer_summary: "Earlier answer referenced Rune3 cancellation.",
        referenced_scrolls: ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
        referenced_observation_ids: [1],
      },
      db,
    );

    const prepared = await prepareMirrorChatRequest({
      model: "test-model",
      user_id: "user-1",
      messages: [{ role: "user", content: "What happened to the patience vault?" }],
    });

    const prompt = prepared.modelRequest.messages[0]?.content ?? "";
    const canonIndex = prompt.indexOf("[CANON_SCROLL]");
    const memoryIndex = prompt.indexOf("Secondary Context (Observations):");

    expect(canonIndex).toBeGreaterThanOrEqual(0);
    expect(memoryIndex).toBeGreaterThan(canonIndex);
    expect(prompt).toContain("Traveler note: the Patience Vault still exists.");
  });

  it("executes through the provider boundary without OpenClaw-specific request types", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const invokeModel = vi.fn(async (request) => ({
      id: "resp_1",
      object: "chat.completion",
      created: 1,
      model: request.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: "Cancelled." },
          finish_reason: "stop",
        },
      ],
    }));

    const response = await executeMirrorChatRequest(
      {
        model: "test-model",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
      { invokeModel },
    );

    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });

  it("can execute through the Mirror provider runtime", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        model: string;
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.model).toBe("test-model");
      expect(body.messages[0]?.content).toContain("Mirror canon context:");

      return {
        ok: true,
        json: async () => ({
          id: "resp_provider",
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
    });

    const response = await executeMirrorChatWithProvider(
      {
        model: "test-model",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
      {
        provider: {
          url: "http://brain.local/v1/chat/completions",
          authToken: "token",
        },
        fetchImpl,
      },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });

  it("can be called from the Mirror gateway directly", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const gateway = createMirrorGateway();
    const invokeModel = vi.fn(async (request) => ({
      id: "resp_2",
      object: "chat.completion",
      created: 1,
      model: request.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant" as const, content: "Cancelled." },
          finish_reason: "stop",
        },
      ],
    }));

    const response = await gateway.executeChat(
      {
        model: "test-model",
        session: { user_id: "user-1" },
        messages: [{ role: "user", content: "patience vault" }],
      },
      { invokeModel },
    );

    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });

  it("can be called from the Mirror gateway through the provider runtime", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const gateway = createMirrorGateway();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.messages[0]?.content).toContain("Mirror canon context:");

      return {
        ok: true,
        json: async () => ({
          id: "resp_gateway_provider",
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
    });

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

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });
});
