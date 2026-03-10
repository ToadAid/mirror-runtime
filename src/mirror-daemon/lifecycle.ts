import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";

export type MirrorDaemonPidRecord = {
  pid: number;
  host: string;
  port: number;
  storeRoot: string;
  startedAt: string;
};

export type MirrorDaemonStatus = {
  running: boolean;
  pid: number | null;
  host: string | null;
  port: number | null;
  storeRoot: string | null;
  pidFilePath: string;
  stale: boolean;
};

export function resolveMirrorDaemonPidPath(cwd: string = process.cwd()): string {
  return path.resolve(cwd, ".mirror", "daemon.pid");
}

export async function writeMirrorDaemonPidFile(
  pidFilePath: string,
  record: MirrorDaemonPidRecord,
): Promise<void> {
  await fs.mkdir(path.dirname(pidFilePath), { recursive: true });
  await fs.writeFile(pidFilePath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

export async function readMirrorDaemonPidFile(
  pidFilePath: string,
): Promise<MirrorDaemonPidRecord | null> {
  try {
    const raw = await fs.readFile(pidFilePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MirrorDaemonPidRecord>;
    if (
      typeof parsed.pid !== "number" ||
      typeof parsed.host !== "string" ||
      typeof parsed.port !== "number" ||
      typeof parsed.storeRoot !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return null;
    }
    return {
      pid: parsed.pid,
      host: parsed.host,
      port: parsed.port,
      storeRoot: parsed.storeRoot,
      startedAt: parsed.startedAt,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code !== "ESRCH";
  }
}

export async function removeMirrorDaemonPidFile(pidFilePath: string): Promise<void> {
  await fs.rm(pidFilePath, { force: true });
}

export async function getMirrorDaemonStatus(
  pidFilePath: string = resolveMirrorDaemonPidPath(),
): Promise<MirrorDaemonStatus> {
  const record = await readMirrorDaemonPidFile(pidFilePath);
  if (!record) {
    return {
      running: false,
      pid: null,
      host: null,
      port: null,
      storeRoot: null,
      pidFilePath,
      stale: false,
    };
  }

  const running = isProcessRunning(record.pid);
  return {
    running,
    pid: record.pid,
    host: record.host,
    port: record.port,
    storeRoot: record.storeRoot,
    pidFilePath,
    stale: !running,
  };
}

export async function stopMirrorDaemon(
  pidFilePath: string = resolveMirrorDaemonPidPath(),
): Promise<{ stopped: boolean; stale: boolean; pid: number | null }> {
  const record = await readMirrorDaemonPidFile(pidFilePath);
  if (!record) {
    return { stopped: false, stale: false, pid: null };
  }

  if (!isProcessRunning(record.pid)) {
    await removeMirrorDaemonPidFile(pidFilePath);
    return { stopped: false, stale: true, pid: record.pid };
  }

  process.kill(record.pid, "SIGTERM");
  await removeMirrorDaemonPidFile(pidFilePath);
  return { stopped: true, stale: false, pid: record.pid };
}

export async function startMirrorDaemonDetached(
  params: {
    pidFilePath?: string;
    host?: string;
    port?: number;
    brainUrl?: string;
    authToken?: string;
    runtimeEnv?: RuntimeEnv;
  } = {},
): Promise<{ spawned: boolean; pid: number | null; pidFilePath: string; alreadyRunning: boolean }> {
  const runtimeEnv = params.runtimeEnv ?? defaultRuntime;
  const pidFilePath = params.pidFilePath ?? resolveMirrorDaemonPidPath();
  const status = await getMirrorDaemonStatus(pidFilePath);

  if (status.running) {
    return {
      spawned: false,
      pid: status.pid,
      pidFilePath,
      alreadyRunning: true,
    };
  }

  if (status.stale) {
    await removeMirrorDaemonPidFile(pidFilePath);
  }

  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Cannot resolve CLI script path for detached start");
  }

  const args = [scriptPath, "mirror-daemon", "run"];
  if (params.host) {
    args.push("--host", params.host);
  }
  if (typeof params.port === "number") {
    args.push("--port", String(params.port));
  }
  if (params.brainUrl) {
    args.push("--brain-url", params.brainUrl);
  }
  if (params.authToken) {
    args.push("--auth-token", params.authToken);
  }

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      MIRROR_DAEMON_PID_PATH: pidFilePath,
    },
  });
  child.unref();

  runtimeEnv.log(`MirrorDaemon start requested (pid=${child.pid ?? "unknown"})`);

  return {
    spawned: true,
    pid: child.pid ?? null,
    pidFilePath,
    alreadyRunning: false,
  };
}
