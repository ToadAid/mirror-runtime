import type { Server } from "node:http";
import type express from "express";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { startRuntimeServer, type RuntimeSessionStore } from "../runtime/server.js";
import {
  removeMirrorDaemonPidFile,
  resolveMirrorDaemonPidPath,
  writeMirrorDaemonPidFile,
} from "./lifecycle.js";
import { FileMirrorSessionStore } from "./session-store.js";

export type MirrorDaemonStartOptions = {
  port?: number;
  host?: string;
  brainUrl?: string;
  authToken?: string;
  runtimeEnv?: RuntimeEnv;
  sessionStore?: RuntimeSessionStore;
  pidFilePath?: string;
  signalSource?: {
    on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
    off: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  };
};

export type MirrorDaemonApp = {
  app: express.Application;
  runtimeEnv: RuntimeEnv;
  sessionStore: RuntimeSessionStore;
};

export type MirrorDaemonHandle = {
  app: express.Application;
  server: Server;
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
};

export function installMirrorDaemonSignalHandlers(
  close: () => Promise<void>,
  signalSource: {
    on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
    off: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  } = process,
): () => void {
  const onSignal = () => {
    void close();
  };

  signalSource.on("SIGINT", onSignal);
  signalSource.on("SIGTERM", onSignal);

  return () => {
    signalSource.off("SIGINT", onSignal);
    signalSource.off("SIGTERM", onSignal);
  };
}

function resolveDaemonPort(value: number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  const raw = process.env.MIRROR_DAEMON_PORT ?? process.env.MIRROR_RUNTIME_PORT;
  if (!raw) {
    return 8787;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 8787;
}

export async function createMirrorDaemonApp(
  options: Omit<MirrorDaemonStartOptions, "host" | "port"> = {},
): Promise<MirrorDaemonApp> {
  const runtimeEnv = options.runtimeEnv ?? defaultRuntime;
  const sessionStore = options.sessionStore ?? new FileMirrorSessionStore();
  const app = await startRuntimeServer(runtimeEnv, options.brainUrl, options.authToken, {
    requireRuntimeEnabledEnv: false,
    sessionStore,
  });
  return {
    app,
    runtimeEnv,
    sessionStore,
  };
}

export async function startMirrorDaemon(
  options: MirrorDaemonStartOptions = {},
): Promise<MirrorDaemonHandle> {
  const daemonApp = await createMirrorDaemonApp(options);
  const host = options.host?.trim() || "127.0.0.1";
  const requestedPort = resolveDaemonPort(options.port);

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = daemonApp.app.listen(requestedPort, host, () => resolve(listener));
    listener.on("error", reject);
  });

  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${boundPort}`;
  const pidFilePath =
    options.pidFilePath ?? process.env.MIRROR_DAEMON_PID_PATH ?? resolveMirrorDaemonPidPath();

  await writeMirrorDaemonPidFile(pidFilePath, {
    pid: process.pid,
    host,
    port: boundPort,
    storeRoot: daemonApp.sessionStore.resolvePath(),
    startedAt: new Date().toISOString(),
  });

  let releaseSignalHandlers = () => {};
  let closing: Promise<void> | null = null;

  const close = async (): Promise<void> => {
    if (closing) {
      return closing;
    }

    closing = (async () => {
      releaseSignalHandlers();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            if ((err as NodeJS.ErrnoException).code === "ERR_SERVER_NOT_RUNNING") {
              resolve();
              return;
            }
            reject(err);
            return;
          }
          resolve();
        });
      });
      await removeMirrorDaemonPidFile(pidFilePath);
    })();

    return closing;
  };

  releaseSignalHandlers = installMirrorDaemonSignalHandlers(close, options.signalSource ?? process);

  daemonApp.runtimeEnv.log(`MirrorDaemon listening on ${url}`);
  daemonApp.runtimeEnv.log(`MirrorDaemon store root: ${daemonApp.sessionStore.resolvePath()}`);

  return {
    app: daemonApp.app,
    server,
    host,
    port: boundPort,
    url,
    close,
  };
}
