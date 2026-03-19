import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMirrorSettingsSync, writeMirrorSettingsFilesSync } from "./load.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalSettingsDir = process.env.MIRROR_SETTINGS_DIR;
const originalEnvFile = process.env.MIRROR_ENV_FILE;
const originalPort = process.env.MIRROR_PORT;

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
  if (originalPort === undefined) {
    delete process.env.MIRROR_PORT;
  } else {
    process.env.MIRROR_PORT = originalPort;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

describe("mirror settings loader", () => {
  it("applies sane defaults when no files exist", async () => {
    const home = await makeHome("mirror-settings-load-defaults-");

    const settings = loadMirrorSettingsSync();

    expect(settings.runtime.port).toBe(7777);
    expect(settings.workspace.root).toBe(path.join(home, ".mirror", "workspace"));
    expect(settings.provider.active).toBeNull();
    expect(settings.connectors.mode).toBe("api_only");
  });

  it("prefers structured config over bootstrap env file but explicit env over both", async () => {
    const home = await makeHome("mirror-settings-load-precedence-");
    const envFile = path.join(home, ".config", "mirror-runtime", "mirror-runtime.env");
    process.env.MIRROR_ENV_FILE = envFile;
    await fs.mkdir(path.dirname(envFile), { recursive: true });
    await fs.writeFile(envFile, "MIRROR_PORT=9999\n", "utf8");

    writeMirrorSettingsFilesSync({
      mirror: {
        version: 1,
        runtime: { port: 7777, web_ui_enabled: true },
        workspace: {},
        onboarding: {},
      },
    });

    expect(loadMirrorSettingsSync().runtime.port).toBe(7777);

    process.env.MIRROR_PORT = "1234";
    expect(loadMirrorSettingsSync().runtime.port).toBe(1234);
  });
});
