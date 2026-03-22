import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type MirrorService = {
  app: { handle: (req: unknown, res: unknown) => void };
  port: number;
  shutdown: () => Promise<void>;
};

type MirrorPackageModule = {
  startMirrorService: (
    overrides?: Record<string, unknown>,
    deps?: {
      fetchImpl?: typeof fetch;
    },
  ) => Promise<MirrorService>;
};

type SmokeOptions = {
  runtimeRoot?: string;
};

function parseArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--runtime-root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --runtime-root");
      }
      options.runtimeRoot = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }
  return options;
}

async function loadMirrorPackageModule(runtimeRoot?: string): Promise<MirrorPackageModule> {
  if (!runtimeRoot) {
    return (await import("../dist/mirror-package.js")) as MirrorPackageModule;
  }
  const modulePath = path.join(runtimeRoot, "dist", "mirror-package.js");
  return (await import(pathToFileURL(modulePath).href)) as MirrorPackageModule;
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
    JSON.stringify(
      {
        "patience vault": ["TOBY_L1219_Rune3_PatienceVaultCancelled.md"],
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(path.join(indexDir, "SUPERSEDES.json"), "{}\n", "utf8");
  await fs.writeFile(path.join(indexDir, "FACT_UPDATES.md"), "# updates\n", "utf8");
}

async function requestJsonFromApp(
  app: { handle: (req: unknown, res: unknown) => void },
  method: string,
  url: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-ci-smoke-"));
  const loreDir = path.join(tempRoot, "lore-scrolls");
  const memoryDbPath = path.join(tempRoot, "mirror-memory.sqlite");
  let service: MirrorService | undefined;

  try {
    await seedLoreCorpus(loreDir);
    process.env.MIRROR_LORE_DIR = loreDir;
    process.env.MIRROR_MEMORY_DB_PATH = memoryDbPath;

    const mirrorPackage = await loadMirrorPackageModule(options.runtimeRoot);
    const fetchImpl: typeof fetch = async (_url, _init) =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          id: "smoke",
          object: "chat.completion",
          created: 1,
          model: "mirror-smoke",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Smoke path OK." },
              finish_reason: "stop",
            },
          ],
        }),
      }) as Response;

    service = await mirrorPackage.startMirrorService(
      {
        port: 0,
        providerUrl: "http://mirror-smoke.local/v1/chat/completions",
        providerAuthToken: "smoke-token",
        loreDir,
        nodeId: "mirror-ci-smoke",
      },
      { fetchImpl },
    );

    const health = (await requestJsonFromApp(service.app, "GET", "/mirror/health")) as {
      product?: string;
      service?: { node_id?: string };
    };
    if (health.product !== "mirror" || health.service?.node_id !== "mirror-ci-smoke") {
      throw new Error("Mirror smoke health payload did not match expected runtime identity");
    }

    const runtime = (await requestJsonFromApp(service.app, "GET", "/mirror/runtime")) as {
      node_id?: string;
    };
    if (runtime.node_id !== "mirror-ci-smoke") {
      throw new Error("Mirror smoke runtime payload did not match expected daemon identity");
    }

    const tools = (await requestJsonFromApp(service.app, "GET", "/mirror/tools")) as {
      tools?: Array<{ metadata?: { name?: string } }>;
    };
    if (!tools.tools?.some((tool) => tool.metadata?.name === "mirror.find-scroll")) {
      throw new Error("Mirror smoke tool registry did not expose mirror.find-scroll");
    }

    const chat = (await requestJsonFromApp(service.app, "POST", "/mirror/chat", {
      headers: {
        "content-type": "application/json",
      },
      body: {
        model: "mirror-smoke",
        messages: [{ role: "user", content: "What happened to the patience vault?" }],
      },
    })) as {
      response?: { choices?: Array<{ message?: { content?: string } }> };
    };
    if (chat.response?.choices?.[0]?.message?.content !== "Smoke path OK.") {
      throw new Error("Mirror smoke chat path did not return the expected provider response");
    }

    process.stdout.write("MIRROR_RUNTIME_SMOKE_OK\n");
  } finally {
    await service?.shutdown();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error("[mirror-smoke]", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
