import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadMirrorSettingsSync } from "../mirror-settings/index.js";
import { resolveLegacyMirrorRuntimeRoots } from "../mirror-user-workspace/workspace_summary.js";
import {
  resolveMirrorLogsRoot,
  resolveMirrorMemoryDbPath,
  resolveMirrorStateRoot,
  resolveMirrorWorkspaceLayout,
} from "./paths.js";

const execFileAsync = promisify(execFile);

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export type MirrorOperatorEnv = {
  envFilePath: string;
  workspaceRoot: string;
  loreDir: string;
  usersRoot: string;
  stateRoot: string;
  logsRoot: string;
  memoryDbPath: string;
  port: number;
  nodeId: string;
  providerUrl: string;
  providerToken: string;
  operatorToken: string | null;
  baseUrl: string | null;
};

function defaultNodeId(): string {
  return os.hostname() || "mirror-node-local";
}

export function resolveMirrorEnvFilePath(explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return path.resolve(trimmed);
  }
  const envPath = process.env.MIRROR_ENV_FILE?.trim();
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.join(os.homedir(), ".config", "mirror-runtime", "mirror-runtime.env");
}

export async function readMirrorEnvFile(
  filePath = resolveMirrorEnvFilePath(),
): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const values: Record<string, string> = {};
    for (const line of raw.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
    }
    return values;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function detectOllamaAvailability(
  baseUrl = "http://127.0.0.1:11434",
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function isPortInUse(port: number, host = "127.0.0.1"): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.code === "EADDRINUSE");
    });
    server.listen(port, host, () => {
      server.close(() => resolve(false));
    });
  });
}

export async function getMirrorServiceStatus(): Promise<{
  unitInstalled: boolean;
  enabled: boolean | null;
  active: boolean | null;
}> {
  const unitPath = path.join(os.homedir(), ".config", "systemd", "user", "mirror-runtime.service");
  let unitInstalled = true;
  try {
    await fs.access(unitPath);
  } catch {
    unitInstalled = false;
  }

  async function check(args: string[]): Promise<boolean | null> {
    try {
      await execFileAsync("systemctl", ["--user", ...args]);
      return true;
    } catch (error) {
      const stderr = stringifyUnknown((error as { stderr?: unknown }).stderr);
      if (stderr.includes("Failed to connect to bus")) {
        return null;
      }
      return false;
    }
  }

  return {
    unitInstalled,
    enabled: unitInstalled ? await check(["is-enabled", "mirror-runtime.service"]) : false,
    active: unitInstalled ? await check(["is-active", "mirror-runtime.service"]) : false,
  };
}

async function copyIfMissing(source: string, target: string): Promise<boolean> {
  try {
    await fs.access(source);
  } catch {
    return false;
  }
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(target);
      if (entries.length > 0) {
        return false;
      }
      await fs.rm(target, { recursive: true, force: true });
    } else {
      return false;
    }
  } catch {
    // missing
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const stat = await fs.stat(source);
  if (stat.isDirectory()) {
    await fs.cp(source, target, { recursive: true });
  } else {
    await fs.copyFile(source, target);
  }
  return true;
}

export async function ensureMirrorWorkspaceLayout(
  options: {
    homeRoot?: string;
    migrateLegacy?: boolean;
  } = {},
): Promise<{
  layout: ReturnType<typeof resolveMirrorWorkspaceLayout>;
  migrated: string[];
}> {
  const layout = resolveMirrorWorkspaceLayout();
  const migrated: string[] = [];
  await Promise.all([
    fs.mkdir(layout.home_root, { recursive: true }),
    fs.mkdir(layout.workspace_root, { recursive: true }),
    fs.mkdir(layout.users_root, { recursive: true }),
    fs.mkdir(layout.sessions_root, { recursive: true }),
    fs.mkdir(layout.tasks_root, { recursive: true }),
    fs.mkdir(layout.reminders_root, { recursive: true }),
    fs.mkdir(layout.heartbeat_root, { recursive: true }),
    fs.mkdir(layout.notes_root, { recursive: true }),
    fs.mkdir(layout.artifacts_root, { recursive: true }),
    fs.mkdir(layout.lore_root, { recursive: true }),
    fs.mkdir(layout.logs_root, { recursive: true }),
    fs.mkdir(layout.state_root, { recursive: true }),
    fs.mkdir(layout.config_root, { recursive: true }),
  ]);

  if (options.migrateLegacy !== false) {
    const legacy = resolveLegacyMirrorRuntimeRoots(
      options.homeRoot ?? process.env.HOME ?? os.homedir(),
    );
    if (await copyIfMissing(legacy.legacy_users_root, layout.users_root)) {
      migrated.push(`${legacy.legacy_users_root} -> ${layout.users_root}`);
    }
    if (await copyIfMissing(legacy.legacy_lore_root, layout.lore_root)) {
      migrated.push(`${legacy.legacy_lore_root} -> ${layout.lore_root}`);
    }
    if (await copyIfMissing(legacy.legacy_memory_db_path, layout.memory_db_path)) {
      migrated.push(`${legacy.legacy_memory_db_path} -> ${layout.memory_db_path}`);
    }
  }

  return { layout, migrated };
}

export async function ensureMirrorRuntimeSupportDirs(
  runtimeRoot = path.join(os.homedir(), ".local", "share", "mirror-runtime"),
): Promise<{
  root: string;
  mirror_home: string;
  lore_scrolls: string;
  logs: string;
  cache: string;
}> {
  const resolvedRoot = path.resolve(runtimeRoot);
  const layout = {
    root: resolvedRoot,
    mirror_home: path.join(resolvedRoot, "mirror-home"),
    lore_scrolls: path.join(resolvedRoot, "lore-scrolls"),
    logs: path.join(resolvedRoot, "logs"),
    cache: path.join(resolvedRoot, "cache"),
  };
  await Promise.all(
    Object.values(layout).map(async (target) => {
      await fs.mkdir(target, { recursive: true });
    }),
  );
  return layout;
}

export async function buildMirrorOperatorEnv(
  overrides: Partial<MirrorOperatorEnv> = {},
): Promise<MirrorOperatorEnv> {
  const settings = loadMirrorSettingsSync({
    overrides: {
      runtime: {
        port: overrides.port,
        node_id: overrides.nodeId,
        base_url: overrides.baseUrl,
        workspace_root: overrides.workspaceRoot,
      },
      provider: {
        url: overrides.providerUrl,
        token: overrides.providerToken,
      },
      operator_token: overrides.operatorToken,
    },
  });
  const workspaceRoot = overrides.workspaceRoot ?? settings.workspace.root;
  const usersRoot = overrides.usersRoot ?? settings.workspace.users_root;
  const loreDir = overrides.loreDir ?? settings.workspace.lore_dir;
  const stateRoot =
    overrides.stateRoot ?? settings.workspace.state_root ?? resolveMirrorStateRoot();
  const logsRoot = overrides.logsRoot ?? settings.workspace.logs_root ?? resolveMirrorLogsRoot();
  return {
    envFilePath: overrides.envFilePath ?? resolveMirrorEnvFilePath(),
    workspaceRoot,
    loreDir,
    usersRoot,
    stateRoot,
    logsRoot,
    memoryDbPath:
      overrides.memoryDbPath ??
      settings.workspace.memory_db_path ??
      path.join(stateRoot, path.basename(resolveMirrorMemoryDbPath())),
    port: settings.runtime.port,
    nodeId: overrides.nodeId ?? settings.runtime.node_id ?? defaultNodeId(),
    providerUrl: overrides.providerUrl ?? settings.provider.active?.url ?? "",
    providerToken: overrides.providerToken ?? settings.provider.active?.auth_token ?? "",
    operatorToken: overrides.operatorToken ?? settings.operator_token ?? null,
    baseUrl: overrides.baseUrl ?? settings.runtime.base_url ?? null,
  };
}

export async function writeMirrorOperatorEnvFile(env: MirrorOperatorEnv): Promise<void> {
  await fs.mkdir(path.dirname(env.envFilePath), { recursive: true });
  const lines = [
    "# Mirror Runtime environment",
    "# Generated by mirror onboard",
    "# Structured user-facing settings now live under ~/.mirror/config/",
    "",
    "# Bootstrap path overrides",
    `MIRROR_WORKSPACE_ROOT=${env.workspaceRoot}`,
    `MIRROR_USER_WORKSPACE_DIR=${env.usersRoot}`,
    `MIRROR_LORE_DIR=${env.loreDir}`,
    `MIRROR_STATE_DIR=${env.stateRoot}`,
    `MIRROR_LOG_DIR=${env.logsRoot}`,
    `MIRROR_MEMORY_DB_PATH=${env.memoryDbPath}`,
    "",
    "# Optional bootstrap/runtime overrides",
    "# MIRROR_PORT=7777",
    "# MIRROR_NODE_ID=mirror-node-local",
    env.baseUrl ? `# MIRROR_BASE_URL=${env.baseUrl}` : "# MIRROR_BASE_URL=https://mirror.example",
    env.operatorToken
      ? `# MIRROR_OPERATOR_TOKEN=${env.operatorToken}`
      : "# MIRROR_OPERATOR_TOKEN=replace-me",
    "",
  ];
  await fs.writeFile(env.envFilePath, `${lines.join("\n")}\n`, "utf8");
}
