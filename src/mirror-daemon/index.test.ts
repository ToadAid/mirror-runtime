import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNonExitingRuntime } from "../runtime.js";
import { createMirrorDaemonApp, startMirrorDaemon } from "./index.js";
import { getMirrorDaemonStatus, readMirrorDaemonPidFile } from "./lifecycle.js";
import { FileMirrorSessionStore } from "./session-store.js";

function createSignalSource() {
  const handlers = new Map<"SIGINT" | "SIGTERM", Set<() => void>>();

  return {
    on(event: "SIGINT" | "SIGTERM", listener: () => void) {
      const eventHandlers = handlers.get(event) ?? new Set<() => void>();
      eventHandlers.add(listener);
      handlers.set(event, eventHandlers);
    },
    off(event: "SIGINT" | "SIGTERM", listener: () => void) {
      handlers.get(event)?.delete(listener);
    },
    emit(event: "SIGINT" | "SIGTERM") {
      for (const listener of handlers.get(event) ?? []) {
        listener();
      }
    },
  };
}

async function waitFor<T>(check: () => Promise<T>, predicate: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 2_000;
  // Small polling loop to let async shutdown complete in signal-path tests.
  while (Date.now() < deadline) {
    const value = await check();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return check();
}

describe("MirrorDaemon", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.length = 0;
  });

  it("builds runtime app with standalone store injection", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-"));
    tempDirs.push(tempDir);
    const sessionStore = new FileMirrorSessionStore({ rootDir: tempDir });

    const daemon = await createMirrorDaemonApp({
      runtimeEnv: createNonExitingRuntime(),
      sessionStore,
    });

    expect(typeof daemon.app.get).toBe("function");
    expect(daemon.sessionStore.resolvePath("ocean_registry.json")).toBe(
      path.resolve(tempDir, "ocean_registry.json"),
    );
  });

  it("starts with loopback default and writes pid file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-run-"));
    tempDirs.push(tempDir);
    const sessionStore = new FileMirrorSessionStore({ rootDir: tempDir });
    const pidFilePath = path.join(tempDir, "daemon.pid");

    const handle = await startMirrorDaemon({
      port: 0,
      runtimeEnv: createNonExitingRuntime(),
      sessionStore,
      pidFilePath,
    });

    try {
      expect(handle.host).toBe("127.0.0.1");
      expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`);
      const pid = await readMirrorDaemonPidFile(pidFilePath);
      expect(pid?.pid).toBe(process.pid);
      expect(pid?.host).toBe("127.0.0.1");
      expect(typeof pid?.port).toBe("number");
      expect(pid?.storeRoot).toBe(sessionStore.resolvePath());
    } finally {
      await handle.close();
    }

    const afterClose = await readMirrorDaemonPidFile(pidFilePath);
    expect(afterClose).toBeNull();
  });

  it("cleans pid file on signal-triggered foreground shutdown", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-signal-"));
    tempDirs.push(tempDir);
    const sessionStore = new FileMirrorSessionStore({ rootDir: tempDir });
    const pidFilePath = path.join(tempDir, "daemon.pid");
    const signalSource = createSignalSource();

    const handle = await startMirrorDaemon({
      port: 0,
      runtimeEnv: createNonExitingRuntime(),
      sessionStore,
      pidFilePath,
      signalSource,
    });

    signalSource.emit("SIGINT");
    const removed = await waitFor(
      () => readMirrorDaemonPidFile(pidFilePath),
      (record) => record === null,
    );
    expect(removed).toBeNull();

    await handle.close();
  });

  it("enforces token auth for protected routes when MIRROR_DAEMON_TOKEN is set", async () => {
    const priorToken = process.env.MIRROR_DAEMON_TOKEN;
    process.env.MIRROR_DAEMON_TOKEN = "test-token";
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-auth-"));
    tempDirs.push(tempDir);
    const sessionStore = new FileMirrorSessionStore({ rootDir: tempDir });

    const handle = await startMirrorDaemon({
      port: 0,
      runtimeEnv: createNonExitingRuntime(),
      sessionStore,
      pidFilePath: path.join(tempDir, "daemon.pid"),
    });

    try {
      const health = await fetch(`http://127.0.0.1:${handle.port}/health`);
      expect(health.status).toBe(200);

      const protectedNoToken = await fetch(`http://127.0.0.1:${handle.port}/ocean/status`);
      expect(protectedNoToken.status).toBe(401);

      const protectedWithToken = await fetch(`http://127.0.0.1:${handle.port}/ocean/status`, {
        headers: {
          Authorization: "Bearer test-token",
        },
      });
      expect(protectedWithToken.status).toBe(200);
    } finally {
      await handle.close();
      if (priorToken === undefined) {
        delete process.env.MIRROR_DAEMON_TOKEN;
      } else {
        process.env.MIRROR_DAEMON_TOKEN = priorToken;
      }
    }
  });

  it("loads daemon token from optional .mirror/config.json", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-config-file-"));
    tempDirs.push(tempDir);
    const mirrorDir = path.join(tempDir, ".mirror");
    await fs.mkdir(mirrorDir, { recursive: true });
    await fs.writeFile(
      path.join(mirrorDir, "config.json"),
      JSON.stringify(
        {
          daemon: {
            host: "127.0.0.1",
            port: 0,
            token: "file-config-token",
          },
          provider: {
            name: "brain-chat",
            model: "configured-model",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const handle = await startMirrorDaemon({
      cwd: tempDir,
      runtimeEnv: createNonExitingRuntime(),
      pidFilePath: path.join(tempDir, "daemon.pid"),
    });

    try {
      const protectedNoToken = await fetch(`http://127.0.0.1:${handle.port}/ocean/status`);
      expect(protectedNoToken.status).toBe(401);

      const protectedWithToken = await fetch(`http://127.0.0.1:${handle.port}/ocean/status`, {
        headers: {
          Authorization: "Bearer file-config-token",
        },
      });
      expect(protectedWithToken.status).toBe(200);
    } finally {
      await handle.close();
    }
  });

  it("uses snapshot runtime metadata for /health over env defaults", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-health-config-"));
    tempDirs.push(tempDir);
    const mirrorDir = path.join(tempDir, ".mirror");
    await fs.mkdir(mirrorDir, { recursive: true });
    await fs.writeFile(
      path.join(mirrorDir, "config.json"),
      JSON.stringify(
        {
          daemon: {
            host: "127.0.0.1",
            port: 0,
          },
          runtime: {
            enabled: true,
            mode: "intranet",
            version: "snapshot-version",
            commit: "snapshot-commit",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const handle = await startMirrorDaemon({
      cwd: tempDir,
      env: {
        MIRROR_RUNTIME_MODE: "lan",
        MIRROR_RUNTIME_VERSION: "env-version",
        MIRROR_RUNTIME_COMMIT: "env-commit",
      } as NodeJS.ProcessEnv,
      runtimeEnv: createNonExitingRuntime(),
      pidFilePath: path.join(tempDir, "daemon.pid"),
    });

    try {
      const healthResponse = await fetch(`http://127.0.0.1:${handle.port}/health`);
      expect(healthResponse.status).toBe(200);
      const health = (await healthResponse.json()) as {
        mode: string;
        version: string;
        commit: string;
      };
      expect(health.mode).toBe("intranet");
      expect(health.version).toBe("snapshot-version");
      expect(health.commit).toBe("snapshot-commit");
    } finally {
      await handle.close();
    }
  });

  it("status reports running and stale states from pid file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-status-"));
    tempDirs.push(tempDir);
    const pidFilePath = path.join(tempDir, "daemon.pid");

    await fs.writeFile(
      pidFilePath,
      JSON.stringify({
        pid: process.pid,
        host: "127.0.0.1",
        port: 8787,
        storeRoot: tempDir,
        startedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    const running = await getMirrorDaemonStatus(pidFilePath);
    expect(running.running).toBe(true);
    expect(running.stale).toBe(false);

    await fs.writeFile(
      pidFilePath,
      JSON.stringify({
        pid: 999_999_999,
        host: "127.0.0.1",
        port: 8787,
        storeRoot: tempDir,
        startedAt: new Date().toISOString(),
      }),
      "utf-8",
    );

    const stale = await getMirrorDaemonStatus(pidFilePath);
    expect(stale.running).toBe(false);
    expect(stale.stale).toBe(true);
  });

  it("uses custom injected credential resolver in runtime provider status", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-daemon-provider-resolver-"));
    tempDirs.push(tempDir);
    const resolveProviderCredentials = vi.fn(async () => ({ apiKey: "resolved-api-key" }));

    const handle = await startMirrorDaemon({
      port: 0,
      runtimeEnv: createNonExitingRuntime(),
      pidFilePath: path.join(tempDir, "daemon.pid"),
      resolveProviderCredentials,
    });

    try {
      const response = await fetch(`http://127.0.0.1:${handle.port}/mirror/provider/status`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        evidence?: {
          auth_source?: string;
          credential_resolution_attempted?: boolean;
          credential_resolution_ok?: boolean;
        };
      };
      expect(body.evidence).toMatchObject({
        auth_source: "resolved_credentials",
        credential_resolution_attempted: true,
        credential_resolution_ok: true,
      });
      expect(resolveProviderCredentials).toHaveBeenCalledWith({ provider: "brain-chat" });
    } finally {
      await handle.close();
    }
  });
});
