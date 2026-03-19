import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import * as tar from "tar";

type MirrorService = {
  app: { handle: (req: unknown, res: unknown) => void };
  shutdown: () => Promise<void>;
};

type MirrorPackageModule = {
  startMirrorService: (
    overrides?: Record<string, unknown>,
    deps?: { fetchImpl?: typeof fetch },
  ) => Promise<MirrorService>;
};

type MirrorEntryModule = {
  runMirrorEntry: (argv: string[]) => Promise<number>;
};

const execFileAsync = promisify(execFile);
const root = process.cwd();
const distRoot = path.join(root, "dist");
const packageArchive = path.join(distRoot, "mirror-runtime-linux.tar.gz");

async function seedLoreCorpus(loreDir: string): Promise<void> {
  const indexDir = path.join(loreDir, "_index");
  await fs.mkdir(indexDir, { recursive: true });
  await fs.writeFile(
    path.join(loreDir, "TOBY_L1219_Rune3_PatienceVaultCancelled.md"),
    [
      "---",
      "title: Rune3 Patience Vault Cancelled",
      "epoch: E3",
      "symbols: [♾️]",
      "sacred_numbers: [3]",
      "sha256_seed: TBD",
      "---",
      "",
      "# Rune3",
      "",
      "The Patience Vault was cancelled.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(indexDir, "KEYWORD_INDEX.json"),
    JSON.stringify({ "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"] }, null, 2),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

async function requestJsonFromApp(
  app: { handle: (req: unknown, res: unknown) => void },
  method: string,
  url: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const headers = { ...options.headers };
    const req = {
      method,
      url,
      path: url,
      headers,
      body: options.body,
      header(name: string) {
        const value = headers[name] ?? headers[name.toLowerCase()];
        return typeof value === "string" ? value : undefined;
      },
      on() {
        return undefined;
      },
    };
    const responseHeaders = new Map<string, string>();
    const res = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        responseHeaders.set(name.toLowerCase(), value);
      },
      getHeader(name: string) {
        return responseHeaders.get(name.toLowerCase());
      },
      removeHeader(name: string) {
        responseHeaders.delete(name.toLowerCase());
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        resolve(payload);
        return this;
      },
      send(payload: unknown) {
        resolve(payload);
        return this;
      },
      end(payload?: unknown) {
        resolve(payload);
        return this;
      },
    };

    try {
      app.handle(req, res);
    } catch (error) {
      reject(error);
    }
  });
}

function parseInstalledEnv(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    values[trimmed.slice(0, separatorIndex)] = trimmed.slice(separatorIndex + 1);
  }
  return values;
}

async function runInstalledMirrorHelp(runtimeRoot: string): Promise<void> {
  const entryModule = (await import(
    pathToFileURL(path.join(runtimeRoot, "dist", "mirror-entry.js")).href
  )) as MirrorEntryModule;
  let combinedOutput = "";
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const captureWrite = (chunk: string | Uint8Array) => {
    combinedOutput += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  };
  process.stdout.write = captureWrite as typeof process.stdout.write;
  process.stderr.write = captureWrite as typeof process.stderr.write;
  try {
    const code = await entryModule.runMirrorEntry(["node", "mirror", "help"]);
    if (code !== 0 || !combinedOutput.includes("Mirror Runtime")) {
      throw new Error(`installed mirror help failed: code=${code} output=${combinedOutput}`);
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

async function runInstalledMirrorOnboard(runtimeRoot: string): Promise<void> {
  const entryModule = (await import(
    pathToFileURL(path.join(runtimeRoot, "dist", "mirror-entry.js")).href
  )) as MirrorEntryModule;
  const code = await entryModule.runMirrorEntry(["node", "mirror", "onboard", "--yes"]);
  if (code !== 0) {
    throw new Error(`installed mirror onboard failed: code=${code}`);
  }
}

async function verifyInstalledRuntime(
  runtimeRoot: string,
  envFile: string,
  unitFile: string,
  homeRoot: string,
): Promise<void> {
  const envRaw = await fs.readFile(envFile, "utf8");
  const env = parseInstalledEnv(envRaw);
  if (env.MIRROR_LORE_DIR?.includes("%h") || env.MIRROR_MEMORY_DB_PATH?.includes("%h")) {
    throw new Error("bootstrap env file still contains unresolved systemd-style placeholders");
  }
  if (env.MIRROR_PROVIDER_URL || env.MIRROR_PROVIDER_AUTH_TOKEN) {
    throw new Error("bootstrap env file still contains provider settings");
  }

  const unitRaw = await fs.readFile(unitFile, "utf8");
  if (unitRaw.includes("@RUNTIME_ROOT@") || unitRaw.includes("@ENV_FILE@")) {
    throw new Error("bootstrap service unit still contains unresolved placeholders");
  }
  if (!unitRaw.includes(runtimeRoot) || !unitRaw.includes(envFile)) {
    throw new Error("bootstrap service unit does not reference the installed runtime root");
  }

  await runInstalledMirrorHelp(runtimeRoot);
  const originalHome = process.env.HOME;
  const originalCwd = process.cwd();
  let service: MirrorService | undefined;
  try {
    process.env.HOME = homeRoot;
    await runInstalledMirrorOnboard(runtimeRoot);

    const settingsRoot = path.join(homeRoot, ".mirror", "config");
    await fs.access(path.join(settingsRoot, "mirror.json"));
    await fs.access(path.join(settingsRoot, "providers.json"));
    await fs.access(path.join(settingsRoot, "connectors.json"));
    await fs.access(path.join(settingsRoot, "credentials.json"));

    await seedLoreCorpus(env.MIRROR_LORE_DIR);
    process.chdir(path.dirname(env.MIRROR_LORE_DIR));
    const mirrorPackage = (await import(
      pathToFileURL(path.join(runtimeRoot, "dist", "mirror-package.js")).href
    )) as MirrorPackageModule;
    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "bootstrap-verify",
          object: "chat.completion",
          created: 1,
          model: "mirror-bootstrap-verify",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Bootstrap path OK." },
              finish_reason: "stop",
            },
          ],
        }),
      }) as Response;

    service = await mirrorPackage.startMirrorService(
      {
        port: 0,
        loreDir: env.MIRROR_LORE_DIR,
      },
      { fetchImpl },
    );

    const health = (await requestJsonFromApp(service.app, "GET", "/mirror/health")) as {
      product?: string;
      service?: { node_id?: string };
    };
    if (health.product !== "mirror" || !health.service?.node_id) {
      throw new Error("installed runtime health payload did not match bootstrap env");
    }
  } finally {
    process.chdir(originalCwd);
    await service?.shutdown();
    process.env.HOME = originalHome;
  }
}

async function main(): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-bootstrap-"));
  try {
    await tar.extract({ cwd: tempRoot, file: packageArchive, gzip: true });

    const extractedRoot = path.join(tempRoot, "mirror-runtime-linux");
    const homeRoot = path.join(tempRoot, "home");
    const runtimeRoot = path.join(tempRoot, "installed", "opt", "mirror-runtime");
    const configDir = path.join(homeRoot, ".config", "mirror-runtime");
    const dataDir = path.join(homeRoot, ".mirror", "workspace");
    const stateDir = path.join(homeRoot, ".mirror", "state");
    const unitDir = path.join(homeRoot, ".config", "systemd", "user");
    const installerPath = path.join(extractedRoot, "install-mirror-runtime.sh");

    await execFileAsync(
      installerPath,
      [
        "--runtime-root",
        runtimeRoot,
        "--config-dir",
        configDir,
        "--data-dir",
        dataDir,
        "--state-dir",
        stateDir,
        "--unit-dir",
        unitDir,
        "--skip-systemctl",
        "--force",
      ],
      {
        env: {
          ...process.env,
          HOME: homeRoot,
        },
      },
    );

    const envFile = path.join(configDir, "mirror-runtime.env");
    const unitFile = path.join(unitDir, "mirror-runtime.service");
    await fs.access(runtimeRoot);
    await fs.access(path.join(runtimeRoot, "bin", "mirror"));
    await fs.access(path.join(runtimeRoot, "node_modules"));
    await fs.access(envFile);
    await fs.access(unitFile);

    await verifyInstalledRuntime(runtimeRoot, envFile, unitFile, homeRoot);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  process.stdout.write("MIRROR_RUNTIME_BOOTSTRAP_VERIFY_OK\n");
}

void main().catch((error) => {
  console.error(
    "[verify-mirror-runtime-bootstrap]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
