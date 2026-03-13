import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultLorePolicy, resolveDefaultLoreRoot } from "../policy.js";

const originalMirrorLoreDir = process.env.MIRROR_LORE_DIR;

afterEach(() => {
  if (originalMirrorLoreDir === undefined) {
    delete process.env.MIRROR_LORE_DIR;
    return;
  }

  process.env.MIRROR_LORE_DIR = originalMirrorLoreDir;
});

describe("resolveDefaultLoreRoot", () => {
  it("uses MIRROR_LORE_DIR when set", () => {
    process.env.MIRROR_LORE_DIR = "/tmp/custom-lore";

    expect(resolveDefaultLoreRoot()).toBe(path.resolve("/tmp/custom-lore"));
  });

  it("falls back to ./lore-scrolls when MIRROR_LORE_DIR is unset", () => {
    delete process.env.MIRROR_LORE_DIR;

    expect(resolveDefaultLoreRoot()).toBe(path.resolve("./lore-scrolls"));
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
