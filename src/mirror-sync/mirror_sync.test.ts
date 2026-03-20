import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMirrorDiagnostics,
  getMirrorMetrics,
  resetMirrorDiagnostics,
  resetMirrorMetrics,
} from "../mirror-observability/index.js";
import { parseRequestBodyJson } from "../test/request_init.js";
import {
  createMirrorSyncManager,
  type MirrorSyncManager,
  type MirrorSyncUpdatesResponse,
} from "./index.js";
import { executeMirrorSyncAction } from "./sync_manager.js";

const tempDirs: string[] = [];

afterEach(async () => {
  resetMirrorMetrics();
  resetMirrorDiagnostics();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempLoreDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-sync-"));
  tempDirs.push(dir);
  return dir;
}

async function writeScroll(loreDir: string, fileName: string, body: string): Promise<void> {
  await fs.mkdir(path.join(loreDir, "_index"), { recursive: true });
  await fs.writeFile(path.join(loreDir, fileName), body, "utf8");
}

async function seedIndexFiles(
  loreDir: string,
  keywordIndex: Record<string, string[]>,
  supersedes: Record<string, unknown> = {},
): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify(keywordIndex),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), JSON.stringify(supersedes), "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

async function seedValidLore(loreDir: string, fileName: string, title: string, text: string) {
  await writeScroll(
    loreDir,
    fileName,
    [
      "---",
      `title: ${title}`,
      "epoch: E1",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      `# ${title}`,
      "",
      text,
      "",
    ].join("\n"),
  );
}

function createFetchBridge(remoteManager: MirrorSyncManager) {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlText = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const parsed = new URL(urlText);
    if (parsed.pathname === "/mirror-sync/announce" && init?.method === "POST") {
      const payload = parseRequestBodyJson<{ peer_id: string; base_url: string }>(init);
      const peer = await remoteManager.announcePeer(payload);
      return {
        ok: true,
        json: async () => ({ peer }),
        text: async () => JSON.stringify({ peer }),
      } as Response;
    }

    if (parsed.pathname === "/mirror-sync/updates") {
      const includeContent = parsed.searchParams.get("include_content") === "1";
      const paths = includeContent
        ? (parsed.searchParams.get("paths") ?? "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const updates = await remoteManager.getLocalUpdates({ requestedPaths: paths });
      return {
        ok: true,
        json: async () => updates,
        text: async () => JSON.stringify(updates),
      } as Response;
    }

    throw new Error(`unexpected sync bridge request: ${urlText}`);
  };
}

describe("mirror sync", () => {
  it("executes shared sync actions for the supported routes", async () => {
    const peer = {
      peer_id: "peer-1",
      base_url: "http://127.0.0.1:7999",
      last_seen_at: "2026-03-19T00:00:00.000Z",
      sync_status: "idle" as const,
    };
    const updates: MirrorSyncUpdatesResponse = {
      node_id: "node-a",
      base_url: "http://127.0.0.1:7001",
      canon: {
        lore_dir: "/tmp/mirror-sync-test",
        index_path: "/tmp/mirror-sync-test/_index/KEYWORD_INDEX.json",
        index_version: 1,
        latest_update_at: "2026-03-19T00:00:00.000Z",
        files: [],
      },
      graph: {
        version: "graph-v1",
        updated_at: "2026-03-19T00:00:00.000Z",
        updated_at_ms: Date.parse("2026-03-19T00:00:00.000Z"),
        node_count: 0,
        edge_count: 0,
      },
      file_contents: {
        "canon.md": "body",
      },
    };
    const pullResult = {
      peer_id: "peer-1",
      peer_base_url: "http://127.0.0.1:7999",
      pulled_files: ["canon.md"],
      skipped_files: [],
      conflicts: [],
      graph: {
        remote_version: "remote-v1",
        local_version: "local-v1",
        rebuilt: true,
      },
    };
    const announcePeer = vi.fn(async (input) => ({
      ...peer,
      peer_id: input.peer_id,
      base_url: input.base_url,
    }));
    const listPeers = vi.fn(() => [peer]);
    const getLocalUpdates = vi.fn(async () => updates);
    const pullFromPeer = vi.fn(async () => pullResult);
    const manager = {
      announcePeer,
      listPeers,
      getLocalUpdates,
      pullFromPeer,
      setLocalBaseUrl: vi.fn(),
      getLocalBaseUrl: vi.fn(() => updates.base_url),
      registry: {} as never,
    } satisfies MirrorSyncManager;

    expect(await executeMirrorSyncAction(manager, "peers")).toEqual({ peers: [peer] });
    expect(
      await executeMirrorSyncAction(manager, "updates", { requested_paths: ["canon.md"] }),
    ).toEqual(updates);
    expect(await executeMirrorSyncAction(manager, "announce")).toEqual({
      peer: {
        ...peer,
        peer_id: "",
        base_url: "",
      },
      local: {
        node_id: updates.node_id,
        base_url: updates.base_url,
      },
    });
    expect(
      await executeMirrorSyncAction(manager, "pull", {
        peer_id: "peer-1",
      }),
    ).toEqual(pullResult);
    expect(listPeers).toHaveBeenCalledTimes(1);
    expect(getLocalUpdates).toHaveBeenNthCalledWith(1, { requestedPaths: ["canon.md"] });
    expect(announcePeer).toHaveBeenCalledWith({ peer_id: "", base_url: "" });
    expect(getLocalUpdates).toHaveBeenNthCalledWith(2);
    expect(pullFromPeer).toHaveBeenCalledWith({
      peer_id: "peer-1",
      base_url: undefined,
    });
  });

  it("preserves unsupported shared sync action behavior", async () => {
    const manager = {
      announcePeer: vi.fn(),
      listPeers: vi.fn(() => []),
      getLocalUpdates: vi.fn(),
      pullFromPeer: vi.fn(),
      setLocalBaseUrl: vi.fn(),
      getLocalBaseUrl: vi.fn(() => null),
      registry: {} as never,
    } satisfies MirrorSyncManager;

    await expect(executeMirrorSyncAction(manager, "unsupported" as never)).resolves.toBeUndefined();
  });

  it("registers peers and exposes peer status", async () => {
    const loreDir = await createTempLoreDir();
    await seedValidLore(
      loreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Renewal begins in stillness.",
    );
    await seedIndexFiles(loreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const manager = createMirrorSyncManager({
      nodeId: "node-a",
      loreDir,
      baseUrl: "http://127.0.0.1:7001",
    });

    const peer = await manager.announcePeer({
      peer_id: "node-b",
      base_url: "http://127.0.0.1:7002",
    });

    expect(peer.peer_id).toBe("node-b");
    expect(manager.listPeers()).toHaveLength(1);
    expect(getMirrorMetrics().gauges.peers_known).toBe(1);
  });

  it("exposes local canon and graph metadata", async () => {
    const loreDir = await createTempLoreDir();
    await seedValidLore(
      loreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Renewal begins in stillness beside the pond.",
    );
    await seedIndexFiles(loreDir, { renewal: ["TOBY_L0001_SeedOfStillness.md"] });

    const manager = createMirrorSyncManager({
      nodeId: "node-a",
      loreDir,
      baseUrl: "http://127.0.0.1:7001",
    });

    const updates = await manager.getLocalUpdates();

    expect(updates.node_id).toBe("node-a");
    expect(updates.canon.files).toHaveLength(1);
    expect(updates.canon.files[0]?.path).toBe("TOBY_L0001_SeedOfStillness.md");
    expect(updates.graph.node_count).toBeGreaterThan(0);
    expect(updates.graph.version.length).toBeGreaterThan(10);
  });

  it("discovers and pulls new canonical scrolls from a remote peer", async () => {
    const localLoreDir = await createTempLoreDir();
    await seedValidLore(
      localLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Renewal begins in stillness.",
    );
    await seedIndexFiles(localLoreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const remoteLoreDir = await createTempLoreDir();
    await seedValidLore(
      remoteLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Renewal begins in stillness.",
    );
    await seedValidLore(
      remoteLoreDir,
      "TOBY_L0002_PondMemory.md",
      "Pond Memory",
      "The pond remembers each traveler who returns.",
    );
    await seedIndexFiles(remoteLoreDir, {
      stillness: ["TOBY_L0001_SeedOfStillness.md"],
      pond: ["TOBY_L0002_PondMemory.md"],
    });

    const remoteManager = createMirrorSyncManager({
      nodeId: "node-remote",
      loreDir: remoteLoreDir,
      baseUrl: "http://127.0.0.1:7002",
    });
    const localManager = createMirrorSyncManager({
      nodeId: "node-local",
      loreDir: localLoreDir,
      baseUrl: "http://127.0.0.1:7001",
      fetchImpl: createFetchBridge(remoteManager),
    });
    await localManager.announcePeer({
      peer_id: "node-remote",
      base_url: "http://127.0.0.1:7002",
    });

    const result = await localManager.pullFromPeer({ peer_id: "node-remote" });

    expect(result.pulled_files).toContain("TOBY_L0002_PondMemory.md");
    expect(
      await fs.readFile(path.join(localLoreDir, "TOBY_L0002_PondMemory.md"), "utf8"),
    ).toContain("The pond remembers each traveler who returns.");
    expect(getMirrorMetrics().counters.updates_pulled).toBe(1);
  });

  it("prefers the newer remote version when the remote file timestamp is newer", async () => {
    const localLoreDir = await createTempLoreDir();
    await seedValidLore(
      localLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Old local canon line.",
    );
    await seedIndexFiles(localLoreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const remoteLoreDir = await createTempLoreDir();
    await seedValidLore(
      remoteLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "New remote canon line.",
    );
    await seedIndexFiles(remoteLoreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    const newTime = new Date("2026-02-01T00:00:00.000Z");
    await fs.utimes(path.join(localLoreDir, "TOBY_L0001_SeedOfStillness.md"), oldTime, oldTime);
    await fs.utimes(path.join(remoteLoreDir, "TOBY_L0001_SeedOfStillness.md"), newTime, newTime);

    const remoteManager = createMirrorSyncManager({
      nodeId: "node-remote",
      loreDir: remoteLoreDir,
      baseUrl: "http://127.0.0.1:7002",
    });
    const localManager = createMirrorSyncManager({
      nodeId: "node-local",
      loreDir: localLoreDir,
      baseUrl: "http://127.0.0.1:7001",
      fetchImpl: createFetchBridge(remoteManager),
    });
    await localManager.announcePeer({
      peer_id: "node-remote",
      base_url: "http://127.0.0.1:7002",
    });

    const result = await localManager.pullFromPeer({ peer_id: "node-remote" });
    const synced = await fs.readFile(
      path.join(localLoreDir, "TOBY_L0001_SeedOfStillness.md"),
      "utf8",
    );

    expect(result.pulled_files).toContain("TOBY_L0001_SeedOfStillness.md");
    expect(synced).toContain("New remote canon line.");
  });

  it("rejects invalid synced canon artifacts", async () => {
    const localLoreDir = await createTempLoreDir();
    await seedValidLore(
      localLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Local canon line.",
    );
    await seedIndexFiles(localLoreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const remoteLoreDir = await createTempLoreDir();
    await writeScroll(
      remoteLoreDir,
      "TOBY_L0002_InvalidRemote.md",
      "# Invalid Remote\n\nNo frontmatter here.\n",
    );
    await seedIndexFiles(remoteLoreDir, { invalid: ["TOBY_L0002_InvalidRemote.md"] });

    const remoteManager = createMirrorSyncManager({
      nodeId: "node-remote",
      loreDir: remoteLoreDir,
      baseUrl: "http://127.0.0.1:7002",
    });
    const localManager = createMirrorSyncManager({
      nodeId: "node-local",
      loreDir: localLoreDir,
      baseUrl: "http://127.0.0.1:7001",
      fetchImpl: createFetchBridge(remoteManager),
    });
    await localManager.announcePeer({
      peer_id: "node-remote",
      base_url: "http://127.0.0.1:7002",
    });

    const result = await localManager.pullFromPeer({ peer_id: "node-remote" });

    expect(result.pulled_files).toEqual([]);
    expect(result.conflicts[0]?.reason).toBe("invalid_remote_canon");
    await expect(
      fs.stat(path.join(localLoreDir, "TOBY_L0002_InvalidRemote.md")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(getMirrorMetrics().counters.conflict_warnings).toBeGreaterThan(0);
  });

  it("surfaces sync diagnostics and graph metadata during pull", async () => {
    const localLoreDir = await createTempLoreDir();
    await seedValidLore(
      localLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Local canon line.",
    );
    await seedIndexFiles(localLoreDir, { stillness: ["TOBY_L0001_SeedOfStillness.md"] });

    const remoteLoreDir = await createTempLoreDir();
    await seedValidLore(
      remoteLoreDir,
      "TOBY_L0001_SeedOfStillness.md",
      "Seed Of Stillness",
      "Local canon line.",
    );
    await seedValidLore(
      remoteLoreDir,
      "TOBY_L0002_PondMemory.md",
      "Pond Memory",
      "The pond remembers each traveler who returns.",
    );
    await seedIndexFiles(remoteLoreDir, {
      stillness: ["TOBY_L0001_SeedOfStillness.md"],
      pond: ["TOBY_L0002_PondMemory.md"],
    });

    const remoteManager = createMirrorSyncManager({
      nodeId: "node-remote",
      loreDir: remoteLoreDir,
      baseUrl: "http://127.0.0.1:7002",
    });
    const localManager = createMirrorSyncManager({
      nodeId: "node-local",
      loreDir: localLoreDir,
      baseUrl: "http://127.0.0.1:7001",
      fetchImpl: createFetchBridge(remoteManager),
    });
    await localManager.announcePeer({
      peer_id: "node-remote",
      base_url: "http://127.0.0.1:7002",
    });

    const result = await localManager.pullFromPeer({ peer_id: "node-remote" });
    const diagnostics = getMirrorDiagnostics();

    expect(result.graph.remote_version.length).toBeGreaterThan(10);
    expect(typeof result.graph.rebuilt).toBe("boolean");
    expect(diagnostics.events.some((event) => event.event === "sync.pull.completed")).toBe(true);
  });
});
