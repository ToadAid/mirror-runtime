import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function errorStderr(error: unknown): string {
  if (!error || typeof error !== "object" || !("stderr" in error)) {
    return "";
  }
  const stderr = error.stderr;
  return typeof stderr === "string" ? stderr : "";
}

export function resolveMirrorExecStart(explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }
  const envValue = process.env.MIRROR_SERVICE_EXEC_START?.trim();
  if (envValue) {
    return envValue;
  }
  const currentFile = fileURLToPath(import.meta.url);
  const entryPath = path.resolve(path.dirname(currentFile), "..", "mirror-entry.js");
  return `${shellEscape(process.execPath)} ${shellEscape(entryPath)} serve`;
}

export async function installMirrorUserService(params: {
  envFilePath: string;
  workingDirectory: string;
  execStart?: string;
  unitDir?: string;
  daemonReload?: boolean;
}): Promise<{
  unitPath: string;
  execStart: string;
  daemonReloaded: boolean | null;
}> {
  const unitDir = path.resolve(
    params.unitDir ?? path.join(os.homedir(), ".config", "systemd", "user"),
  );
  const unitPath = path.join(unitDir, "mirror-runtime.service");
  const execStart = resolveMirrorExecStart(params.execStart);

  const content = [
    "[Unit]",
    "Description=Mirror Runtime",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `EnvironmentFile=${params.envFilePath}`,
    `WorkingDirectory=${params.workingDirectory}`,
    `ExecStart=${execStart}`,
    "Restart=on-failure",
    "RestartSec=2",
    "NoNewPrivileges=true",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");

  await fs.mkdir(unitDir, { recursive: true });
  await fs.writeFile(unitPath, content, "utf8");

  if (params.daemonReload === false) {
    return {
      unitPath,
      execStart,
      daemonReloaded: false,
    };
  }

  try {
    await execFileAsync("systemctl", ["--user", "daemon-reload"]);
    return {
      unitPath,
      execStart,
      daemonReloaded: true,
    };
  } catch (error) {
    const stderr = errorStderr(error);
    if (stderr.includes("Failed to connect to bus")) {
      return {
        unitPath,
        execStart,
        daemonReloaded: null,
      };
    }
    return {
      unitPath,
      execStart,
      daemonReloaded: false,
    };
  }
}
