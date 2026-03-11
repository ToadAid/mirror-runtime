import type { Server } from "node:http";
import type express from "express";
import {
  resolveMirrorProviderCredentials,
  type MirrorProviderAuthTokenResolver,
} from "../mirror/provider/index.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { startRuntimeServer, type RuntimeSessionStore } from "../runtime/server.js";
import {
  resolveMirrorDaemonConfig,
  type MirrorDaemonConfigOverrides,
  type MirrorDaemonResolvedConfig,
} from "./config.js";
import {
  removeMirrorDaemonPidFile,
  resolveMirrorDaemonPidPath,
  writeMirrorDaemonPidFile,
} from "./lifecycle.js";
import {
  createMirrorDaemonProviderRuntime,
  type MirrorDaemonProviderRuntime,
} from "./provider-runtime.js";
import {
  createMirrorRuntimeConfigSnapshot,
  type MirrorRuntimeConfigSnapshot,
} from "./runtime-config.js";
import { FileMirrorSessionStore } from "./session-store.js";

export type MirrorDaemonStartOptions = {
  port?: number;
  host?: string;
  brainUrl?: string;
  authToken?: string;
  config?: MirrorDaemonConfigOverrides;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  runtimeEnv?: RuntimeEnv;
  sessionStore?: RuntimeSessionStore;
  pidFilePath?: string;
  signalSource?: {
    on: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
    off: (event: "SIGINT" | "SIGTERM", listener: () => void) => void;
  };
  resolveProviderCredentials?: MirrorProviderAuthTokenResolver;
};

export type MirrorDaemonApp = {
  app: express.Application;
  runtimeEnv: RuntimeEnv;
  sessionStore: RuntimeSessionStore;
  config: MirrorDaemonResolvedConfig;
  runtimeConfig: MirrorRuntimeConfigSnapshot;
  providerRuntime: MirrorDaemonProviderRuntime;
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
  return 8787;
}

function buildDaemonConfigOverrides(
  options: MirrorDaemonStartOptions,
): MirrorDaemonConfigOverrides {
  return {
    host: options.host,
    port: options.port,
    brainUrl: options.brainUrl,
    authToken: options.authToken,
    ...options.config,
  };
}

export async function createMirrorDaemonApp(
  options: Omit<MirrorDaemonStartOptions, "host" | "port"> = {},
): Promise<MirrorDaemonApp> {
  const resolvedConfig = await resolveMirrorDaemonConfig({
    overrides: buildDaemonConfigOverrides(options),
    configPath: options.configPath,
    env: options.env,
    cwd: options.cwd,
  });
  const runtimeEnv = options.runtimeEnv ?? defaultRuntime;
  const runtimeConfig = await createMirrorRuntimeConfigSnapshot({
    daemonConfig: resolvedConfig,
    env: options.env,
  });
  const sessionStore =
    options.sessionStore ?? new FileMirrorSessionStore({ rootDir: runtimeConfig.daemon.storeRoot });
  const providerEnv = {
    ...(options.env ?? process.env),
    MIRROR_PROVIDER: runtimeConfig.provider.name,
    MIRROR_PROVIDER_MODEL: runtimeConfig.provider.model,
  };
  const providerRuntime = createMirrorDaemonProviderRuntime({
    env: runtimeEnv,
    brainUrl: runtimeConfig.brain.url,
    providerEnv,
    authToken: runtimeConfig.brain.authToken,
    resolveProviderCredentials:
      options.resolveProviderCredentials ??
      (async ({ provider }) => {
        const resolved = await resolveMirrorProviderCredentials({ provider });
        return { apiKey: resolved.apiKey };
      }),
  });
  const app = await startRuntimeServer(
    runtimeEnv,
    runtimeConfig.brain.url,
    runtimeConfig.brain.authToken,
    {
      requireRuntimeEnabledEnv: false,
      sessionStore,
      daemonToken: runtimeConfig.daemon.token,
      journalPath: runtimeConfig.daemon.journalPath,
      runtimeConfig,
      providerRuntime,
    },
  );
  return {
    app,
    runtimeEnv,
    sessionStore,
    config: resolvedConfig,
    runtimeConfig,
    providerRuntime,
  };
}

export async function startMirrorDaemon(
  options: MirrorDaemonStartOptions = {},
): Promise<MirrorDaemonHandle> {
  const daemonApp = await createMirrorDaemonApp(options);
  const host = daemonApp.runtimeConfig.daemon.host;
  const requestedPort = resolveDaemonPort(daemonApp.runtimeConfig.daemon.port);

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

export {
  projectMirrorDaemonReplyRequest,
  type MirrorDaemonReplyRequest,
  type MirrorDaemonReplyRouteMeta,
} from "./reply-backend-adapter.js";
export { MirrorDaemonReplyBackend, type MirrorDaemonReplyBackendOptions } from "./reply-backend.js";
export {
  createConfiguredReplyBackend,
  inferMirrorDaemonReplyRouteMeta,
  isMirrorRuntimeEnabled,
  type MirrorRuntimeBackendSelectionOptions,
} from "./backend-selection.js";
export { StubMirrorRuntimeClient, type MirrorRuntimeClient } from "./runtime-client.js";
export {
  HttpMirrorRuntimeClient,
  parseMirrorResponse,
  serializeMirrorRequest,
  type HttpMirrorRuntimeClientOptions,
} from "./runtime-http-client.js";
export {
  MIRROR_EXECUTE_ENDPOINT,
  validateMirrorDaemonReplyRequest,
  validateMirrorExecuteResponse,
  type MirrorExecuteResponse,
} from "./runtime-http-contract.js";
