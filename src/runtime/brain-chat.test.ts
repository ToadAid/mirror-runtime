import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompatChatRequest } from "../compat/openclaw/runtime/brain_chat_compat.js";
import { closeMirrorMemoryDb, initMirrorMemoryDb } from "../mirror-memory/db.js";
import {
  addObservation,
  addRetrievalHistory,
  upsertUserReflection,
} from "../mirror-memory/repository.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import { handleBrainChatEndpoint } from "./brain-chat.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalLogLevel = process.env.OPENCLAW_LOG_LEVEL;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;

afterEach(async () => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }

  if (originalLogLevel === undefined) {
    delete process.env.OPENCLAW_LOG_LEVEL;
  } else {
    process.env.OPENCLAW_LOG_LEVEL = originalLogLevel;
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-brain-chat-"));
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

describe("handleBrainChatEndpoint", () => {
  it("injects canonical retrieval context into the outbound model prompt", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const fetchImpl: typeof fetch = vi.fn(async (_url, init) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.messages[0]?.role).toBe("system");
      expect(body.messages[0]?.content).toContain("Mirror canon context:");
      expect(body.messages[0]?.content).toContain("TOBY_L1219_Rune3_PatienceVaultCancelled.md");
      expect(body.messages[0]?.content).toContain("The Patience Vault was cancelled.");
      expect(body.messages.at(-1)?.content).toBe("What happened to the patience vault?");

      return {
        ok: true,
        json: async () => ({
          id: "resp_1",
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
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as Response;
    });

    const response = await handleBrainChatEndpoint(
      { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
      "http://brain.local/v1/chat/completions",
      "token",
      {
        model: "test-model",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.choices[0]?.message.content).toBe("Cancelled.");
  });

  it("includes retrieval diagnostics in debug mode only", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.OPENCLAW_LOG_LEVEL = "debug";

    const fetchImpl: typeof fetch = vi.fn(async (_url, init) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);

      expect(body.messages[0]?.content).toContain("[RETRIEVAL_DIAGNOSTICS]");

      return {
        ok: true,
        json: async () => ({
          id: "resp_2",
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

    await handleBrainChatEndpoint(
      { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
      "http://brain.local/v1/chat/completions",
      "token",
      {
        model: "test-model",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("places conflicting memory observations after canon context", async () => {
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

    const fetchImpl: typeof fetch = vi.fn(async (_url, init) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);
      const prompt = body.messages[0]?.content ?? "";
      const canonIndex = prompt.indexOf("[CANON_SCROLL]");
      const memoryIndex = prompt.indexOf("Secondary Context (Observations):");

      expect(canonIndex).toBeGreaterThanOrEqual(0);
      expect(memoryIndex).toBeGreaterThan(canonIndex);
      expect(prompt).toContain("The Patience Vault was cancelled.");
      expect(prompt).toContain("Traveler note: the Patience Vault still exists.");
      expect(prompt).toContain("the canon scrolls win");

      return {
        ok: true,
        json: async () => ({
          id: "resp_3",
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

    await handleBrainChatEndpoint(
      { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
      "http://brain.local/v1/chat/completions",
      "token",
      {
        model: "test-model",
        user_id: "user-1",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("preserves replay protection through the adapter-backed compat path", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;

    const fetchImpl: typeof fetch = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          id: "resp_replay",
          object: "chat.completion",
          created: 1,
          model: "test-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "First answer only." },
              finish_reason: "stop",
            },
          ],
        }),
      } as Response;
    });
    const request: CompatChatRequest = {
      model: "test-model",
      messages: [{ role: "user", content: "Repeat this request exactly once." }],
    };

    const first = await handleBrainChatEndpoint(
      { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
      "http://brain.local/v1/chat/completions",
      "token",
      request,
      { fetchImpl },
    );

    await expect(
      handleBrainChatEndpoint(
        { log: vi.fn(), error: vi.fn(), exit: vi.fn() },
        "http://brain.local/v1/chat/completions",
        "token",
        request,
        { fetchImpl },
      ),
    ).rejects.toThrow("duplicate nonce detected (replay protection)");

    expect(first.choices[0]?.message.content).toBe("First answer only.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
