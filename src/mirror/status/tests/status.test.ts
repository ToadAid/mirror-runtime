import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorRuntimeHost } from "../../../mirror-service/index.js";
import { formatMirrorStatusHuman } from "../format.js";
import { getMirrorStatus } from "../status.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-status-"));
  tempDirs.push(dir);
  return dir;
}

describe("mirror status", () => {
  it("returns daemon-backed runtime and lore truth", async () => {
    const loreDir = await createTempDir();
    const runtimeHost = await createMirrorRuntimeHost({
      loreDir,
      nodeId: "status-node",
      baseUrl: "http://127.0.0.1:7777",
      providerUrl: "",
      providerAuthToken: "",
    });

    try {
      const status = await getMirrorStatus({
        runtimeHost,
      });

      expect(status.runtime.node_id).toBe("status-node");
      expect(status.runtime.sessions.total).toBe(0);
      expect(status.service.lore_dir).toBe(path.resolve(loreDir));
      expect(status.lore.dir).toBe(status.service.lore_dir);
      expect(status.service.workspace_users_root).toBe(status.workspace.users_root);
      expect(status.provider.configured).toBe(false);
      expect(status.provider.active_provider_id).toBe("primary");
      expect(status.provider.total).toBe(1);
      expect(status.lore.ready).toBe(true);
      expect(status.workspace.ready).toBe(true);
      expect(status.sync.node_id).toBe("status-node");
      expect(JSON.stringify(status)).not.toContain("travelerName");
    } finally {
      await runtimeHost.shutdown();
    }
  });

  it("reflects current daemon metrics and sessions", async () => {
    const loreDir = await createTempDir();
    const runtimeHost = await createMirrorRuntimeHost({
      loreDir,
      nodeId: "status-metrics-node",
      providerUrl: "",
      providerAuthToken: "",
    });

    try {
      runtimeHost.daemon.createSession({
        session_id: "status-session",
        user_id: "alice",
      });
      runtimeHost.daemon.getObservability().incrementMetric("chat_requests");

      const status = await getMirrorStatus({
        runtimeHost,
      });

      expect(status.runtime.sessions.total).toBe(1);
      expect(status.runtime.sessions.open).toBe(1);
      expect(status.sync.node_id).toBe(status.runtime.node_id);
      expect(status.provider.providers[0]?.provider_id).toBe("primary");

      const json = JSON.stringify(status);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(parsed).toHaveProperty("runtime");
      expect(parsed).toHaveProperty("service");
      expect(parsed).toHaveProperty("sync");
      expect(parsed).not.toHaveProperty("ts");
      expect(parsed).not.toHaveProperty("cwd");
      expect(parsed).not.toHaveProperty("observability");

      const human = formatMirrorStatusHuman(status);
      expect(human).toContain("🪞 Mirror Runtime");
      expect(human).toContain("runtime:");
      expect(human).toContain("service:");
      expect(human).toContain("sync:");
      expect(human).not.toContain("cwd:");
      expect(human).not.toContain("observability:");
    } finally {
      await runtimeHost.shutdown();
    }
  });
});
