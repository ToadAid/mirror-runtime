import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMirrorOperatorEnv,
  ensureMirrorWorkspaceLayout,
  readMirrorEnvFile,
  writeMirrorOperatorEnvFile,
} from "./operator_env.js";

const tempDirs: string[] = [];
const originalHome = process.env.HOME;

afterEach(async () => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeHome(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  process.env.HOME = dir;
  return dir;
}

describe("mirror operator env", () => {
  it("creates the visible ~/.mirror workspace layout and migrates legacy lore/users roots", async () => {
    const home = await makeHome("mirror-operator-env-");
    const legacyUsersRoot = path.join(
      home,
      ".local",
      "share",
      "mirror-runtime",
      "mirror-home",
      "users",
    );
    const legacyLoreRoot = path.join(home, ".local", "share", "mirror-runtime", "lore-scrolls");
    const legacyStateRoot = path.join(home, ".local", "state", "mirror-runtime");
    await fs.mkdir(path.join(legacyUsersRoot, "local-user"), { recursive: true });
    await fs.mkdir(legacyLoreRoot, { recursive: true });
    await fs.mkdir(legacyStateRoot, { recursive: true });
    await fs.writeFile(path.join(legacyUsersRoot, "local-user", "profile.json"), "{}\n", "utf8");
    await fs.writeFile(path.join(legacyLoreRoot, "TOBY_L1_Scroll.md"), "# lore\n", "utf8");
    await fs.writeFile(path.join(legacyStateRoot, "mirror-memory.db"), "db", "utf8");

    const { layout, migrated } = await ensureMirrorWorkspaceLayout();

    expect(layout.workspace_root).toBe(path.join(home, ".mirror", "workspace"));
    expect(layout.users_root).toBe(path.join(home, ".mirror", "workspace", "users"));
    expect(layout.lore_root).toBe(path.join(home, ".mirror", "workspace", "lore"));
    expect(migrated.length).toBeGreaterThanOrEqual(2);
    await expect(
      fs.access(path.join(layout.users_root, "local-user", "profile.json")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(layout.lore_root, "TOBY_L1_Scroll.md")),
    ).resolves.toBeUndefined();
    await expect(fs.access(layout.memory_db_path)).resolves.toBeUndefined();
  });

  it("writes mirror onboard env files that point to ~/.mirror/workspace", async () => {
    const home = await makeHome("mirror-operator-env-write-");
    const env = await buildMirrorOperatorEnv({
      envFilePath: path.join(home, ".config", "mirror-runtime", "mirror-runtime.env"),
      providerUrl: "http://127.0.0.1:11434/v1/chat/completions",
      providerToken: "ollama",
      port: 17777,
    });

    await writeMirrorOperatorEnvFile(env);
    const saved = await readMirrorEnvFile(env.envFilePath);

    expect(saved.MIRROR_WORKSPACE_ROOT).toBe(path.join(home, ".mirror", "workspace"));
    expect(saved.MIRROR_USER_WORKSPACE_DIR).toBe(path.join(home, ".mirror", "workspace", "users"));
    expect(saved.MIRROR_LORE_DIR).toBe(path.join(home, ".mirror", "workspace", "lore"));
    expect(saved.MIRROR_MEMORY_DB_PATH).toBe(
      path.join(home, ".mirror", "state", "mirror-memory.db"),
    );
    expect(saved.MIRROR_PROVIDER_URL).toBeUndefined();
    expect(saved.MIRROR_PORT).toBeUndefined();
  });
});
