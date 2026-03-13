import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { createMirrorRuntimeHost } from "../mirror-service/index.js";
import { sha256File } from "../mirror/lore_manifest/hash.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import { runMirrorCli } from "./index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorOperatorToken = process.env.MIRROR_OPERATOR_TOKEN;
const originalMirrorProviderUrl = process.env.MIRROR_PROVIDER_URL;
const originalMirrorProviderAuthToken = process.env.MIRROR_PROVIDER_AUTH_TOKEN;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;
const originalMirrorUserWorkspaceDir = process.env.MIRROR_USER_WORKSPACE_DIR;
const originalMirrorUserId = process.env.MIRROR_USER_ID;

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
  closeMirrorMemoryDb();
  if (originalMirrorMemoryDbPath === undefined) {
    delete process.env.MIRROR_MEMORY_DB_PATH;
  } else {
    process.env.MIRROR_MEMORY_DB_PATH = originalMirrorMemoryDbPath;
  }
  if (originalMirrorUserWorkspaceDir === undefined) {
    delete process.env.MIRROR_USER_WORKSPACE_DIR;
  } else {
    process.env.MIRROR_USER_WORKSPACE_DIR = originalMirrorUserWorkspaceDir;
  }
  if (originalMirrorUserId === undefined) {
    delete process.env.MIRROR_USER_ID;
  } else {
    process.env.MIRROR_USER_ID = originalMirrorUserId;
  }

  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-cli-"));
  tempDirs.push(dir);
  return dir;
}

async function createTempMemoryDbPath(): Promise<string> {
  const dir = await createTempLoreDir();
  return path.join(dir, "mirror-memory.sqlite");
}

async function createTempWorkspaceUsersRoot(): Promise<string> {
  const dir = await createTempLoreDir();
  return path.join(dir, "users");
}

async function writeLoreManifestFixture(dir: string): Promise<{
  manifestPath: string;
  canonicalDir: string;
}> {
  const canonicalDir = path.join(dir, "canonical");
  await fs.mkdir(canonicalDir, { recursive: true });
  const scrollPath = path.join(canonicalDir, "TOBY_L001.md");
  await fs.writeFile(scrollPath, "alpha\n", "utf8");
  const manifestPath = path.join(dir, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: "2026-03-13",
        canonicalDir: "canonical",
        scrolls: [{ path: "TOBY_L001.md", sha256: await sha256File(scrollPath) }],
      },
      null,
      2,
    ),
    "utf8",
  );
  return { manifestPath, canonicalDir };
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
      "The Patience Vault was cancelled at Rune3.",
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

describe("mirror cli", () => {
  it("routes chat through the Mirror chat engine and provider runtime", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_PROVIDER_URL = "http://brain.local/v1/chat/completions";
    process.env.MIRROR_PROVIDER_AUTH_TOKEN = "token";

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBodyJson<{
        messages: Array<{ role: string; content: string }>;
      }>(init);
      expect(body.messages[0]?.content).toContain("Mirror canon context:");
      return {
        ok: true,
        json: async () => ({
          id: "resp_cli",
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

    const output = await runMirrorCli(["mirror", "chat", "What happened to the patience vault?"], {
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(output).toContain("Mirror Chat");
    expect(output).toContain("Cancelled.");
  });

  it("supports read commands for find and fact", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const findOutput = await runMirrorCli(["mirror", "find", "patience vault"]);
    const factOutput = await runMirrorCli(["mirror", "fact", "patience vault"]);

    expect(findOutput).toContain("mirror.find-scroll");
    expect(factOutput).toContain("mirror.canon-fact");
  });

  it("requires operator auth for write-capable commands", async () => {
    await expect(
      runMirrorCli(["mirror", "interpret", "At sunrise the pond remembers renewal."]),
    ).rejects.toThrow("Mirror operator auth is not configured");
  });

  it("supports JSON output mode", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const output = await runMirrorCli(["mirror", "find", "patience vault", "--json"]);
    const parsed = JSON.parse(output) as {
      ok: boolean;
      command: string;
      results: unknown[];
      diagnostics: object;
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("find");
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(typeof parsed.diagnostics).toBe("object");
  });

  it("does not depend on OpenClaw-specific shell structures", async () => {
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const output = await runMirrorCli([
      "forge",
      "--title",
      "Quiet Pond",
      "--family",
      "L",
      "Renewal begins at sunrise.",
      "--json",
    ]);
    const parsed = JSON.parse(output) as {
      ok: boolean;
      command: string;
      draft: { filename: string };
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe("forge");
    expect(parsed.draft.filename).toContain("TOBY_L0000");
  });

  it("returns stable JSON shapes for chat, fact, interpret, commit, and serve", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_PROVIDER_URL = "http://brain.local/v1/chat/completions";
    process.env.MIRROR_PROVIDER_AUTH_TOKEN = "token";
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const chatOutput = await runMirrorCli(
      ["mirror", "chat", "What happened to the patience vault?", "--json"],
      {
        fetchImpl: vi.fn(
          async () =>
            ({
              ok: true,
              json: async () => ({
                id: "resp_cli",
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
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
              }),
            }) as Response,
        ),
      },
    );
    const chatParsed = JSON.parse(chatOutput) as {
      ok: boolean;
      command: string;
      response: string;
      model: string;
      usage: { total_tokens: number };
    };
    expect(chatParsed).toMatchObject({
      ok: true,
      command: "chat",
      response: "Cancelled.",
      model: "mirror-default",
    });
    expect(chatParsed.usage.total_tokens).toBe(2);

    const factOutput = await runMirrorCli(["mirror", "fact", "patience vault", "--json"]);
    const factParsed = JSON.parse(factOutput) as {
      ok: boolean;
      command: string;
      canonical_fact: string;
      source: { path: string };
    };
    expect(factParsed.ok).toBe(true);
    expect(factParsed.command).toBe("fact");
    expect(factParsed.canonical_fact.length).toBeGreaterThan(0);
    expect(factParsed.source.path).toContain("TOBY_L1219");

    const interpretOutput = await runMirrorCli([
      "mirror",
      "interpret",
      "At sunrise the pond remembers renewal.",
      "--json",
      "--operator-token",
      "secret",
    ]);
    const interpretParsed = JSON.parse(interpretOutput) as {
      ok: boolean;
      command: string;
      interpretation: { suggested_title: string };
    };
    expect(interpretParsed.ok).toBe(true);
    expect(interpretParsed.command).toBe("interpret");
    expect(interpretParsed.interpretation.suggested_title.length).toBeGreaterThan(0);

    const commitOutput = await runMirrorCli([
      "mirror",
      "commit",
      [
        "---",
        "title: Quiet Pond",
        "epoch: E1",
        "symbols: [♾️]",
        "sacred_numbers: [3]",
        "sha256_seed: TBD",
        "---",
        "",
        "# Quiet Pond",
        "",
        "Renewal begins at sunrise.",
      ].join("\n"),
      "--family",
      "L",
      "--dry-run",
      "--json",
      "--operator-token",
      "secret",
    ]);
    const commitParsed = JSON.parse(commitOutput) as {
      ok: boolean;
      command: string;
      commit_result: { committed: boolean; dry_run_preview?: { content: string } };
    };
    expect(commitParsed.ok).toBe(true);
    expect(commitParsed.command).toBe("commit");
    expect(commitParsed.commit_result.committed).toBe(false);
    expect(commitParsed.commit_result.final_filename).toContain("Quiet_Pond");

    let shutdown: (() => Promise<void>) | undefined;
    try {
      const serveOutput = await runMirrorCli(["mirror", "serve", "--port", "0", "--json"], {
        onServiceStarted(service) {
          shutdown = service.shutdown;
        },
      });
      const serveParsed = JSON.parse(serveOutput) as {
        ok: boolean;
        command: string;
        service: { port: number; lore_dir: string; provider_url: string; node_id: string };
      };
      expect(serveParsed.ok).toBe(true);
      expect(serveParsed.command).toBe("serve");
      expect(Number.isInteger(serveParsed.service.port)).toBe(true);
      expect(serveParsed.service.port).toBeGreaterThanOrEqual(0);
      expect(serveParsed.service.lore_dir).toBe(path.resolve(loreDir));
      expect(serveParsed.service.provider_url).toBe("http://brain.local/v1/chat/completions");
    } finally {
      await shutdown?.();
    }
  });

  it("returns JSON errors in json mode and still enforces operator auth", async () => {
    const output = await runMirrorCli([
      "mirror",
      "interpret",
      "At sunrise the pond remembers renewal.",
      "--json",
    ]);
    const parsed = JSON.parse(output) as { ok: boolean; command: string; error: string };

    expect(parsed.ok).toBe(false);
    expect(parsed.command).toBe("interpret");
    expect(parsed.error).toContain("Mirror operator auth is not configured");
  });

  it("supports standalone status and verify-lore commands", async () => {
    const dir = await createTempLoreDir();
    const { manifestPath, canonicalDir } = await writeLoreManifestFixture(dir);

    const statusOutput = await runMirrorCli(["mirror", "status"]);
    const verifyOutput = await runMirrorCli([
      "mirror",
      "verify-lore",
      "--manifest",
      manifestPath,
      "--dir",
      canonicalDir,
    ]);

    expect(statusOutput).toContain("Mirror Runtime");
    expect(statusOutput).toContain("telemetry:");
    expect(verifyOutput).toContain("Lore Verification");
    expect(verifyOutput).toContain("Status: VERIFIED");
  });

  it("returns stable JSON shapes for standalone status and verify-lore", async () => {
    const dir = await createTempLoreDir();
    const { manifestPath, canonicalDir } = await writeLoreManifestFixture(dir);

    const statusOutput = JSON.parse(await runMirrorCli(["mirror", "status", "--json"])) as {
      ok: boolean;
      command: string;
      status: { telemetry: object; storage: object };
    };
    expect(statusOutput.ok).toBe(true);
    expect(statusOutput.command).toBe("status");
    expect(typeof statusOutput.status.telemetry).toBe("object");

    const verifyOutput = JSON.parse(
      await runMirrorCli([
        "mirror",
        "verify-lore",
        "--manifest",
        manifestPath,
        "--dir",
        canonicalDir,
        "--json",
      ]),
    ) as {
      ok: boolean;
      command: string;
      verification: { ok: boolean; checked: number; matched: number; manifest_path: string };
    };
    expect(verifyOutput.ok).toBe(true);
    expect(verifyOutput.command).toBe("verify-lore");
    expect(verifyOutput.verification.ok).toBe(true);
    expect(verifyOutput.verification.checked).toBe(1);
    expect(verifyOutput.verification.matched).toBe(1);
    expect(verifyOutput.verification.manifest_path).toBe(manifestPath);
  });

  it("supports sync commands in human-readable mode", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost({ loreDir });

    try {
      await runMirrorCli(
        [
          "mirror",
          "sync",
          "announce",
          "--peer-id",
          "peer-1",
          "--base-url",
          "http://127.0.0.1:7999",
        ],
        { runtimeHost },
      );
      const output = await runMirrorCli(["mirror", "sync", "peers"], { runtimeHost });

      expect(output).toContain("Mirror Sync peers");
      expect(output).toContain("peer-1");
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("returns stable JSON shapes for sync commands", async () => {
    const localLoreDir = await createTempLoreDir();
    await seedLoreCorpus(localLoreDir);
    process.env.MIRROR_LORE_DIR = localLoreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();

    const runtimeHost = await createMirrorRuntimeHost(
      {
        loreDir: localLoreDir,
        nodeId: "local-node",
        baseUrl: "http://127.0.0.1:7777",
      },
      {
        fetchImpl: vi.fn(async (url: string, init?: RequestInit) => {
          if (url.endsWith("/mirror-sync/announce")) {
            expect(init?.method).toBe("POST");
            return {
              ok: true,
              text: async () => '{"ok":true}',
              json: async () => ({ ok: true }),
            } as Response;
          }
          if (url.endsWith("/mirror-sync/updates")) {
            return {
              ok: true,
              text: async () =>
                JSON.stringify({
                  node_id: "remote-node",
                  base_url: "http://127.0.0.1:7999",
                  canon: { files: [], index_version: 1 },
                  graph: { version: "graph-1", node_count: 1, edge_count: 0 },
                }),
              json: async () => ({
                node_id: "remote-node",
                base_url: "http://127.0.0.1:7999",
                canon: { files: [], index_version: 1 },
                graph: { version: "graph-1", node_count: 1, edge_count: 0 },
              }),
            } as Response;
          }
          throw new Error(`unexpected sync url: ${url}`);
        }),
      },
    );

    try {
      const announce = JSON.parse(
        await runMirrorCli(
          [
            "mirror",
            "sync",
            "announce",
            "--peer-id",
            "peer-1",
            "--base-url",
            "http://127.0.0.1:7999",
            "--json",
          ],
          { runtimeHost },
        ),
      ) as { ok: boolean; command: string; action: string; peer: { peer_id: string } };
      expect(announce.action).toBe("announce");
      expect(announce.peer.peer_id).toBe("peer-1");

      const peers = JSON.parse(
        await runMirrorCli(["mirror", "sync", "peers", "--json"], { runtimeHost }),
      ) as { ok: boolean; command: string; action: string; peers: Array<{ peer_id: string }> };
      expect(peers.ok).toBe(true);
      expect(peers.command).toBe("sync");
      expect(peers.action).toBe("peers");
      expect(peers.peers[0]?.peer_id).toBe("peer-1");

      const updates = JSON.parse(
        await runMirrorCli(["mirror", "sync", "updates", "--json"], { runtimeHost }),
      ) as { ok: boolean; command: string; action: string; updates: { node_id: string } };
      expect(updates.action).toBe("updates");
      expect(updates.updates.node_id).toBe("local-node");

      const pull = JSON.parse(
        await runMirrorCli(
          [
            "mirror",
            "sync",
            "pull",
            "--peer-id",
            "peer-1",
            "--base-url",
            "http://127.0.0.1:7999",
            "--json",
          ],
          { runtimeHost },
        ),
      ) as { ok: boolean; command: string; action: string; pull_result: { peer_id: string } };
      expect(pull.action).toBe("pull");
      expect(pull.pull_result.peer_id).toBe("peer-1");
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("supports task, reminder, and heartbeat commands in human-readable mode", async () => {
    process.env.MIRROR_USER_WORKSPACE_DIR = await createTempWorkspaceUsersRoot();

    const taskCreate = await runMirrorCli([
      "mirror",
      "task",
      "create",
      "--user-id",
      "alice",
      "--title",
      "Plan the day",
      "--description",
      "Review open tasks.",
    ]);
    const reminderCreate = await runMirrorCli([
      "mirror",
      "reminder",
      "create",
      "--user-id",
      "alice",
      "--title",
      "Evening review",
      "--remind-at",
      "2026-03-13T18:00:00.000Z",
    ]);
    const heartbeatGet = await runMirrorCli(["mirror", "heartbeat", "get", "--user-id", "alice"]);

    expect(taskCreate).toContain("Mirror Task create");
    expect(taskCreate).toContain("Plan the day");
    expect(reminderCreate).toContain("Mirror Reminder create");
    expect(heartbeatGet).toContain("Mirror Heartbeat get");
  });

  it("returns stable JSON shapes for task, reminder, and heartbeat commands", async () => {
    process.env.MIRROR_USER_WORKSPACE_DIR = await createTempWorkspaceUsersRoot();
    process.env.MIRROR_USER_ID = "alice";

    const taskCreate = JSON.parse(
      await runMirrorCli([
        "mirror",
        "task",
        "create",
        "--title",
        "Prepare check-in",
        "--description",
        "Review reminder state.",
        "--json",
      ]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      task: { id: string; title: string };
    };
    expect(taskCreate.ok).toBe(true);
    expect(taskCreate.command).toBe("task");
    expect(taskCreate.action).toBe("create");
    expect(taskCreate.task.title).toBe("Prepare check-in");

    const taskList = JSON.parse(await runMirrorCli(["mirror", "task", "list", "--json"])) as {
      ok: boolean;
      command: string;
      action: string;
      tasks: Array<{ title: string }>;
    };
    expect(taskList.action).toBe("list");
    expect(taskList.tasks[0]?.title).toBe("Prepare check-in");

    const reminderCreate = JSON.parse(
      await runMirrorCli([
        "mirror",
        "reminder",
        "create",
        "--title",
        "Water the pond",
        "--remind-at",
        "2026-03-13T09:00:00.000Z",
        "--recurrence",
        "daily",
        "--json",
      ]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      reminder: { id: string; title: string };
    };
    expect(reminderCreate.command).toBe("reminder");
    expect(reminderCreate.action).toBe("create");
    expect(reminderCreate.reminder.title).toBe("Water the pond");

    const reminderDue = JSON.parse(
      await runMirrorCli([
        "mirror",
        "reminder",
        "due",
        "--json",
        "--now",
        "2026-03-14T09:30:00.000Z",
      ]),
    ) as { ok: boolean; command: string; action: string; reminders: Array<{ title: string }> };
    expect(reminderDue.action).toBe("due");
    expect(reminderDue.reminders[0]?.title).toBe("Water the pond");

    const heartbeatUpdate = JSON.parse(
      await runMirrorCli([
        "mirror",
        "heartbeat",
        "update",
        "--json",
        "--enabled",
        "true",
        "--check-in-after-days",
        "2",
        "--tone",
        "calm",
      ]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      heartbeat: { enabled: boolean; preferred_tone: string };
    };
    expect(heartbeatUpdate.command).toBe("heartbeat");
    expect(heartbeatUpdate.action).toBe("update");
    expect(heartbeatUpdate.heartbeat.enabled).toBe(true);
    expect(heartbeatUpdate.heartbeat.preferred_tone).toBe("calm");

    const heartbeatEval = JSON.parse(
      await runMirrorCli([
        "mirror",
        "heartbeat",
        "evaluate",
        "--json",
        "--now",
        "2026-03-14T09:30:00.000Z",
      ]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      evaluation: { due: boolean };
      suggested_message: string;
    };
    expect(heartbeatEval.action).toBe("evaluate");
    expect(typeof heartbeatEval.evaluation.due).toBe("boolean");
    expect(heartbeatEval.suggested_message.length).toBeGreaterThan(0);
  });

  it("supports monk commands in human-readable mode", async () => {
    process.env.MIRROR_USER_WORKSPACE_DIR = await createTempWorkspaceUsersRoot();

    const contextOutput = await runMirrorCli(["mirror", "monk", "context", "--user-id", "alice"]);
    const noteOutput = await runMirrorCli([
      "mirror",
      "monk",
      "note",
      "--user-id",
      "alice",
      "--note",
      "Review the next open task.",
    ]);

    expect(contextOutput).toContain("Mirror Monk context");
    expect(noteOutput).toContain("Mirror Monk note");
  });

  it("routes CLI execution through a daemon-backed runtime host", async () => {
    const loreDir = await createTempLoreDir();
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = await createTempMemoryDbPath();
    process.env.MIRROR_USER_WORKSPACE_DIR = await createTempWorkspaceUsersRoot();
    process.env.MIRROR_OPERATOR_TOKEN = "secret";

    const runtimeHost = await createMirrorRuntimeHost(
      {
        loreDir,
      },
      {
        fetchImpl: vi.fn(async (url: string) => {
          if (url.endsWith("/mirror-sync/updates")) {
            return {
              ok: true,
              json: async () => ({
                node_id: "remote-node",
                base_url: "http://127.0.0.1:7999",
                canon: { files: [], index_version: 1 },
                graph: { version: "graph-1", node_count: 1, edge_count: 0 },
              }),
            } as Response;
          }
          throw new Error(`unexpected sync url: ${url}`);
        }),
      },
    );

    try {
      await runMirrorCli(["mirror", "chat", "What happened to the patience vault?"], {
        runtimeHost,
        provider: {
          url: "http://brain.local/v1/chat/completions",
          authToken: "token",
        },
        fetchImpl: vi.fn(
          async () =>
            ({
              ok: true,
              json: async () => ({
                id: "resp_cli_daemon",
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
            }) as Response,
        ),
      });
      await runMirrorCli(["mirror", "find", "patience vault"], { runtimeHost });
      await runMirrorCli(
        [
          "mirror",
          "sync",
          "announce",
          "--peer-id",
          "peer-1",
          "--base-url",
          "http://127.0.0.1:7999",
        ],
        { runtimeHost },
      );
      await runMirrorCli(
        ["mirror", "task", "create", "--user-id", "alice", "--title", "Review open work"],
        { runtimeHost },
      );
      await runMirrorCli(["mirror", "monk", "context", "--user-id", "alice"], { runtimeHost });

      const sessions = runtimeHost.daemon.listSessions();
      expect(sessions).toHaveLength(5);
      expect(sessions.some((session) => session.metadata.command === "chat")).toBe(true);
      expect(sessions.some((session) => session.metadata.command === "find")).toBe(true);
      expect(
        sessions.some(
          (session) =>
            session.metadata.command === "sync" && session.metadata.action === "announce",
        ),
      ).toBe(true);
      expect(
        sessions.some(
          (session) => session.metadata.command === "task" && session.metadata.action === "create",
        ),
      ).toBe(true);
      expect(
        sessions.some(
          (session) => session.metadata.command === "monk" && session.metadata.action === "context",
        ),
      ).toBe(true);
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("returns stable JSON shapes for monk commands", async () => {
    process.env.MIRROR_USER_WORKSPACE_DIR = await createTempWorkspaceUsersRoot();
    process.env.MIRROR_USER_ID = "alice";

    const contextOutput = JSON.parse(
      await runMirrorCli(["mirror", "monk", "context", "--json"]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      context: { user: { user_id: string } };
    };
    expect(contextOutput.command).toBe("monk");
    expect(contextOutput.action).toBe("context");
    expect(contextOutput.context.user.user_id).toBe("alice");

    const nextOutput = JSON.parse(await runMirrorCli(["mirror", "monk", "next", "--json"])) as {
      ok: boolean;
      command: string;
      action: string;
      action_result: Record<string, unknown>;
    };
    expect(nextOutput.action).toBe("next");
    expect(typeof nextOutput.action_result).toBe("object");

    const remindersOutput = JSON.parse(
      await runMirrorCli(["mirror", "monk", "reminders", "--json"]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      actions: unknown[];
    };
    expect(remindersOutput.action).toBe("reminders");
    expect(Array.isArray(remindersOutput.actions)).toBe(true);

    const noteOutput = JSON.parse(
      await runMirrorCli(["mirror", "monk", "note", "--json", "--note", "Record this follow-up."]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      note: { content: string };
    };
    expect(noteOutput.action).toBe("note");
    expect(noteOutput.note.content).toContain("Monk follow-up");

    const recordOutput = JSON.parse(
      await runMirrorCli([
        "mirror",
        "monk",
        "record-action",
        "--json",
        "--kind",
        "resume",
        "--source",
        "resume",
        "--summary",
        "Resume open work.",
        "--suggested-action",
        "Review the first active task.",
      ]),
    ) as {
      ok: boolean;
      command: string;
      action: string;
      note: { content: string };
    };
    expect(recordOutput.action).toBe("record-action");
    expect(recordOutput.note.content).toContain("Suggested action kind");
  });
});
