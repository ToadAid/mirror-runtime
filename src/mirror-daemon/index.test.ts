import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
});
