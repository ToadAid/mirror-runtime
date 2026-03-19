import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveMirrorBootstrapEnvFilePath,
  resolveMirrorConnectorsSettingsPath,
  resolveMirrorCoreSettingsPath,
  resolveMirrorCredentialsSettingsPath,
  resolveMirrorProvidersSettingsPath,
  resolveMirrorSettingsRoot,
} from "./paths.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalSettingsDir = process.env.MIRROR_SETTINGS_DIR;
const originalEnvFile = process.env.MIRROR_ENV_FILE;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalSettingsDir === undefined) {
    delete process.env.MIRROR_SETTINGS_DIR;
  } else {
    process.env.MIRROR_SETTINGS_DIR = originalSettingsDir;
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

describe("mirror settings paths", () => {
  it("resolves the default ~/.mirror/config file layout", async () => {
    const home = await makeHome("mirror-settings-paths-");

    expect(resolveMirrorSettingsRoot()).toBe(path.join(home, ".mirror", "config"));
    expect(resolveMirrorCoreSettingsPath()).toBe(
      path.join(home, ".mirror", "config", "mirror.json"),
    );
    expect(resolveMirrorProvidersSettingsPath()).toBe(
      path.join(home, ".mirror", "config", "providers.json"),
    );
    expect(resolveMirrorConnectorsSettingsPath()).toBe(
      path.join(home, ".mirror", "config", "connectors.json"),
    );
    expect(resolveMirrorCredentialsSettingsPath()).toBe(
      path.join(home, ".mirror", "config", "credentials.json"),
    );
    expect(resolveMirrorBootstrapEnvFilePath()).toBe(
      path.join(home, ".config", "mirror-runtime", "mirror-runtime.env"),
    );
  });

  it("respects MIRROR_SETTINGS_DIR and MIRROR_ENV_FILE overrides", async () => {
    const home = await makeHome("mirror-settings-paths-override-");
    process.env.MIRROR_SETTINGS_DIR = path.join(home, "custom-settings");
    process.env.MIRROR_ENV_FILE = path.join(home, "custom", "mirror.env");

    expect(resolveMirrorSettingsRoot()).toBe(path.join(home, "custom-settings"));
    expect(resolveMirrorCoreSettingsPath()).toBe(path.join(home, "custom-settings", "mirror.json"));
    expect(resolveMirrorBootstrapEnvFilePath()).toBe(path.join(home, "custom", "mirror.env"));
  });
});
