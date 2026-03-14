import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeMirrorMemoryDb } from "../mirror-memory/db.js";
import { startMirrorService } from "../mirror-service/index.js";

const tempDirs: string[] = [];
const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalMirrorMemoryDbPath = process.env.MIRROR_MEMORY_DB_PATH;
const originalMirrorAgentId = process.env.MIRROR_AGENT_ID;
const originalMirrorTravelerName = process.env.MIRROR_TRAVELER_NAME;

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
  if (originalMirrorAgentId === undefined) {
    delete process.env.MIRROR_AGENT_ID;
  } else {
    process.env.MIRROR_AGENT_ID = originalMirrorAgentId;
  }
  if (originalMirrorTravelerName === undefined) {
    delete process.env.MIRROR_TRAVELER_NAME;
  } else {
    process.env.MIRROR_TRAVELER_NAME = originalMirrorTravelerName;
  }
  closeMirrorMemoryDb();
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
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
      "# Rune3",
      "",
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "KEYWORD_INDEX.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

async function requestJsonFromApp(app: unknown, method: string, url: string): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const responseHeaders = new Map<string, string>();
    const req = {
      method,
      url,
      path: url,
      query: Object.create(null) as Record<string, string>,
      get(name: string) {
        return responseHeaders.get(name.toLowerCase());
      },
      header(name: string) {
        return responseHeaders.get(name.toLowerCase());
      },
      protocol: "http",
    };
    const res = {
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        responseHeaders.set(name.toLowerCase(), value);
      },
      getHeader(name: string) {
        return responseHeaders.get(name.toLowerCase());
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
      status(code: number) {
        this.statusCode = code;
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

describe("mirror ui api", () => {
  it("exposes discovery, forge identity, agent directory, runtime status, and event discovery envelopes", async () => {
    const loreDir = await createTempDir("mirror-ui-api-");
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_MEMORY_DB_PATH = path.join(
      await createTempDir("mirror-ui-db-"),
      "memory.sqlite",
    );
    process.env.MIRROR_AGENT_ID = "forge-agent";
    process.env.MIRROR_TRAVELER_NAME = "Tommy";

    const service = await startMirrorService({
      port: 0,
      loreDir,
      nodeId: "ui-api-node",
      providerUrl: "http://brain.local/v1/chat/completions",
      providerAuthToken: "token",
    });

    try {
      const discovery = (await requestJsonFromApp(service.app, "GET", "/mirror/ui")) as {
        api: string;
        kind: string;
        data: {
          forge_identity: string;
          agents: string;
          runtime_status: string;
          runtime_events: string;
        };
      };
      expect(discovery.api).toBe("mirror.ui.v1");
      expect(discovery.kind).toBe("ui.discovery");
      expect(discovery.data.forge_identity).toContain("/mirror/ui/forge/identity");

      const identity = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/ui/forge/identity",
      )) as {
        kind: string;
        data: {
          passport: { agentIdentity: { agentId: string }; localOnly?: { travelerName?: string } };
          runtime: { node_id: string };
        };
      };
      expect(identity.kind).toBe("forge.identity");
      expect(identity.data.passport.agentIdentity.agentId).toBe("forge-agent");
      expect(identity.data.passport.localOnly?.travelerName).toBe("Tommy");
      expect(identity.data.runtime.node_id).toBe("ui-api-node");

      const agents = (await requestJsonFromApp(service.app, "GET", "/mirror/ui/agents")) as {
        kind: string;
        data: {
          agents: Array<{
            agent_id: string;
            source: string;
            links: { forge_identity: string; runtime_status: string; runtime_events: string };
          }>;
        };
      };
      expect(agents.kind).toBe("agent.directory");
      expect(agents.data.agents).toHaveLength(1);
      expect(agents.data.agents[0]?.agent_id).toBe("forge-agent");
      expect(agents.data.agents[0]?.source).toBe("local_runtime");
      expect(agents.data.agents[0]?.links.runtime_events).toContain("/mirror/ui/runtime/events");

      const runtimeStatus = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/ui/runtime/status",
      )) as {
        kind: string;
        data: {
          runtime: { node_id: string; surfaces: string[] };
          health: { provider: { configured: boolean } };
        };
      };
      expect(runtimeStatus.kind).toBe("runtime.status");
      expect(runtimeStatus.data.runtime.node_id).toBe("ui-api-node");
      expect(runtimeStatus.data.runtime.surfaces).toContain("runtime_ws");
      expect(runtimeStatus.data.health.provider.configured).toBe(true);

      const runtimeEvents = (await requestJsonFromApp(
        service.app,
        "GET",
        "/mirror/ui/runtime/events",
      )) as {
        kind: string;
        data: {
          stream: string;
          sse: { url: string };
          websocket: { url: string; protocol: string };
        };
      };
      expect(runtimeEvents.kind).toBe("runtime.events.discovery");
      expect(runtimeEvents.data.stream).toBe("runtime.events");
      expect(runtimeEvents.data.sse.url).toContain("/mirror/runtime/events");
      expect(runtimeEvents.data.websocket.url).toContain("/mirror/runtime/ws");
      expect(runtimeEvents.data.websocket.protocol).toBe("mirror.runtime.ws.v1");
    } finally {
      await service.shutdown();
    }
  });
});
