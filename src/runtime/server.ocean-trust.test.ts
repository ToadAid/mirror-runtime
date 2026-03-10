import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { updateOceanPondTrust } from "./server.js";

type PondTrustStatus = "known" | "trusted" | "blocked";

type RegistryPond = {
  pond_id: string;
  trust_status: PondTrustStatus;
  last_seen?: string;
};

type RegistryFixture = {
  ponds: RegistryPond[];
};

async function withIsolatedRuntimeCwd(run: (cwd: string) => Promise<void>) {
  const previousCwd = process.cwd();
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-ocean-trust-"));

  try {
    process.chdir(fixtureRoot);
    await fs.mkdir(path.join(fixtureRoot, ".mirror"), { recursive: true });
    await run(fixtureRoot);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
}

async function seedRegistry(baseDir: string, fixture: RegistryFixture): Promise<string> {
  const registryPath = path.join(baseDir, ".mirror", "ocean_registry.json");
  await fs.writeFile(registryPath, `${JSON.stringify(fixture, null, 2)}\n`, "utf-8");
  return registryPath;
}

describe("updateOceanPondTrust", () => {
  it("updates known -> trusted and persists file", async () => {
    await withIsolatedRuntimeCwd(async (cwd) => {
      const registryPath = await seedRegistry(cwd, {
        ponds: [
          { pond_id: "toadaid-main", trust_status: "known", last_seen: "2026-03-09T00:00:00.000Z" },
        ],
      });

      const pond = await updateOceanPondTrust({
        pondId: "toadaid-main",
        trustStatus: "trusted",
      });
      expect(pond.pond_id).toBe("toadaid-main");
      expect(pond.trust_status).toBe("trusted");

      const persisted = JSON.parse(await fs.readFile(registryPath, "utf-8")) as RegistryFixture;
      expect(persisted.ponds[0]?.trust_status).toBe("trusted");
      expect(persisted.ponds[0]?.last_seen).toBe("2026-03-09T00:00:00.000Z");
    });
  });

  it("updates trusted -> blocked", async () => {
    await withIsolatedRuntimeCwd(async (cwd) => {
      await seedRegistry(cwd, {
        ponds: [{ pond_id: "toadaid-main", trust_status: "trusted" }],
      });

      const pond = await updateOceanPondTrust({
        pondId: "toadaid-main",
        trustStatus: "blocked",
      });
      expect(pond.trust_status).toBe("blocked");
    });
  });

  it("rejects invalid trust_status", async () => {
    await withIsolatedRuntimeCwd(async (cwd) => {
      await seedRegistry(cwd, {
        ponds: [{ pond_id: "toadaid-main", trust_status: "known" }],
      });

      await expect(
        updateOceanPondTrust({
          pondId: "toadaid-main",
          trustStatus: "invalid",
        }),
      ).rejects.toThrow(/trust_status must be one of/);
    });
  });

  it("rejects unknown pond_id", async () => {
    await withIsolatedRuntimeCwd(async (cwd) => {
      await seedRegistry(cwd, {
        ponds: [{ pond_id: "toadaid-main", trust_status: "known" }],
      });

      await expect(
        updateOceanPondTrust({
          pondId: "missing-pond",
          trustStatus: "trusted",
        }),
      ).rejects.toThrow(/unknown pond_id/);
    });
  });
});
