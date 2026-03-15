import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

const root = process.cwd();
const distRoot = path.join(root, "dist");
const packageArchive = path.join(distRoot, "mirror-runtime-linux.tar.gz");

async function assertPathExists(packageRoot: string, relativePath: string): Promise<void> {
  await fs.access(path.join(packageRoot, relativePath));
}

async function runMirrorHelp(packageRoot: string): Promise<void> {
  const entryModule = (await import(
    pathToFileURL(path.join(packageRoot, "dist", "mirror-entry.js")).href
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
      throw new Error(`mirror help failed: code=${code} output=${combinedOutput}`);
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

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

async function smokePackagedRuntime(packageRoot: string): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-package-"));
  const loreDir = path.join(tempRoot, "lore-scrolls");
  const memoryDbPath = path.join(tempRoot, "mirror-memory.sqlite");
  let service: MirrorService | undefined;

  try {
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = memoryDbPath;

    const moduleUrl = pathToFileURL(path.join(packageRoot, "dist", "mirror-package.js")).href;
    const mirrorPackage = (await import(moduleUrl)) as MirrorPackageModule;
    const fetchImpl: typeof fetch = async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "verify",
          object: "chat.completion",
          created: 1,
          model: "mirror-verify",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Packaged runtime OK." },
              finish_reason: "stop",
            },
          ],
        }),
      }) as Response;

    service = await mirrorPackage.startMirrorService(
      {
        port: 0,
        providerUrl: "http://mirror-verify.local/v1/chat/completions",
        providerAuthToken: "verify-token",
        loreDir,
        nodeId: "mirror-runtime-package-verify",
      },
      { fetchImpl },
    );

    const health = (await requestJsonFromApp(service.app, "GET", "/mirror/health")) as {
      product?: string;
    };
    if (health.product !== "mirror") {
      throw new Error("Packaged runtime health route did not return mirror identity");
    }
  } finally {
    await service?.shutdown();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function assertRepoIndependentPackage(packageRoot: string): Promise<void> {
  const nodeModulesPath = path.join(packageRoot, "node_modules");
  const nodeModulesStat = await fs.lstat(nodeModulesPath);
  if (!nodeModulesStat.isDirectory()) {
    throw new Error("Packaged runtime is missing a concrete node_modules directory");
  }
  if (nodeModulesStat.isSymbolicLink()) {
    throw new Error("Packaged runtime node_modules must not be a symlink");
  }
  const realNodeModulesPath = await fs.realpath(nodeModulesPath);
  const packageRootRealPath = await fs.realpath(packageRoot);
  if (!realNodeModulesPath.startsWith(`${packageRootRealPath}${path.sep}`)) {
    throw new Error("Packaged runtime node_modules resolves outside the extracted package root");
  }
}

async function prepareExtractedPackage(): Promise<{
  packageRoot: string;
  cleanup: () => Promise<void>;
}> {
  const extractionRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-runtime-dist-"));
  await tar.extract({ cwd: extractionRoot, file: packageArchive, gzip: true });

  const packageRoot = path.join(
    extractionRoot,
    "mirror-runtime-linux",
    "rootfs",
    "opt",
    "mirror-runtime",
  );

  return {
    packageRoot,
    cleanup: async () => {
      await fs.rm(extractionRoot, { recursive: true, force: true });
    },
  };
}

async function main(): Promise<void> {
  const extracted = await prepareExtractedPackage();
  try {
    await fs.access(
      path.join(extractionRootFromPackageRoot(extracted.packageRoot), "install-mirror-runtime.sh"),
    );
    await assertPathExists(extracted.packageRoot, path.join("bin", "mirror"));
    await assertPathExists(extracted.packageRoot, "mirror.mjs");
    await assertPathExists(extracted.packageRoot, "package.json");
    await assertPathExists(extracted.packageRoot, "node_modules");
    await assertPathExists(extracted.packageRoot, path.join("dist", "mirror-entry.js"));
    await assertPathExists(extracted.packageRoot, path.join("dist", "mirror-package.js"));
    await assertPathExists(extracted.packageRoot, path.join("dist", "schema.sql"));
    await assertPathExists(
      extracted.packageRoot,
      path.join("share", "examples", "mirror-runtime.env.example"),
    );
    await assertPathExists(
      extracted.packageRoot,
      path.join("share", "docs", "STANDALONE_BOUNDARY.md"),
    );
    await fs.access(
      path.join(
        extractionRootFromPackageRoot(extracted.packageRoot),
        "rootfs",
        "usr",
        "lib",
        "systemd",
        "user",
        "mirror-runtime.service",
      ),
    );

    await assertRepoIndependentPackage(extracted.packageRoot);
    await runMirrorHelp(extracted.packageRoot);
    await smokePackagedRuntime(extracted.packageRoot);
  } finally {
    await extracted.cleanup();
  }

  process.stdout.write("MIRROR_RUNTIME_DIST_VERIFY_OK\n");
}

function extractionRootFromPackageRoot(packageRoot: string): string {
  return path.resolve(packageRoot, "..", "..", "..");
}

void main().catch((error) => {
  console.error(
    "[verify-mirror-runtime-dist]",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
