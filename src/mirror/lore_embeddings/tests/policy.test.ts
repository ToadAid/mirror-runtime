import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256File } from "../../lore_manifest/hash.js";
import type { MirrorLoreManifest } from "../../lore_manifest/types.js";
import { buildLoreEmbeddingSources } from "../builder.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mirror-lore-embeddings-"));
  tempDirs.push(dir);
  return dir;
}

function createSigningPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

async function writeSignedManifest(params: {
  manifestPath: string;
  signaturePath: string;
  manifest: MirrorLoreManifest;
  privateKey: ReturnType<typeof createSigningPair>["privateKey"];
}): Promise<void> {
  const raw = JSON.stringify(params.manifest);
  await fs.writeFile(params.manifestPath, raw, "utf8");
  const signature = sign("sha256", Buffer.from(raw, "utf8"), params.privateKey);
  await fs.writeFile(params.signaturePath, signature.toString("base64"), "utf8");
}

describe("buildLoreEmbeddingSources", () => {
  it("accepts verified canonical files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });

    const canonicalFile = path.join(canonicalDir, "L001.md");
    await fs.writeFile(canonicalFile, "alpha\n", "utf8");

    const manifestPath = path.join(dir, "manifest.json");
    const signaturePath = path.join(dir, "manifest.json.sig");
    const { privateKey, publicKey } = createSigningPair();

    await writeSignedManifest({
      manifestPath,
      signaturePath,
      privateKey,
      manifest: {
        version: "2026-03-06",
        canonicalDir: "lore/canonical",
        scrolls: [{ path: "L001.md", sha256: await sha256File(canonicalFile) }],
      },
    });

    const sources = await buildLoreEmbeddingSources({
      canonicalDir,
      localDir,
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(sources).toEqual([
      {
        path: path.join(canonicalDir, "L001.md").split(path.sep).join("/"),
        trusted: true,
      },
    ]);
  });

  it("rejects mismatched canonical files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });

    const canonicalFile = path.join(canonicalDir, "L001.md");
    await fs.writeFile(canonicalFile, "alpha\n", "utf8");

    const manifestPath = path.join(dir, "manifest.json");
    const signaturePath = path.join(dir, "manifest.json.sig");
    const { privateKey, publicKey } = createSigningPair();

    await writeSignedManifest({
      manifestPath,
      signaturePath,
      privateKey,
      manifest: {
        version: "2026-03-06",
        canonicalDir: "lore/canonical",
        scrolls: [{ path: "L001.md", sha256: await sha256File(canonicalFile) }],
      },
    });

    await fs.writeFile(canonicalFile, "beta\n", "utf8");

    const sources = await buildLoreEmbeddingSources({
      canonicalDir,
      localDir,
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(sources).toContainEqual({
      path: path.join(canonicalDir, "L001.md").split(path.sep).join("/"),
      trusted: false,
      reason: "canonical_mismatch",
    });
  });

  it("rejects local lore files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });

    const canonicalFile = path.join(canonicalDir, "L001.md");
    const localFile = path.join(localDir, "LOCAL.md");
    await fs.writeFile(canonicalFile, "alpha\n", "utf8");
    await fs.writeFile(localFile, "local\n", "utf8");

    const manifestPath = path.join(dir, "manifest.json");
    const signaturePath = path.join(dir, "manifest.json.sig");
    const { privateKey, publicKey } = createSigningPair();

    await writeSignedManifest({
      manifestPath,
      signaturePath,
      privateKey,
      manifest: {
        version: "2026-03-06",
        canonicalDir: "lore/canonical",
        scrolls: [{ path: "L001.md", sha256: await sha256File(canonicalFile) }],
      },
    });

    const sources = await buildLoreEmbeddingSources({
      canonicalDir,
      localDir,
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(sources).toContainEqual({
      path: path.join(localDir, "LOCAL.md").split(path.sep).join("/"),
      trusted: false,
      reason: "local_lore_not_allowed",
    });
  });

  it("rejects missing canonical files", async () => {
    const dir = await createTempDir();
    const canonicalDir = path.join(dir, "canonical");
    const localDir = path.join(dir, "local");
    await fs.mkdir(canonicalDir, { recursive: true });
    await fs.mkdir(localDir, { recursive: true });

    const manifestPath = path.join(dir, "manifest.json");
    const signaturePath = path.join(dir, "manifest.json.sig");
    const { privateKey, publicKey } = createSigningPair();

    await writeSignedManifest({
      manifestPath,
      signaturePath,
      privateKey,
      manifest: {
        version: "2026-03-06",
        canonicalDir: "lore/canonical",
        scrolls: [
          {
            path: "L001.md",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
      },
    });

    const sources = await buildLoreEmbeddingSources({
      canonicalDir,
      localDir,
      manifestPath,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    });

    expect(sources).toContainEqual({
      path: path.join(canonicalDir, "L001.md").split(path.sep).join("/"),
      trusted: false,
      reason: "canonical_missing",
    });
  });
});
