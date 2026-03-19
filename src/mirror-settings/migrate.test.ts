import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureMirrorSettingsMigratedSync } from "./migrate.js";
import {
  resolveMirrorConnectorsSettingsPath,
  resolveMirrorCoreSettingsPath,
  resolveMirrorCredentialsSettingsPath,
  resolveMirrorProvidersSettingsPath,
} from "./paths.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalEnvFile = process.env.MIRROR_ENV_FILE;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalEnvFile === undefined) {
    delete process.env.MIRROR_ENV_FILE;
  } else {
    process.env.MIRROR_ENV_FILE = originalEnvFile;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

describe("mirror settings migration", () => {
  it("creates structured config files from the legacy env-only install", async () => {
    const home = await makeHome("mirror-settings-migrate-");
    const envFile = path.join(home, ".config", "mirror-runtime", "mirror-runtime.env");
    process.env.MIRROR_ENV_FILE = envFile;
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(
      envFile,
      [
        "MIRROR_PORT=17777",
        "MIRROR_NODE_ID=traveler-node",
        "MIRROR_BASE_URL=https://mirror.example",
        `MIRROR_WORKSPACE_ROOT=${path.join(home, ".mirror", "workspace")}`,
        "MIRROR_PROVIDER_URL=http://127.0.0.1:11434/v1/chat/completions",
        "MIRROR_PROVIDER_AUTH_TOKEN=ollama",
        "MIRROR_OPERATOR_TOKEN=secret-token",
      ].join("\n"),
      "utf8",
    );

    const result = ensureMirrorSettingsMigratedSync();

    expect(result.migrated).toBe(true);
    expect(await fs.readFile(resolveMirrorCoreSettingsPath(), "utf8")).toContain('"port": 17777');
    expect(await fs.readFile(resolveMirrorProvidersSettingsPath(), "utf8")).toContain(
      '"default_provider_id": "primary"',
    );
    expect(await fs.readFile(resolveMirrorConnectorsSettingsPath(), "utf8")).toContain(
      '"mode": "api_only"',
    );
    expect(await fs.readFile(resolveMirrorCredentialsSettingsPath(), "utf8")).toContain(
      '"operator:local"',
    );
  });
});
