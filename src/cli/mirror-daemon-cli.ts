import type { Command } from "commander";
import { startMirrorDaemon } from "../mirror-daemon/index.js";
import {
  getMirrorDaemonStatus,
  resolveMirrorDaemonPidPath,
  startMirrorDaemonDetached,
  stopMirrorDaemon,
} from "../mirror-daemon/lifecycle.js";
import { defaultRuntime } from "../runtime.js";
import { runCommandWithRuntime } from "./cli-utils.js";

function parsePort(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --port: ${raw}`);
  }
  return value;
}

export function registerMirrorDaemonCli(program: Command): void {
  const daemon = program
    .command("mirror-daemon")
    .description("Run standalone Mirror runtime daemon");

  daemon
    .command("run")
    .description("Run MirrorDaemon in the foreground")
    .option("--host <host>", "Bind host (default: 127.0.0.1)")
    .option("--port <port>", "Bind port (default: MIRROR_DAEMON_PORT or 8787)", parsePort)
    .option("--brain-url <url>", "Optional upstream brain URL")
    .option("--auth-token <token>", "Optional auth token for /api/brain/chat")
    .action(
      async (opts: { host?: string; port?: number; brainUrl?: string; authToken?: string }) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          await startMirrorDaemon({
            host: opts.host,
            port: opts.port,
            brainUrl: opts.brainUrl,
            authToken: opts.authToken,
            runtimeEnv: defaultRuntime,
          });
        });
      },
    );

  daemon
    .command("start")
    .description("Start MirrorDaemon in the background")
    .option("--host <host>", "Bind host (default: 127.0.0.1)")
    .option("--port <port>", "Bind port (default: MIRROR_DAEMON_PORT or 8787)", parsePort)
    .option("--brain-url <url>", "Optional upstream brain URL")
    .option("--auth-token <token>", "Optional auth token for /api/brain/chat")
    .action(
      async (opts: { host?: string; port?: number; brainUrl?: string; authToken?: string }) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          const result = await startMirrorDaemonDetached({
            host: opts.host,
            port: opts.port,
            brainUrl: opts.brainUrl,
            authToken: opts.authToken,
            runtimeEnv: defaultRuntime,
          });
          if (result.alreadyRunning) {
            defaultRuntime.log(`MirrorDaemon already running (pid=${result.pid ?? "unknown"})`);
            return;
          }
          defaultRuntime.log(`MirrorDaemon started (pid=${result.pid ?? "unknown"})`);
        });
      },
    );

  daemon
    .command("stop")
    .description("Stop MirrorDaemon using pid file")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const result = await stopMirrorDaemon(resolveMirrorDaemonPidPath());
        if (result.stopped) {
          defaultRuntime.log(`MirrorDaemon stopped (pid=${result.pid ?? "unknown"})`);
          return;
        }
        if (result.stale) {
          defaultRuntime.log(
            `MirrorDaemon pid was stale; cleaned up (pid=${result.pid ?? "unknown"})`,
          );
          return;
        }
        defaultRuntime.log("MirrorDaemon not running");
      });
    });

  daemon
    .command("status")
    .description("Show MirrorDaemon status")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const status = await getMirrorDaemonStatus(resolveMirrorDaemonPidPath());
        defaultRuntime.log(`running: ${status.running ? "yes" : "no"}`);
        defaultRuntime.log(`pid: ${status.pid ?? "unknown"}`);
        defaultRuntime.log(`host: ${status.host ?? "unknown"}`);
        defaultRuntime.log(`port: ${status.port ?? "unknown"}`);
        defaultRuntime.log(`store root: ${status.storeRoot ?? "unknown"}`);
        defaultRuntime.log(`pid file: ${status.pidFilePath}`);
      });
    });
}
