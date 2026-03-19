import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMirrorOnboard } from "./onboard.js";
import { readMirrorEnvFile } from "./operator_env.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;
const originalFetch = global.fetch;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  global.fetch = originalFetch;
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

describe("mirror onboard", () => {
  it("writes config files, directories, and a user service in non-interactive mode", async () => {
    const home = await makeHome("mirror-onboard-");
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (target.endsWith("/api/tags")) {
        return { ok: true, json: async () => ({ models: [] }) } as Response;
      }
      if (target.includes("/getMe")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              id: 42,
              is_bot: true,
              username: "mirror_bot",
              first_name: "Mirror Bot",
            },
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${target}`);
    }) as unknown as typeof fetch;

    const output = await runMirrorOnboard({
      yes: true,
      providerMode: "ollama",
      providerUrl: "http://localhost:11434/v1/chat/completions",
      providerModel: "llama3",
      port: 8787,
      telegramMode: "configure",
      telegramToken: "telegram-token",
      installService: true,
      daemonReload: false,
    });

    const mirrorFile = await fs.readFile(
      path.join(home, ".mirror", "config", "mirror.json"),
      "utf8",
    );
    const providersFile = await fs.readFile(
      path.join(home, ".mirror", "config", "providers.json"),
      "utf8",
    );
    const connectorsFile = await fs.readFile(
      path.join(home, ".mirror", "config", "connectors.json"),
      "utf8",
    );
    const credentialsFile = await fs.readFile(
      path.join(home, ".mirror", "config", "credentials.json"),
      "utf8",
    );
    const env = await readMirrorEnvFile(
      path.join(home, ".config", "mirror-runtime", "mirror-runtime.env"),
    );
    const unitFile = await fs.readFile(
      path.join(home, ".config", "systemd", "user", "mirror-runtime.service"),
      "utf8",
    );

    expect(mirrorFile).toContain('"port": 8787');
    expect(providersFile).toContain('"kind": "ollama"');
    expect(providersFile).toContain('"model": "llama3"');
    expect(connectorsFile).toContain('"mode": "connectors"');
    expect(connectorsFile).toContain('"setup_state": "configured"');
    expect(credentialsFile).toContain('"telegram:default"');
    expect(env.MIRROR_WORKSPACE_ROOT).toBe(path.join(home, ".mirror", "workspace"));
    expect(env.MIRROR_PROVIDER_URL).toBeUndefined();
    expect(unitFile).toContain("ExecStart=");
    expect(unitFile).toContain("mirror-entry");

    await expect(
      fs.access(path.join(home, ".local", "share", "mirror-runtime", "mirror-home")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(home, ".local", "share", "mirror-runtime", "lore-scrolls")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(home, ".local", "share", "mirror-runtime", "logs")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(home, ".local", "share", "mirror-runtime", "cache")),
    ).resolves.toBeUndefined();

    expect(output).toContain("Mirror configuration summary");
    expect(output).toContain("mirror start");
    expect(output).toContain("mirror console");
  });

  it("allows provider setup to be skipped in non-interactive mode", async () => {
    const home = await makeHome("mirror-onboard-skip-");
    global.fetch = vi.fn(
      async () => ({ ok: false, json: async () => ({}) }) as Response,
    ) as unknown as typeof fetch;

    await runMirrorOnboard({
      yes: true,
      providerMode: "skip",
      port: 8787,
    });

    const providersFile = await fs.readFile(
      path.join(home, ".mirror", "config", "providers.json"),
      "utf8",
    );
    expect(providersFile).toContain('"providers": []');
  });
});
