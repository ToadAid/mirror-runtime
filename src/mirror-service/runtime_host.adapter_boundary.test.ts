import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MIRROR_ADAPTER_PROTOCOL,
  type MirrorAdapterToolRequestEnvelope,
} from "../mirror-adapters/index.js";
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
});
