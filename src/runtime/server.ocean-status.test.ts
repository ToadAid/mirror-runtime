import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getOceanStatus } from "./server.js";

async function withIsolatedWorkspace(run: (oceanRegistryPath: string) => Promise<void>) {
  const previousCwd = process.cwd();
  const previousPondId = process.env.MIRROR_POND_ID;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ocean-status-"));
  const oceanRegistryPath = path.join(root, ".mirror", "ocean_registry.json");

  try {
    process.chdir(root);
    process.env.MIRROR_POND_ID = "local-pond";
    await run(oceanRegistryPath);
  } finally {
    process.chdir(previousCwd);
    if (previousPondId === undefined) {
      delete process.env.MIRROR_POND_ID;
    } else {
      process.env.MIRROR_POND_ID = previousPondId;
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

describe("getOceanStatus", () => {
  it("handles missing registry cleanly", async () => {
    await withIsolatedWorkspace(async (oceanRegistryPath) => {
      const summary = await getOceanStatus({ registryPath: oceanRegistryPath });
      expect(summary.local_pond_id).toBe("local-pond");
      expect(summary.known_ponds_count).toBe(0);
      expect(summary.trusted_ponds_count).toBe(0);
      expect(summary.blocked_ponds_count).toBe(0);
      expect(summary.handshakes.successful_count).toBe(0);
      expect(summary.consults.successful_count).toBe(0);
    });
  });

  it("summarizes known/trusted/blocked and last success timestamps", async () => {
    await withIsolatedWorkspace(async (oceanRegistryPath) => {
      await fs.mkdir(path.dirname(oceanRegistryPath), { recursive: true });
      await fs.writeFile(
        oceanRegistryPath,
        `${JSON.stringify({
          ponds: [
            {
              pond_id: "pond-a",
              trust_status: "known",
              last_handshake_at: "2026-03-10T00:00:00.000Z",
              last_consult_at: "2026-03-10T00:10:00.000Z",
              last_consult_ok: true,
            },
            {
              pond_id: "pond-b",
              trust_status: "trusted",
              last_handshake_at: "2026-03-10T00:05:00.000Z",
              last_consult_at: "2026-03-10T00:06:00.000Z",
              last_consult_ok: false,
            },
            {
              pond_id: "pond-c",
              trust_status: "blocked",
            },
          ],
        })}\n`,
        "utf-8",
      );

      const summary = await getOceanStatus({ registryPath: oceanRegistryPath });
      expect(summary.known_ponds_count).toBe(3);
      expect(summary.trusted_ponds_count).toBe(1);
      expect(summary.blocked_ponds_count).toBe(1);
      expect(summary.handshakes.successful_count).toBe(2);
      expect(summary.handshakes.last_success_at).toBe("2026-03-10T00:05:00.000Z");
      expect(summary.consults.successful_count).toBe(1);
      expect(summary.consults.last_success_at).toBe("2026-03-10T00:10:00.000Z");
    });
  });
});
