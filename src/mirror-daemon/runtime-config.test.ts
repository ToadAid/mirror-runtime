import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMirrorRuntimeConfigSnapshot } from "./runtime-config.js";

describe("mirror runtime config snapshot", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("resolves snapshot with precedence explicit > file > env > defaults", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-config-"));
    tempDirs.push(root);
    const configPath = path.join(root, ".mirror", "config.json");
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          runtime: {
            enabled: true,
            mode: "file-mode",
            name: "file-runtime",
            version: "file-version",
            commit: "file-commit",
          },
          pond: {
            id: "file-pond",
            name: "File Pond",
            consultUrl: "https://file.example/pond/consult",
            agents: ["scribe-a", "scribe-b"],
            signing: {
              privateKeyPem: "file-private",
              publicKeyPem: "file-public",
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const snapshot = await createMirrorRuntimeConfigSnapshot({
      daemonConfig: {
        host: "127.0.0.1",
        port: 8787,
        token: "daemon-token",
        storeRoot: path.join(root, ".mirror"),
        journalPath: path.join(root, ".mirror", "run_journal.jsonl"),
        provider: { provider: "brain-chat", model: "daemon-model" },
        brainUrl: "http://daemon-brain.local/chat",
        authToken: "daemon-auth",
        configPath,
      },
      env: {
        MIRROR_ENABLE_RUNTIME: "false",
        MIRROR_RUNTIME_MODE: "env-mode",
        MIRROR_RUNTIME_NAME: "env-runtime",
        MIRROR_RUNTIME_VERSION: "env-version",
        MIRROR_RUNTIME_COMMIT: "env-commit",
        MIRROR_LORE_DIR: "env-scrolls",
        MIRROR_POND_ID: "env-pond",
        MIRROR_POND_NAME: "Env Pond",
        MIRROR_POND_CONSULT_URL: "https://env.example/pond/consult",
        MIRROR_POND_AGENTS: "env-a,env-b",
        MIRROR_POND_SIGNING_PRIVATE_KEY_PEM: "env-private",
        MIRROR_POND_SIGNING_PUBLIC_KEY_PEM: "env-public",
      } as NodeJS.ProcessEnv,
      overrides: {
        runtimeMode: "override-mode",
        loreDir: path.join(root, "override-scrolls"),
        pondId: "override-pond",
        pondAgents: ["override-agent"],
      },
    });

    expect(snapshot.runtime).toMatchObject({
      enabled: true,
      mode: "override-mode",
      name: "file-runtime",
      version: "file-version",
      commit: "file-commit",
    });
    expect(snapshot.pond.id).toBe("override-pond");
    expect(snapshot.pond.name).toBe("File Pond");
    expect(snapshot.pond.consultUrl).toBe("https://file.example/pond/consult");
    expect(snapshot.pond.agents).toEqual(["override-agent"]);
    expect(snapshot.pond.signing.privateKeyPem).toBe("file-private");
    expect(snapshot.pond.signing.publicKeyPem).toBe("file-public");
    expect(snapshot.provider).toEqual({ name: "brain-chat", model: "daemon-model" });
    expect(snapshot.lore.dir).toBe(path.join(root, "override-scrolls"));
  });

  it("falls back to defaults when runtime/pond settings are missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-config-"));
    tempDirs.push(root);

    const snapshot = await createMirrorRuntimeConfigSnapshot({
      daemonConfig: {
        host: "127.0.0.1",
        port: 8787,
        token: null,
        storeRoot: path.join(root, ".mirror"),
        journalPath: path.join(root, ".mirror", "run_journal.jsonl"),
        provider: { provider: "brain-chat", model: "gpt-4o-mini" },
        configPath: path.join(root, ".mirror", "config.json"),
      },
      env: {} as NodeJS.ProcessEnv,
    });

    expect(snapshot.runtime).toMatchObject({
      enabled: false,
      mode: "lan",
      name: "openclaw-runtime",
      version: "unknown",
      commit: "unknown",
    });
    expect(snapshot.pond).toMatchObject({
      id: "toadaid-main",
      name: "ToadAid Main",
      agents: ["main"],
    });
    expect(snapshot.lore.dir).toBeUndefined();
  });
});
