import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProviderEnvFromDaemonConfig, resolveMirrorDaemonConfig } from "./config.js";

describe("mirror-daemon config layering", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => await fs.rm(dir, { recursive: true, force: true })),
    );
    tempDirs.length = 0;
  });

  it("uses precedence explicit > file > env > defaults", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-config-"));
    tempDirs.push(root);
    const configPath = path.join(root, ".mirror", "config.json");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          daemon: {
            host: "127.0.0.2",
            port: 8999,
            token: "file-token",
            storeRoot: "file-store",
            journalPath: "file-journal.jsonl",
          },
          provider: {
            name: "brain-chat",
            model: "file-model",
          },
          brain: {
            url: "http://file-brain.local/chat",
            authToken: "file-auth",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const resolved = await resolveMirrorDaemonConfig({
      cwd: root,
      configPath,
      env: {
        MIRROR_DAEMON_HOST: "127.0.0.3",
        MIRROR_DAEMON_PORT: "9000",
        MIRROR_DAEMON_TOKEN: "env-token",
        MIRROR_DAEMON_STORE_ROOT: ".mirror/env-store",
        MIRROR_RUN_JOURNAL_PATH: ".mirror/env-journal.jsonl",
        MIRROR_PROVIDER: "mirror.brain-chat",
        MIRROR_PROVIDER_MODEL: "env-model",
        MIRROR_BRAIN_URL: "http://env-brain.local/chat",
        MIRROR_BRAIN_AUTH_TOKEN: "env-auth",
      } as NodeJS.ProcessEnv,
      overrides: {
        host: "127.0.0.4",
        port: 9010,
        token: "override-token",
        storeRoot: ".mirror/override-store",
        journalPath: ".mirror/override-journal.jsonl",
        provider: "brain-chat",
        providerModel: "override-model",
        brainUrl: "http://override-brain.local/chat",
        authToken: "override-auth",
      },
    });

    expect(resolved.host).toBe("127.0.0.4");
    expect(resolved.port).toBe(9010);
    expect(resolved.token).toBe("override-token");
    expect(resolved.provider).toEqual({ provider: "brain-chat", model: "override-model" });
    expect(resolved.brainUrl).toBe("http://override-brain.local/chat");
    expect(resolved.authToken).toBe("override-auth");
    expect(resolved.storeRoot).toBe(path.resolve(root, ".mirror/override-store"));
    expect(resolved.journalPath).toBe(path.resolve(root, ".mirror/override-journal.jsonl"));
  });

  it("handles missing config file and falls back to env/defaults", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-config-"));
    tempDirs.push(root);
    const resolved = await resolveMirrorDaemonConfig({
      cwd: root,
      env: {
        MIRROR_DAEMON_PORT: "8877",
        MIRROR_PROVIDER_MODEL: "env-model",
      } as NodeJS.ProcessEnv,
    });

    expect(resolved.host).toBe("127.0.0.1");
    expect(resolved.port).toBe(8877);
    expect(resolved.token).toBeNull();
    expect(resolved.provider).toEqual({ provider: "brain-chat", model: "env-model" });
    expect(resolved.storeRoot).toBe(path.resolve(root, ".mirror"));
    expect(resolved.journalPath).toBe(path.resolve(root, ".mirror", "run_journal.jsonl"));
  });

  it("builds provider env from resolved config", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-config-"));
    tempDirs.push(root);
    const resolved = await resolveMirrorDaemonConfig({
      cwd: root,
      overrides: {
        provider: "mirror.brain-chat",
        providerModel: "bridge-model",
      },
    });

    expect(buildProviderEnvFromDaemonConfig(resolved)).toEqual({
      MIRROR_PROVIDER: "mirror.brain-chat",
      MIRROR_PROVIDER_MODEL: "bridge-model",
    });
  });
});
