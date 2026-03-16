import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultLorePolicy, resolveDefaultLoreRoot } from "../policy.js";

const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;
const originalHome = process.env.HOME;

afterEach(() => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
  } else {
    process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("resolveDefaultLoreRoot", () => {
  it("uses MIRROR_LORE_DIR when set", () => {
    process.env.MIRROR_LORE_DIR = "/tmp/custom-lore";

    expect(resolveDefaultLoreRoot()).toBe(path.resolve("/tmp/custom-lore"));
  });

  it("falls back to ~/.mirror/workspace/lore when MIRROR_LORE_DIR is unset", async () => {
    const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-test-home-"));
    process.env.HOME = homeRoot;
    delete process.env.MIRROR_LORE_DIR;

    expect(resolveDefaultLoreRoot()).toBe(path.join(homeRoot, ".mirror", "workspace", "lore"));
  });
});

describe("getDefaultLorePolicy", () => {
  it("aligns canonicalDir and localDir under the resolved lore root", () => {
    process.env.MIRROR_LORE_DIR = "/tmp/toby-lore";

    expect(getDefaultLorePolicy()).toEqual({
      canonicalDir: path.resolve("/tmp/toby-lore"),
      localDir: path.join(path.resolve("/tmp/toby-lore"), "local"),
      includeLocal: false,
    });
  });
});
